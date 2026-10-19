# Один постоянный рабочий путь

## Цель

Для пользователя всегда один путь: **`/opt/yandex-360-ai-assistant`**. Это symlink на активный release. `.env`, Git и операционные команды доступны по одному адресу; release directories и legacy-копия нужны только для безопасной выкладки/отката.

До этой миграции:
- `/opt/yandex-360-ai-assistant` — обычный, неиспользуемый каталог старого кода 843b921;
- `/opt/yassistant-releases/admin-load-20261019` — активный main release с production `.env`;
- override `90-admin-load-release.conf` указывает на активный release напрямую.

После **STABLE_PATH_OK**:
- `/opt/yandex-360-ai-assistant` → `/opt/yassistant-releases/admin-load-20261019`;
- systemd WorkingDirectory — постоянный путь `/opt/yandex-360-ai-assistant`;
- старый каталог перемещён, не удалён: `/opt/yassistant-releases/legacy-843b921`;
- пароль и остальные значения `.env` остаются в том же файле активного release, без копирования legacy env;
- `/var/lib/yassistant/analytics.sqlite`, snapshots, backup service/timer не перемещаются и не меняются.

Это не утверждение, что миграция уже выполнена: актуальный статус отмечается в `todo.md` только по выводу сервера.

## Установка

Скачать **только ops** из проверенного pinned Git commit во временный root-only каталог, без checkout кода и без изменения `.env`. Выполнять от root:

```bash
bash ops/migrate-stable-path.sh --check
bash ops/migrate-stable-path.sh --apply
```

Это отдельный одноразовый инструмент для текущей подтверждённой структуры. При уже существующей ссылке/legacy destination, изменённом working tree, неожиданном пользователе/unit/env или неработающем сервисе он отказывается менять пути. Не обходить эти проверки вручную.

`--check` ничего в проекте не меняет (кроме временного lock file). Проверяет root, unit/PID/реальную cwd, git main, старый SHA, env/rollback files, здоровье и локальный admin 401.

`--apply` повторяет проверки, создаёт `/root/yassistant-backups/stable-path-<UTC>-<ns>` с конфигурацией, env и прежним rollback; готовит новый rollback до изменения путей; перемещает только неиспользуемый старый каталог; создаёт постоянную ссылку и меняет ровно WorkingDirectory в override. Все остальные флаги override, включая admin=true, сохраняются.

**Нормальный путь не перезапускает приложение:** работающий процесс и его реальная cwd остаются в том же активном release, systemd получает новый путь только через daemon-reload. До/после проверяются одинаковый MainPID, byte-for-byte env, health, admin 401 и main. Marker: `SERVICE_PID_UNCHANGED`, `STABLE_PATH_OK`. Старые короткие ссылки в памяти при успешном переходе не теряются.

При обычной ошибке после начала изменений trap пытается восстановить прежние каталоги/override/rollback. Исправный текущий процесс не трогает; restart используется только если при восстановлении сервис неактивен/не проходит health и эффективная WorkingDirectory уже вернулась к прежней. При SIGKILL/отказе питания автоматический trap невозможен: backup state остаётся, оператор должен проверить реальные пути перед любым повторным запуском.

## Новый откат

**Нельзя после миграции просто удалить drop-in:** основной unit сам указывает на постоянный путь, который теперь symlink на новый release. Простое удаление override уже не вернёт старый код.

Миграция сохраняет исходный скрипт как:
`/root/yassistant-backups/20261019-162724/rollback-before-stable-path.sh`.

В известный пользователю путь устанавливается новый wrapper:

```bash
bash /root/yassistant-backups/20261019-162724/rollback.sh
```

Он проверяет symlink/legacy SHA/override marker, останавливает сервис, **атомарно переключает ссылку на сохранённый legacy-843b921** и вызывает исходный rollback для восстановления исходного unit без override. Legacy использует собственный старый env; новая production `.env`/БД остаются нетронутыми в текущем release и `/var/lib` соответственно. Откат старого кода отключает новые функции админки/кеша, не удаляет их историю и не отменяет отдельный backup timer.

Откат содержит restart (в отличие от самой миграции), короткие ссылки из памяти потеряются. После будущих изменений release/legacy/override сначала обновлять и проверять этот wrapper, не удалять исходный rollback или legacy-каталог.

## Постоянные команды после подтверждённого перехода

```bash
cd /opt/yandex-360-ai-assistant
git status -sb
nano .env
```

После осознанного изменения env:

```bash
systemctl restart yassistant
systemctl is-active yassistant
```

Миграция сама не меняет содержимое `.env`; restart ради одного нового пути не требуется. Для следующих программных обновлений не делать слепой `git pull && npm ci` на работающем процессе. Сборка/тесты/backup и выбор release остаются частью безопасного deploy; постоянный путь избавляет пользователя от запоминания release directory names.

## Проверки инструмента

`bash -n` для обоих scripts; `node ops/test-stable-path.cjs` — изолированный mock-тест shell control flow: dry run, успешная миграция без stop/start/restart, сохранность env/legacy, явный legacy rollback и автоматическое восстановление после моделируемой ошибки daemon-reload. Команды systemctl/git/curl/permissions заменены фикстурами, это не проверка реальных прав/systemd. Настоящие preflight/health/PID checks выполняются на сервере.
