# Backend Structure

## Цель
Заложить модульный backend, который можно безболезненно наращивать от MVP к полноценной AI-платформе.

## Текущая структура

```text
src/
  app.ts
  main.ts
  config/
    env.ts
  interfaces/
    http/
      health.router.ts
    yandex-messenger/
      yandex-messenger.router.ts
      yandex-messenger.client.ts
      yandex-messenger.sender.ts
      yandex-messenger.incoming.ts
      yandex-messenger.types.ts
  core/
    assistant/
      application/
        assistant.service.ts
      presentation/
        assistant.formatters.ts
    organizations/
      domain/
        organization.types.ts
    tracker/
      application/
        tracker-sync.service.ts
    digest/
      application/
        digest.service.ts
    health/
      application/
        health.service.ts
    query/
      application/
        query.service.ts
    platform/
      application/
        platform-status.service.ts
  shared/
    utils/
      dedupe-store.ts
      http.ts
      text.ts
```

## Принцип
- `interfaces` — вход/выход из системы
- `core` — продуктовая логика
- `shared` — общие утилиты

## Что будет следующим шагом
1. Добавить `integrations/yandex-tracker`
2. Добавить persistence layer
3. Вынести use cases по onboarding / sync / digest jobs
4. Добавить scheduler и background workers
5. Подготовить multi-tenant сущности
