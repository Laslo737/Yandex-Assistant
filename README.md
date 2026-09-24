# Yandex 360 AI Assistant Platform

Платформенный каркас для будущего AI Assistant внутри экосистемы Yandex 360.

## Идея

Это не просто бот для Yandex Messenger.

Цель проекта — построить AI-платформу, которая:
- подключается к Yandex Tracker и другим сервисам Yandex 360;
- синхронизирует и индексирует данные компании;
- отвечает на вопросы сотрудников и руководителей;
- сама присылает digest, health check, риски и рекомендации;
- использует Messenger как первый интерфейс, а не как весь продукт.

## Что сейчас в репозитории

Чистый платформенный scaffold:
- TypeScript backend
- модульная структура `interfaces / core / shared`
- `/health`
- webhook endpoint для Yandex Messenger: `/api/interfaces/yandex-messenger/webhook`
- fast-ack обработка webhook
- dedupe входящих событий
- базовые сервисы под `digest / health / query / tracker sync`

## Старт

```bash
npm install
cp .env.example .env
npm start
```

Для разработки с автоматической перезагрузкой:

```bash
npm run dev
```

## ENV

Смотри `.env.example`. Секреты следует хранить только в `.env` или в менеджере
секретов сервера; файл `.env` исключён из Git.

Основные переменные:
- `PORT` — внутренний порт HTTP-сервера, по умолчанию `3002`;
- `NODE_ENV` — `production` на VPS;
- `APP_PUBLIC_BASE_URL` — публичный HTTPS URL, обслуживаемый nginx;
- `YANDEX_API_BASE_URL`, `YANDEX_TRACKER_API_BASE_URL`, `YANDEX_TRACKER_WEB_BASE_URL`, `OPENROUTER_BASE_URL` — URL внешних сервисов.

При `ENABLE_YANDEX_MESSENGER=true` нужны `YANDEX_MESSENGER_KEY` и **обязательный**
`YANDEX_WEBHOOK_SECRET` (без него приложение не запустится). Ответы по задачам доступны
только в личном чате. Бот теперь проверяет права пользователя через Tracker перед
выдачей данных; задачи с компонентами на текущем этапе отклоняются. Включать бота
для организации только после проверки контракта `fields=...` и ACL на реальных
тестовых пользователях (см. `todo.md`). При `ENABLE_YANDEX_TRACKER=true` нужны
`YANDEX_TRACKER_OAUTH_TOKEN` и одна из переменных `YANDEX_TRACKER_ORG_ID` или
`YANDEX_TRACKER_CLOUD_ORG_ID`. При `LLM_PROVIDER=openrouter` нужен
`OPENROUTER_API_KEY`. Полный перечень и безопасные значения по умолчанию приведены
в `.env.example`.

## Deployment

Целевое окружение: Ubuntu 24.04, Node.js 24.21.0 и npm 11.19.0. Приложение
слушает только `127.0.0.1:${PORT}` (`127.0.0.1:3002` по умолчанию), поэтому
публичный доступ должен идти через nginx reverse proxy.

### Установка в `/opt`

```bash
sudo mkdir -p /opt/yandex-360-ai-assistant
sudo chown "$USER":"$USER" /opt/yandex-360-ai-assistant
cd /opt/yandex-360-ai-assistant
# скопируйте или клонируйте сюда репозиторий
npm install
cp .env.example .env
nano .env
npm run build
npm start
```

Проверка после запуска:

```bash
curl http://127.0.0.1:3002/health
```

В конфигурации nginx используйте upstream `http://127.0.0.1:3002` (или порт из
`PORT`). Сам сервис не следует открывать на `0.0.0.0`.

### systemd

Создайте `/etc/systemd/system/yandex-360-ai-assistant.service`:

```ini
[Unit]
Description=Yandex 360 AI Assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/yandex-360-ai-assistant
EnvironmentFile=/opt/yandex-360-ai-assistant/.env
ExecStart=/usr/bin/node /opt/yandex-360-ai-assistant/dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Перед первым запуском выдайте `www-data` права чтения каталога и `.env`, затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yandex-360-ai-assistant
sudo systemctl status yandex-360-ai-assistant
```

Сервис не пишет постоянные данные в каталог проекта. Dedupe-кэш и короткие ссылки
сейчас хранятся только в памяти и сбрасываются при перезапуске; если их потребуется
сохранять, следует подключить внешнее постоянное хранилище.

## Документы
- `docs/mvp.md`
- `docs/architecture.md`
- `docs/backend-structure.md`
- `docs/tracker-integration-checklist.md`
- `docs/tracker-api-contract.md`

## Следующие шаги

1. Подтвердить endpoint списка задач и его пагинацию
2. Подтвердить endpoint'ы комментариев и истории задач
3. Расширить `integrations/yandex-tracker` до sync-ready клиента
4. Добавить persistence layer и multi-tenant model
5. Сделать sync jobs и analytics snapshots
6. Реализовать digest + health MVP поверх реальных данных
