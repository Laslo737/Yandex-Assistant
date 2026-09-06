# Tracker Integration Checklist

Чтобы не гадать и сразу делать корректно, для следующего этапа нужны данные по Yandex Tracker.

## Нужная информация от тебя

### 1. Доступы
Нужно добавить в `.env`:
- `ENABLE_YANDEX_TRACKER=true`
- `YANDEX_TRACKER_OAUTH_TOKEN=...`
- `YANDEX_TRACKER_ORG_ID=...` или `YANDEX_TRACKER_CLOUD_ORG_ID=...`

### 2. Подтверждение auth-схемы
Нужно понять точные заголовки для Tracker API. Обычно это что-то вроде:
- `Authorization: OAuth <token>` или `Bearer <token>`
- `X-Org-ID` / `X-Cloud-Org-ID`

Но лучше не гадать, а получить:
- 1 рабочий пример curl/postman запроса
- 1 ответ от API

### 3. Нужные endpoint'ы для MVP
Нужны реальные или подтвержденные endpoint'ы для:
- список очередей
- список проектов
- список задач
- получение одной задачи
- комментарии задачи
- история изменений задачи
- пользователи / исполнители

### 4. Примеры payload / response
Желательно прислать по 1 примеру JSON для:
- issue
- comment
- changelog / history event
- project
- queue
- user

### 5. Ограничения
Нужно узнать:
- rate limits
- pagination
- есть ли webhooks или только polling
- можно ли фильтровать задачи по updatedAt / status / queue / assignee

## Минимум, с которого можно начинать интеграцию
Если хочешь ускорить следующий этап, пришли хотя бы:
1. tracker token
2. org/cloud org id
3. 2-3 примера реальных API запросов
4. 2-3 примера ответов JSON

Тогда я смогу уже не абстрактно, а предметно начать модуль `integrations/yandex-tracker`.
