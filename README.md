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
npm run dev
```

## ENV

Смотри `.env.example`.

Ключевые переменные:
- `PORT`
- `ENABLE_YANDEX_MESSENGER=true`
- `YANDEX_MESSENGER_KEY=...`
- `YANDEX_WEBHOOK_SECRET=...`
- `ENABLE_YANDEX_TRACKER=true`
- `YANDEX_TRACKER_OAUTH_TOKEN=...`
- `YANDEX_TRACKER_ORG_ID=...` или `YANDEX_TRACKER_CLOUD_ORG_ID=...`

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
