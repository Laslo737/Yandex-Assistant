# Process Analysis Heuristics MVP

## Цель
`Анализ процессов` — это manager-facing heuristic-модуль поверх Yandex Tracker.

Его задача в текущем MVP:
- показать руководителю, что происходит по его очередям;
- выделить заметные процессные риски;
- дать human-readable выводы;
- дать быстрые переходы в Tracker через deep-links.

Это **не LLM-анализ** и не полный process mining. Текущая версия — pragmatic rule-based слой для on-demand сценария по кнопке `Анализ процессов`.

---

## Scope текущей версии

### Кто может запускать
Сейчас сценарий доступен только:
- руководителям;
- владельцам очередей Tracker.

Проверка идет через `ManagerSummaryService.isManagerLogin(...)` и `getManagerContextByLogin(...)`.

### По каким данным строится анализ
Анализ идет по очередям, где пользователь является lead / owner.

Для каждой очереди загружаются задачи через Tracker search с полями:
- `summary`
- `status`
- `statusType`
- `assignee`
- `updatedAt`
- `createdAt`
- `deadline`
- `pendingReplyFrom`
- `queue`
- `statusStartTime`
- `lastCommentUpdatedAt`

### Какие задачи попадают в анализ
В анализ попадают только **active issues**, то есть задачи, которые не находятся в terminal status.

Terminal statuses определяются через статусы Tracker типов:
- `done`
- `cancelled`

Дополнительно используется fallback-проверка по `statusType`, `status.id`, `status.key`.

---

## Базовые сигналы

### 1. Overdue
Задача считается просроченной, если:
- у нее есть `deadline`;
- дедлайн уже прошел;
- задача не закрыта и не отменена.

Формула:
- `deadline < now`
- `!isDone(issue)`

### 2. Stale
Задача считается stale, если:
- она не обновлялась больше `7` дней.

Формула:
- `daysWithoutUpdate > 7`
- где `daysWithoutUpdate = now - updatedAt`

### 3. Waiting for reply
Задача считается ожидающей ответа, если:
- поле `pendingReplyFrom` не пустое.

Формула:
- `pendingReplyFrom.length > 0`

### 4. Waiting too long
Это подтип waiting-сигнала.

Задача считается слишком долго ожидающей ответа, если:
- она already `waitingForReply`;
- ожидание длится `>= 3` дней.

Формула:
- `waitingForReply === true`
- `waitingDays >= 3`
- где `waitingDays = now - (lastCommentUpdatedAt || updatedAt || createdAt)`

### 5. Long in progress
Задача считается слишком долго находящейся в работе, если:
- с момента `statusStartTime` прошло `>= 10` дней.

Формула:
- `daysInProgress >= 10`
- где `daysInProgress = now - statusStartTime`

Важно: текущая pragmatic-версия опирается на `statusStartTime`, а deep-link для этого сигнала в Tracker пока строится через выборку активных задач без обновления дольше заданного периода. Это UX-компромисс MVP, а не идеальное 1:1 отражение сигнала.

### 6. Old backlog / старый хвост
Это не incident-сигнал, а отдельный cleanup-сигнал.

Подсигналы:
- **very old stale** — задача не обновлялась `>= 90` дней;
- **very long in progress** — задача находится в работе `>= 90` дней.

Формулы:
- `daysWithoutUpdate >= 90`
- `daysInProgress >= 90`

Старый хвост показывается отдельно, чтобы не смешивать накопившийся мусор с текущими оперативными рисками.

---

## Что сознательно не используем

В текущем MVP мы **не** используем:
- правило `много смен статуса = проблема`;
- сложный process mining;
- причинный анализ через LLM;
- сравнение с историческими baseline по неделям/месяцам;
- анализ по всей организации вне manager scope.

Причина: для первой версии важнее надежный pragmatic-сигнал, чем сложная, но шумная аналитика.

---

## Агрегация по очередям

Для каждой очереди считаются:
- `active`
- `overdue`
- `stale`
- `waitingForReply`
- `longInProgress`

### Queue score
Чтобы определить самые напряженные очереди, используется score:

```text
score = active
      + overdue * 10
      + stale * 7
      + waitingForReply * 5
      + longInProgress * 6
```

Назначение score:
- не для показа пользователю как отдельной метрики;
- а для внутренней сортировки queue highlights.

`queueHighlights` = топ-5 очередей по этому score.

---

## Агрегация по исполнителям

В блок `Кто держит задачи слишком долго` попадают только исполнители, у которых есть задачи с сигналом `longInProgress`.

Для каждого исполнителя считаются:
- `longInProgressCount`
- `averageDaysInProgress`
- `topIssueKeys` (до 3 задач)

Сортировка:
1. по `averageDaysInProgress` по убыванию;
2. затем по `longInProgressCount` по убыванию.

В выдачу попадает топ-3 исполнителя.

---

## Приоритизация задач

Для блока `Куда смотреть в первую очередь` задачи ранжируются в два этапа:

1. сначала приоритет получает очередь с более высоким queue score;
2. внутри этого используется task score.

### Task score
```text
taskScore = (overdue ? 100 : 0)
          + (stale ? 70 : 0)
          + (longInProgress ? 60 : 0)
          + (waitingForReply ? 40 : 0)
          + min(daysInProgress, 60)
          + min(daysWithoutUpdate, 60)
```

`topTasks` = топ-5 задач после сортировки.

---

## Как строится human-readable результат

Результат `ProcessAnalysisService` состоит из:
- `headline`
- `mainRisk`
- `summaryLines`
- `oldBacklogLines`
- `todayActions`
- `queueHighlights`
- `assigneeHighlights`
- `topTasks`

### 1. Headline
Базовая логика headline:
- по умолчанию: `Ситуация выглядит ровно: критичных сигналов немного.`
- если `overdueCount > 0` или `staleCount > 5` или `longInProgressCount > 5`:
  - `Есть заметные процессные риски: стоит разобрать проблемные зоны.`
- если `overdueCount > 5` или `staleCount > 10` или `waitingTooLongCount > 5`:
  - `Накопились сильные сигналы: уже нужен управленческий разбор.`

### 2. Main risk
Логика выбора главного риска:
- если есть primary queue и в ней есть заметные сигналы, показываем риск по очереди;
- иначе, если есть overdue, главным риском считаем просрочку;
- иначе, если есть stale, главным риском считаем зависание без движения.

Пример формата:
`Главная зона риска сейчас — XXX: просрочено N, без движения N, ждут ответа N, долго в работе N.`

### 3. Summary lines
Блок `Что видно сейчас` строится из сигналов:
- stale;
- long in progress;
- overdue;
- waiting too long;
- primary queue.

Специальное правило против дублей:
- если `staleCount > 0` и `longInProgressCount > 0` и они равны,
- вместо двух почти одинаковых строк выводится одна схлопнутая формулировка.

Если сигналов нет:
- `Сильных процессных проблем по базовым сигналам сейчас не видно.`

### 4. Old backlog lines
Если есть старый хвост, он выводится отдельно:
- задачи без обновления `90+` дней;
- задачи в работе `90+` дней.

### 5. Today actions
Блок `Что сделать сейчас` строится rule-based:
- есть overdue → разобрать просроченные задачи;
- есть stale или long in progress → поднять зависшие задачи;
- есть waiting too long → разблокировать ожидание ответа;
- есть primary queue → отдельно посмотреть самую рискованную очередь;
- есть old backlog → разобрать старый хвост.

Если явных рисков нет:
- `Критичных действий не требуется: достаточно обычного контроля статусов и сроков.`

---

## Presentation / Formatter

В текущем UX formatter добавляет:
- заголовок `📈 Анализ процессов`;
- список очередей в scope;
- headline и main risk;
- блок `Что видно сейчас`;
- метрики с deep-links в Tracker;
- отдельный блок `Старый хвост`;
- блок `Что сделать сейчас`;
- block `Где больше всего внимания` по очередям;
- block `Кто держит задачи слишком долго` по исполнителям;
- block `Куда смотреть в первую очередь` с top tasks.

### Deep-links
Сейчас deep-links есть для:
- active issues;
- overdue;
- stale (`Updated < now()-7d`);
- waiting for reply;
- long in progress (в MVP через `Updated < now()-Nd`);
- old backlog (`Updated < now()-90d`).

Ссылки даются inline в тексте. Кнопки используются только для bot-actions.

---

## Ограничения текущего MVP

1. `Long in progress` в логике сервиса считается по `statusStartTime`, а deep-link в Tracker пока приближен через `updatedAt`.
2. Анализ живет в live-режиме и зависит от fan-out в Tracker API по очередям.
3. Нет precompute/caching именно для process analysis слоя.
4. Нет сравнения с историческим трендом (`стало хуже/лучше относительно прошлой недели`).
5. Нет explainability уровня `почему именно так произошло` на основе changelog/comments.
6. Нет LLM-слоя для более сильной управленческой формулировки.

---

## Когда подключать LLM

На текущем этапе LLM не обязателен.

Его имеет смысл подключать позже как:
- formatter / summarizer;
- explainer причин;
- слой для conversational Q&A поверх уже собранных сигналов.

Базовая signal-логика должна оставаться deterministic и проверяемой.

---

## Связанные файлы
- `src/core/process-analysis/application/process-analysis.service.ts`
- `src/core/assistant/presentation/process-analysis.formatters.ts`
- `src/core/health/application/health.service.ts`
- `todo.md`
