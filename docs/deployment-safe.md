# Безопасная выкладка admin/load release

## Подтверждённая исходная точка

- Production код: `843b921`, чистая ветка main, каталог `/opt/yandex-360-ai-assistant`.
- systemd: `yassistant.service`, `/usr/bin/npm start`, WorkingDirectory указан выше, User/Group пустые (root), DropInPaths пусто.
- Node 24.21.0 / npm 11.19.0; `/health` OK.
- Backup: `/root/yassistant-backups/20261019-162724`, 67 MiB. Проверены SHA `843b921` и совпадение production `.env` с `production.env` через cmp. Backup содержит прежние code/dist/node_modules/unit. Это не доказательство consistent backup произвольной live SQLite.

Не менять пользователя systemd, TLS, webhook, токен бота и архитектуру каталогов одновременно с этой выкладкой. Локальный `.env` с тестовым ботом/ngrok и Windows node_modules на сервер не копировать.

## Подготовка нового каталога — без переключения

Релиз публикуется отдельной веткой `release/admin-load-20261019`, не меняя main. После публикации использовать точный проверенный commit SHA; не считать движущуюся ветку immutable-релизом.

Каталог новой версии: `/opt/yassistant-releases/admin-load-20261019`. Если он уже существует, не удалять и не перезаписывать автоматически — выяснить состояние.

1. Clone ветки в новый каталог, проверить/зафиксировать SHA и detached checkout.
2. В новом каталоге выполнить `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke:release`, `npm audit --omit=dev`.
3. `smoke:release` сам принудительно выключает Messenger/Tracker/admin/LLM до импорта конфигурации, открывает только ephemeral loopback port, проверяет health и отсутствие webhook/admin routes. Не читает/не мигрирует рабочую analytics DB. Это offline smoke, не проверка реального API/бота.
4. Не выполнять `npm start`/`npm run dev` в новом каталоге и не копировать `.env` до успешных проверок. Старый сервис продолжает работать на 3002.

## До переключения

Подтвердить фактические `EnvironmentFiles`, `ExecStartPre`, `ExecStartPost` и доступность `.env`; перед публикацией вывода исключить Environment/секреты. Скопировать production `.env` в новый каталог с mode 0600, проверить cmp. Unit EnvironmentFile, если есть, может указывать на старый путь — не заменять его тестовым env.

Первый запуск нового кода — с **ENABLE_ADMIN=false** через отдельный systemd drop-in. Это позволяет сначала проверить бот/нагрузку без публикации админки и миграции БД. Кеш/диспетчер работают без админки. Включение админки — следующий отдельный шаг: production HTTPS, сильный пароль, ограничения доступа, `/var/lib/yassistant`, backup/миграция SQLite, затем проверка интерфейса.

Оригинальную папку `/opt/yandex-360-ai-assistant` не трогать: она остаётся быстрым rollback target. Не заменять её симлинком в этой итерации.

## Механизм переключения (сначала согласовать окно)

После успешных серверных проверок создать **новый, ранее не существовавший** drop-in:

`/etc/systemd/system/yassistant.service.d/90-admin-load-release.conf`

Содержимое:

```ini
[Service]
WorkingDirectory=/opt/yassistant-releases/admin-load-20261019
Environment=ENABLE_ADMIN=false
```

Указанные значения достаточны только при подтверждённом ExecStart `/usr/bin/npm start` без абсолютного пути к старому dist и без несовместимых ExecStartPre/Post. Если EnvironmentFile явно содержит `ENABLE_ADMIN=true`, он может перекрыть Environment=; сначала согласовать/исправить именно production config, не считать drop-in гарантированным override для EnvironmentFile. Исходный production env на старом коде не должен содержать включённую админку, но это нужно проверить без раскрытия секретов.

До `systemctl daemon-reload`/restart подготовить и сохранить rollback commands. Затем выполнить reload/restart и проверить service active, `/health`, журнал, реальный «Мой день», анализ доступной тестовой задачи и повторные обращения. Сам health не доказывает корректность токена/прав/качества ответа. При ошибках не продолжать настройку админки, а откатиться.

Короткая недоступность/рестарт планируются заранее: надёжной очереди webhook нет. Короткие ссылки сейчас в памяти и теряются при любом рестарте, в том числе rollback; новые ответы сгенерируют новые ссылки.

## Откат первой фазы

Поскольку старый каталог, его env/node_modules и исходный unit не менялись, для отката первой фазы достаточно остановить сервис, убрать **только созданный нами** drop-in, daemon-reload и запустить сервис. Не удалять другие drop-ins и не делать `git reset --hard`.

До выполнения сверить, что файл действительно создан в рамках этой выкладки:

```bash
systemctl stop yassistant
mv /etc/systemd/system/yassistant.service.d/90-admin-load-release.conf /root/yassistant-backups/20261019-162724/90-admin-load-release.failed.conf
systemctl daemon-reload
systemctl start yassistant
systemctl is-active yassistant
curl -fsS http://127.0.0.1:3002/health
```

Если rollback уже выполняли и целевой `.failed.conf` существует, не перезаписывать его вслепую: выбрать новое имя. Если drop-in отсутствует, сначала проверить фактическую конфигурацию, не продолжать команды предположительно.

Если менялись исходный unit/env/nginx или включалась миграция SQLite, этого rollback недостаточно: вернуть соответствующие backups. Для SQLite остановить процесс, убрать старые WAL/SHM из рабочего пути и восстановить совместимый snapshot. Новую analytics DB не удалять автоматически — в ней может быть полезная история.

## Статус

Пока не отмечены результаты серверных тестов и переключения в `todo.md`, считать подготовленным только локальный release. Никаких гарантий нагрузки 400 одновременных пользователей; реальные квоты/latency/ACL/webhook вопросы остаются открытыми. Не удалять старую папку и backup до подтверждения стабильности.
