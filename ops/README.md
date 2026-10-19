# Production analytics backups (Ubuntu 24.04 / systemd)

Отдельная операция: не переключает release, не изменяет `.env`/nginx и не перезапускает `yassistant`.

## Файлы и размещение

- `install-analytics-backup.sh` — однократная установка от root; существующие target files не перезаписывает. Аргумент — путь к `dist/tools/analytics-backup.js` проверенного релиза.
- `/usr/local/lib/yassistant/analytics-backup.js` — копия standalone Node helper из release. Не зависит от node_modules, dotenv, app init, текущего release symlink или AnalyticsStore.
- `/usr/local/lib/yassistant/check-analytics-backup.cjs` — read-only проверка `PRAGMA integrity_check` и наличия трёх таблиц аналитики, без вывода данных/секретов.
- `/usr/local/sbin/yassistant-analytics-backup` — wrapper, singleton flock, umask 077, consistent snapshot + validation + atomic rename + rotation.
- `/etc/systemd/system/yassistant-analytics-backup.{service,timer}` — root oneshot с ограниченными writable paths; каждый день **03:15 UTC**, точность до минуты. Persistent timer наверстает пропущенный запуск при следующей активации.
- Snapshot files: `/var/backups/yassistant/analytics-*.sqlite`, каталог 0700, файлы 0600. Срок хранения **14×24 часа** по mtime, не ровно 14 файлов. Ручной ранее созданный `analytics-*.sqlite` тоже попадёт под эту ротацию через 14 дней.

## Установка

Сначала проверить вручную backup production DB. Installer требует `/usr/bin/node` с node:sqlite и flock/systemd; исходная БД должна уже существовать. Если что-то уже установлено — остановиться и изучить конфигурацию, не удалять файлы вслепую ради повторного запуска.

Скачать `ops` только из явно указанного опубликованного Git commit в отдельный root-only каталог, не делать checkout/pull работающего release. Пример вызова из этого каталога:

```bash
bash ops/install-analytics-backup.sh /opt/yassistant-releases/admin-load-20261019/dist/tools/analytics-backup.js
```

Installer копирует standalone helper, проверяет units, выполняет **реальный пробный backup через тот же systemd service и sandbox**. Только при успехе включает timer. Marker: `AUTOBACKUP_READY`. Это не подтверждение до выполнения на Ubuntu: локально проверяются shell syntax/Node checker, systemd и production paths — на сервере.

Если установка остановилась, бот не перезапускается. Некоторые новые backup files/units могут уже быть установлены: сначала изучить ошибку/журнал, не повторять с удалением защиты от перезаписи. Шаблонный marker не означает отсутствия частично установленных файлов.

## Проверки

```bash
systemctl list-timers yassistant-analytics-backup.timer --no-pager
systemctl show yassistant-analytics-backup.service --no-pager -p Result -p ExecMainStatus
journalctl -u yassistant-analytics-backup.service -n 30 --no-pager
ls -lh /var/backups/yassistant
```

Ожидается следующий запуск, Result=success, ExecMainStatus=0 и `BACKUP_VERIFIED`. Ручной запуск через тот же sandbox:

```bash
systemctl start yassistant-analytics-backup.service
```

При конкурирующем запуске wrapper печатает `BACKUP_SKIPPED_ALREADY_RUNNING`. Защита flock касается wrapper, не произвольного ручного вызова Node helper.

## Безопасность и сбои

- Новый файл сначала `.sqlite.partial`; готовым становится только после проверки и rename. Обычные ошибки/TERM удаляют только partial текущего запуска, не рабочую БД и не старые snapshots. При SIGKILL/потере питания partial может остаться; автоматически не объявлять его исправной копией и не удалять без проверки.
- Старые `analytics-*.sqlite` удаляются **только после нового успешного snapshot**. Find не рекурсивен, не следует symlink, не трогает config/другие файлы.
- Перед snapshot есть оценка свободного места: main DB + WAL + запас 512 MiB. Это не гарантия против конкурентного роста, квота или полноценный мониторинг диска. При нехватке места старые backup автоматически не удаляются, job завершается ошибкой; требуется оператор.
- SQL helper использует `VACUUM INTO`; не открывает AnalyticsStore, не мигрирует schema и не помечает живые обращения interrupted. SQLite source может требовать записи WAL/SHM, поэтому service явно допускает `/var/lib/yassistant` в ReadWritePaths, помимо snapshot dir и lock dir.
- TimeoutStartSec=10min. Ошибки видны в systemd/journal; автоматические внешние уведомления пока не настроены. Периодически проверять Result, timestamp и диск.
- Здесь **локальные копии на том же диске/сервере**: не защита от потери VPS, компрометации root или шифровальщика. Нужна отдельная согласованная зашифрованная off-site копия; описания пользователей/события являются персональными данными.
- Это backup БД аналитики, не `.env`, nginx/systemd, исходников и не данных самого Tracker. Retention snapshots 14 дней может продлить фактическое хранение записей сверх 90 дней в основной БД; согласовать политику компании.
- Integrity check не заменяет проверку полного восстановления: отдельно восстановить копию в изолированную среду с отключёнными интеграциями и проверить историю. Не заменять live SQLite при работающем боте, не забывать WAL/SHM.

## Постоянный путь приложения (отдельная операция)

`migrate-stable-path.sh` и `rollback-stable-path.sh` реализуют переход на один пользовательский путь `/opt/yandex-360-ai-assistant` без изменения runtime-кода/env/БД и с обновлением rollback. **Не запускать как часть установки backup timer.** Preflight отказывается менять неожиданное состояние; нормальный путь не рестартует бота и проверяет неизменность PID. Порядок/ограничения: [docs/stable-working-path.md](../docs/stable-working-path.md). Mock-тест отдельно: `node ops/test-stable-path.cjs`, shell syntax: `bash -n ops/migrate-stable-path.sh`, `bash -n ops/rollback-stable-path.sh`.

## Отключение расписания

```bash
systemctl disable --now yassistant-analytics-backup.timer
```

Это не удаляет snapshots и не останавливает бота. Если backup service уже выполняется и его нужно остановить отдельно: `systemctl stop yassistant-analytics-backup.service`.
