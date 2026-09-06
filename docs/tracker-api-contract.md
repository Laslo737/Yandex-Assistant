# Yandex Tracker API Contract — MVP Draft

## Подтверждено
На текущем этапе подтверждены следующие моменты по Yandex Tracker API:
- часть ниже подтверждена реальным рабочим запросом пользователя;
- часть подтверждена документацией и примерами, присланными пользователем в рамках текущей сессии.

### Base URL
- `https://api.tracker.yandex.net`

### Auth
- `Authorization: OAuth <token>`

### Organization header
Нужен один из заголовков:
- `X-Org-ID: <org-id>`
- `X-Cloud-Org-ID: <cloud-org-id>`

### Рабочий реальный пример
Подтвержден рабочий запрос получения задачи:
- `GET /v3/issues/CLIENTSERVICE-877`
- headers:
  - `Authorization: OAuth ...`
  - `X-Org-ID: ...`

Подтвержденные реальные поля из ответа задачи:
- базовые: `id`, `key`, `version`, `summary`, `description`, `createdAt`, `updatedAt`, `lastCommentUpdatedAt`
- статусные: `status`, `previousStatus`, `statusType`, `statusStartTime`
- пользователи: `createdBy`, `updatedBy`, `assignee`, `followers`, `previousStatusLastAssignee`
- организационные: `queue`, `type`, `priority`, `boards`, `project?`
- служебные/доп.: `favorite`, `votes`, `unique`, `start`, `sla`, `messengerId`
- возможны custom fields вида `<fieldId>--<fieldKey>`, например:
  - `68ac0d8c6cac335d0ed8a2be--branchList`
  - `68ac0d8c6cac335d0ed8a2be--customersOrderNumber`
  - `68ac0d8c6cac335d0ed8a2be--customersPhoneNumber`
  - а также бизнес-поля вроде `questionForPartner`

---

## Подтвержденные endpoint'ы

### Issues
- `GET /v3/issues/<issueIdOrKey>` — получить задачу
- `GET /v3/issues/<issueIdOrKey>/comments` — получить комментарии задачи
- `GET /v3/issues/<issueIdOrKey>/changelog` — получить историю изменений задачи
- `GET /v3/issues/<issueIdOrKey>/transitions` — получить возможные переходы
- `POST /v3/issues/_count` — получить количество задач по фильтру
- `POST /v3/issues/_search` — найти список задач

### Reports
- `POST /v3/entities/report/` — создать отчет по задачам

### Queues
- `GET /v3/queues/` — получить список очередей

### Users
- `GET /v3/users/<loginOrId>` — получить пользователя по login или id

### Statuses
- `GET /v3/statuses` — получить список статусов и их `type`

### Boards
- `GET /v3/boards` — получить все доски
- `GET /v3/boards/_paginate` — получить доски с пагинацией
- `GET /v3/boards/<id>` — получить одну доску

---

## Как используем это в MVP

### P0 integration methods
В первую очередь реализуем в коде:
- `getIssue(issueIdOrKey)`
- `getIssueTransitions(issueIdOrKey)`
- `searchIssues(payload, options)`
- `countIssues(payload)`
- `getQueues()`
- `getUser(loginOrId)`
- `getStatuses()`
- `getBoards()`
- `getBoardsPaginated(perPage, id)`
- `createIssueReport(payload)`

### Для бизнес-MVP этого пока недостаточно
Для полного Digest + Health + Chat MVP нам еще понадобятся подтвержденные endpoint'ы по:
- проектам
- спискам пользователей / исполнителей при необходимости массового sync

Комментарии и changelog уже подтверждены по документации и примерам пользователя.

### Что уже известно по пользователям
Подтвержден endpoint:
- `GET /v3/users/<loginOrId>`

Подтвержденные особенности:
- можно запрашивать пользователя как по `login`, так и по `id`;
- если login состоит только из цифр, нужно использовать формат `login:<value>`;
- поддерживается `expand=groups`;
- ответ содержит поля, полезные для MVP-матчинга и identity resolution:
  - `login`
  - `uid`
  - `trackerUid`
  - `passportUid`
  - `cloudUid`
  - `display`
  - `email`
  - `dismissed`

Практический вывод для manager MVP:
- появился реальный шанс автоматически связывать `Yandex Messenger from.login` с пользователем Tracker через `GET /v3/users/<login>`;
- после этого можно сопоставлять пользователя с `queue.lead.id / cloudUid / passportUid` из `GET /v3/queues`;
- это лучше, чем ручная привязка queue lead'ов, если на практике login и user lookup действительно совпадают в организации.

### Что уже известно по поиску задач
Подтвержден endpoint:
- `POST /v3/issues/_search`
- допустим `expand=transitions|attachments|comments`
- можно ограничивать набор возвращаемых полей через `fields=...`

Подтвержденные режимы выборки:
- постраничная выдача для `filter`, `query`, `keys`
- относительная пагинация для `queue`
- scroll-механизм для выдач > 10000

Подтвержденные query params:
- `fields`
- `expand`
- `perPage`
- `page`
- `id`
- `scrollType`
- `perScroll`
- `scrollTTLMillis`
- `scrollId`

Подтвержденные response headers:
- `X-Total-Pages`
- `X-Total-Count`
- `Link`
- `X-Scroll-Id`
- `X-Scroll-Token`

Практический вывод для MVP-модуля `Мой день`:
- нельзя опираться только на первую страницу задач по исполнителю;
- нужно проходить всю page-based пагинацию для `filter`-запросов по `assignee`;
- завершенность задачи лучше определять динамически через `GET /v3/statuses`, используя `status.type` (`done`, а также terminal-type `cancelled` для пользовательского UX).

Важные правила поиска:
- нельзя полагаться на комбинирование `queue`, `keys`, `filter`, `query`;
- приоритет параметров: `queue` > `keys` > `filter` > `query`;
- при использовании трех и более таких параметров API возвращает `400`.

### Что уже известно по комментариям задачи
Подтвержден endpoint:
- `GET /v3/issues/<issueIdOrKey>/comments`

Подтвержденные query params:
- `expand=attachments|html|all`
- `perPage`
- `id`

Пагинация комментариев:
- по умолчанию возвращается первая страница до `50` комментариев;
- для следующих страниц используется `id=<commentId>`;
- ссылки на первую и следующую страницы приходят в заголовке `Link`.

Подтвержденная структура comment:
- `self`, `id`, `longId`
- `text`, `textHtml?`
- `attachments?`
- `createdBy`, `updatedBy`
- `createdAt`, `updatedAt`
- `version`
- `type` (`standard`, `incoming`, `outcoming`)
- `transport` (`internal`, `email`)
- дополнительно в реальном ответе пользователя встречается `summonees[]`

Подтверждено реальным ответом пользователя для `GET /v3/issues/CLIENTSERVICE-877/comments`:
- комментарии приходят массивом объектов;
- `textHtml` и `attachments` могут отсутствовать, если запрос без `expand`;
- `summonees` могут присутствовать у системных комментариев/уведомлений;
- `id` числовой, `longId` строковый;
- в комментариях реально встречаются системные bot-generated сообщения и пользовательские комментарии.

### Что уже известно по changelog / истории изменений
Подтвержден endpoint:
- `GET /v3/issues/<issueIdOrKey>/changelog`

Подтвержденные query params:
- `id`
- `perPage`
- `field`
- `type`

Пагинация changelog:
- по умолчанию возвращается до `50` записей;
- для перехода к следующей странице используется `id=<changeId>`;
- ссылки на первую и следующую страницы приходят в заголовке `Link`.

Подтвержденная структура changelog entry:
- `id`, `self`
- `issue`
- `updatedAt`, `updatedBy`
- `type`
- `transport`
- `fields[]`
- `comments.added[]`
- `executedTriggers[]`

Подтверждено реальным ответом пользователя для `GET /v3/issues/CLIENTSERVICE-877/changelog`:
- `transport` реально принимает значения `service-api`, `back`, `apiV2`, `front`;
- `fields[].from/to` могут быть:
  - `null`
  - строкой
  - объектом reference-like структуры
  - массивом объектов
- в `comments.added[]` реально встречаются поля:
  - `self`
  - `id`
  - `objectId`
  - `display`
- в `executedTriggers[]` реально встречаются поля:
  - `trigger.self`
  - `trigger.id`
  - `trigger.display`
  - `success`
  - `message`
- changelog хорошо отражает:
  - смену статусов
  - смену наблюдателей
  - изменение кастомных полей вроде `pendingReplyFrom`, `messengerId`
  - добавление комментариев автоматизациями и ботами

Подтвержденные типы изменений, полезные для MVP:
- `IssueCreated`
- `IssueUpdated`
- `IssueWorkflow`
- `IssueMoved`
- `IssueCommentAdded`
- `IssueCommentUpdated`
- `IssueCommentRemoved`
- `IssueLinked`
- `IssueLinkChanged`
- `IssueUnlinked`
- `IssueAttachmentAdded`
- `IssueAttachmentRemoved`
- `IssueWorklogAdded`
- `IssueWorklogUpdated`
- `IssueWorklogRemoved`

Реально подтвержденные на живом кейсе пользователя типы:
- `IssueCreated`
- `IssueUpdated`
- `IssueWorkflow`

---

## Что еще нужно подтвердить

### Нужно от пользователя / из документации
1. endpoint для проектов
2. endpoint для пользователей
3. ограничения rate limit
4. практическое подтверждение фильтрации по `updatedAt`, `queue`, `status`, `assignee`
5. желательно живой пример ответа comments API из вашей очереди
6. желательно живой пример ответа changelog API из вашей очереди

---

## Зачем это важно
Без списка задач, комментариев и истории мы пока не можем качественно сделать:
- daily digest;
- weekly health;
- stale task detection;
- workload analysis;
- risk explanation.

Но уже можем безопасно строить integration layer и typed client без гадания.
