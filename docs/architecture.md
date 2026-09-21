# Architecture Draft — Yandex 360 AI Assistant

## Архитектурная цель
Построить платформу, где интерфейсы, AI-ядро и интеграции разделены, чтобы продукт можно было масштабировать без переписывания всего под каждого нового клиента или канал.

---

## 1. High-Level Architecture

```text
Interfaces
├── Yandex Messenger Bot
├── Web Chat
└── Admin Panel

Core Platform
├── Auth / Organizations
├── Tracker Sync Engine
├── Data Store
├── Analytics Engine
├── Digest Engine
├── Health Engine
├── Query Engine
├── LLM Orchestrator
└── Permissions Layer

Integrations
└── Yandex Tracker
```

---

## 2. Архитектурный принцип для MVP

На MVP строим **platform core first**.

То есть:
- Messenger не содержит бизнес-логику;
- бизнес-логика живет в core services;
- интеграция с Tracker изолирована в отдельном слое;
- любые будущие интерфейсы переиспользуют те же core use cases.

---

## 3. Целевые модули MVP

## 3.1 Interfaces Layer

### `interfaces/yandex-messenger`
Ответственность:
- принимать webhook;
- нормализовывать входящие события;
- передавать команды / intents в core;
- отправлять сообщения обратно.

### `interfaces/http`
Ответственность:
- health endpoints;
- позже onboarding endpoints;
- позже admin endpoints.

---

## 3.2 Core Layer

### `core/organizations`
Сущности:
- organization
- installation
- settings
- connected integrations

Задачи:
- хранение tenant-конфигурации;
- настройки digest / health / timezone / enabled queues.

### `core/tracker-sync`
Задачи:
- получать данные из Tracker API;
- делать initial sync;
- делать incremental sync;
- сохранять raw + normalized data.

### `core/issues`
Сущности:
- issue
- issue status
- assignee
- deadline
- labels
- links
- comments
- status changes

### `core/analytics`
Задачи:
- считать метрики и признаки;
- находить просрочки;
- находить stale tasks;
- считать workload;
- определять risk flags.

### `core/digest`
Задачи:
- формировать daily summaries;
- подготавливать персонализированные digest по ролям;
- передавать в интерфейсы.

### `core/health`
Задачи:
- считать health score;
- объяснять причины;
- формировать weekly summary.

### `core/query`
Задачи:
- поддерживать intent-based Q&A;
- маппить вопросы пользователя на use cases;
- возвращать explainable structured responses.

### `core/llm`
Задачи:
- превращать структурированные выводы в хороший natural language;
- позже поддерживать retrieval и reasoning поверх company memory.

### `core/permissions`
Задачи:
- ограничивать ответы по доступам;
- учитывать scope пользователя / команды / организации.

---

## 3.3 Integration Layer

### `integrations/yandex-tracker`
Задачи:
- auth / credentials handling;
- API client;
- entity mapping;
- pagination / retries / rate limits;
- webhooks or polling strategy if available.

---

## 4. Data Model Draft

## Tenant entities
- Organization
- OrganizationIntegration
- OrganizationUser
- UserChannelBinding
- QueueScope
- ProjectScope
- DigestSubscription

## Tracker entities
- TrackerQueue
- TrackerProject
- TrackerIssue
- TrackerComment
- TrackerIssueHistoryEvent
- TrackerUser
- TrackerStatus
- TrackerLink

## Derived entities
- IssueRiskSnapshot
- TeamHealthSnapshot
- UserDigestSnapshot
- ManagerDigestSnapshot
- QueryLog

---

## 5. Поток данных MVP

### 1. Onboarding
- организация подключает Tracker;
- выбирает очереди / проекты;
- выбирает пользователей / роли / каналы.

### 2. Sync
- initial sync тянет базовый набор сущностей;
- данные сохраняются в normalized tables;
- запускаются вычисления derived metrics.

### 3. Analytics
- регулярные jobs считают:
  - overdue;
  - stale;
  - blocked;
  - workload;
  - cycle-related proxies;
  - risk indicators.

### 4. Delivery
- digest engine собирает summary;
- health engine собирает weekly review;
- messenger interface доставляет сообщение.

### 5. User Query
- пользователь задает вопрос;
- query engine определяет intent;
- достает данные из normalized store / snapshots;
- llm formatter превращает ответ в человекочитаемый текст.

---

## 6. Почему не делать сразу full-agent
Потому что на старте важнее:
- надежность;
- explainability;
- контроль качества;
- предсказуемость ответов.

Поэтому MVP лучше строить как:
- structured analytics;
- deterministic query layer;
- LLM mainly for summarization and phrasing.

Это снизит галлюцинации и повысит доверие бизнеса.

---

## 7. Tech Recommendation

## Рекомендуемый стек для следующего этапа
- TypeScript
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
- OpenAI-compatible LLM provider

## Почему так
- NestJS хорошо подходит для модульной платформы;
- TypeScript нужен для масштаба и понятных контрактов;
- PostgreSQL + Prisma — хороший базовый выбор;
- Redis + BullMQ — для sync / digest / health jobs.

---

## 8. Этапы реализации

### Phase 1
- domain design
- TypeScript migration
- module skeleton
- organizations + settings model
- tracker integration contract

### Phase 2
- tracker sync MVP
- normalized storage
- analytics rules
- daily digest generation

### Phase 3
- weekly health
- messenger Q&A
- admin onboarding

### Phase 4
- LLM summaries
- explainability improvements
- multi-tenant hardening

---

## 9. Нефункциональные требования

### Масштабируемость
- multi-tenant by design;
- queue-based background jobs;
- isolated integration layer.

### Надежность
- retry policies;
- idempotent sync jobs;
- dedupe for inbound events;
- audit logs.

### Безопасность
- encrypted secrets;
- tenant isolation;
- permission-aware querying;
- no cross-tenant context leakage.

### Наблюдаемость
- structured logs;
- sync job statuses;
- metrics for digest delivery and query latency.

---

## 10. Sync Foundation — следующий обязательный слой

После появления рабочего модуля `Мой день` следующий приоритет — не улучшение bot UX, а построение `Tracker Core`, на котором будут стоять digest, health и explainable AI-ответы.

### Цель слоя
Сделать foundation, который умеет:
- подключать организацию к Tracker;
- хранить tenant-scoped конфигурацию;
- синхронизировать данные Tracker в локальное хранилище;
- разделять raw / normalized / derived data;
- давать устойчивую базу для аналитики и AI.

### Принцип реализации
Сначала фиксируем модели и pipeline, потом кодим persistence и jobs.

---

## 11. Domain / Storage Model for Tracker Core

### 11.1 Tenant / platform entities

#### `Organization`
Хранит клиента/tenant.
Поля верхнего уровня:
- `id`
- `slug`
- `name`
- `status`
- `timezone`
- `createdAt`
- `updatedAt`

#### `OrganizationIntegration`
Конкретное подключение интеграции для организации.
Для MVP достаточно одного типа: `yandex-tracker`.
Поля:
- `id`
- `organizationId`
- `type`
- `status`
- `authMode`
- `tokenRef` / secret reference
- `orgHeaderName`
- `orgHeaderValue`
- `apiBaseUrl`
- `createdAt`
- `updatedAt`
- `lastValidatedAt?`

#### `OrganizationMember`
Внутреннее представление пользователя внутри tenant.
Поля:
- `id`
- `organizationId`
- `externalLogin`
- `displayName?`
- `email?`
- `role`
- `isActive`

#### `UserChannelBinding`
Связка пользователя платформы с каналом доставки.
Для MVP важно связать Messenger identity с login.
Поля:
- `id`
- `organizationId`
- `organizationMemberId`
- `channelType`
- `channelUserId?`
- `channelLogin?`
- `isVerified`

#### `SyncScope`
Что именно синхронизируем для организации.
Поля:
- `id`
- `organizationId`
- `integrationId`
- `scopeType` (`queue`, `project`, later `board`)
- `scopeExternalId`
- `scopeKey?`
- `enabled`

### 11.2 Raw layer
Raw layer нужен для аудита, повторного маппинга и безопасной эволюции схем.

#### `RawTrackerEntity`
Универсальная таблица/коллекция сырых payload.
Поля:
- `id`
- `organizationId`
- `integrationId`
- `entityType` (`issue`, `comment`, `changelog`, `queue`, `project`, `user`, `status`)
- `externalId`
- `externalParentId?`
- `payload`
- `fetchedAt`
- `sourceCursor?`
- `checksum?`

### 11.3 Normalized layer

#### `TrackerAccount`
Пользователь Tracker в нормализованном виде.
Поля:
- `id`
- `organizationId`
- `trackerUserId`
- `login`
- `display`
- `email?`
- `cloudUid?`
- `isActive`
- `rawRefId?`

#### `TrackerQueue`
Поля:
- `id`
- `organizationId`
- `trackerQueueId`
- `key`
- `name`
- `leadLogin?`
- `isArchived?`
- `rawRefId?`

#### `TrackerProject`
Поля:
- `id`
- `organizationId`
- `trackerProjectId`
- `key?`
- `name`
- `status?`
- `rawRefId?`

#### `TrackerStatus`
Поля:
- `id`
- `organizationId`
- `trackerStatusId`
- `key?`
- `name`
- `type`
- `rawRefId?`

#### `TrackerIssue`
Главная нормализованная сущность.
Поля MVP:
- `id`
- `organizationId`
- `trackerIssueId`
- `key`
- `summary`
- `descriptionText?`
- `queueId?`
- `projectId?`
- `statusId?`
- `statusType?`
- `priorityKey?`
- `typeKey?`
- `assigneeTrackerUserId?`
- `createdByTrackerUserId?`
- `updatedByTrackerUserId?`
- `createdAt`
- `updatedAt`
- `lastCommentUpdatedAt?`
- `deadline?`
- `startDate?`
- `previousStatusKey?`
- `pendingReplyFromJson?` — только raw-данные; не использовать для аналитики ожидания и определения владельца следующего шага
- `followersJson?`
- `customFieldsJson?`
- `slaJson?`
- `rawRefId?`

#### `TrackerComment`
Поля:
- `id`
- `organizationId`
- `trackerCommentId`
- `trackerIssueId`
- `authorTrackerUserId?`
- `updatedByTrackerUserId?`
- `text`
- `textHtml?`
- `transport?`
- `type?`
- `summoneesJson?`
- `createdAt`
- `updatedAt`
- `rawRefId?`

#### `TrackerIssueChange`
Нормализованный changelog event.
Поля:
- `id`
- `organizationId`
- `trackerChangeId`
- `trackerIssueId`
- `updatedByTrackerUserId?`
- `type`
- `transport?`
- `updatedAt`
- `fieldsJson?`
- `commentsJson?`
- `executedTriggersJson?`
- `rawRefId?`

### 11.4 Derived layer

#### `IssueRiskSnapshot`
Снимок риска по задаче.
Примеры полей:
- `organizationId`
- `trackerIssueId`
- `calculatedAt`
- `riskFlagsJson`
- `score`
- `explanationJson`

#### `UserDigestSnapshot`
Подготовленная персональная сводка.

#### `ManagerDigestSnapshot`
Подготовленная managerial сводка.

#### `TeamHealthSnapshot`
Недельный снимок здоровья команды/очереди/проекта.

### 11.5 Sync state / cursors

#### `IntegrationSyncState`
Состояние sync по интеграции и типу сущности.
Поля:
- `id`
- `organizationId`
- `integrationId`
- `entityType`
- `scopeKey?`
- `syncMode` (`initial`, `incremental`, `backfill`)
- `cursorValue?`
- `cursorMetaJson?`
- `lastSuccessAt?`
- `lastFailureAt?`
- `lastErrorMessage?`

#### `IssueChildSyncState`
Нужен для comments/changelog на уровне задачи.
Поля:
- `id`
- `organizationId`
- `trackerIssueId`
- `commentsCursor?`
- `changelogCursor?`
- `lastCommentsSyncAt?`
- `lastChangelogSyncAt?`

### 11.6 Практические решения на текущий момент
- Для MVP проектируем систему как `multi-tenant by design`, даже если первый пилот будет single-tenant.
- На первом этапе допускается ручной onboarding через env / config / seed without full admin UI.
- `Мой день` может продолжать работать напрямую через live API, пока foundation строится параллельно.
- Для sync сначала допускается ограниченный pilot scope по выбранным очередям.
- Custom fields и SLA не нормализуем полностью на первом этапе; сохраняем их в JSON + raw payload.

---

## 12. Что делаем прямо сейчас
Для ближайшего engineering этапа достаточно:
1. зафиксировать model layer и sync assumptions;
2. расширить Tracker API contract до полного sync scope;
3. спроектировать multi-tenant + onboarding + cursors;
4. затем переходить к DB schema и sync implementation.
