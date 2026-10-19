"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overviewPage = overviewPage;
exports.usersPage = usersPage;
exports.activityPage = activityPage;
const analytics_types_1 = require("../../core/analytics/analytics.types");
const request_metrics_1 = require("../../core/analytics/request-metrics");
const admin_components_1 = require("./admin.components");
const periods = { '1': 'Последние 24 часа', '7': 'Последние 7 дней', '30': 'Последние 30 дней' };
const period = (days) => (0, admin_components_1.select)('days', 'Период', periods, days);
const filters = (content, resetPath) => `<form method="get" class="card filters" aria-label="Фильтры">${content}<div class="filter-actions"><a class="button button-secondary" href="${(0, admin_components_1.escapeHtml)(resetPath)}">Сбросить</a><button type="submit">Применить</button></div></form>`;
const table = (headers, rows) => rows.length
    ? `${headers.length > 3 ? '<p class="table-hint">↔ Все столбцы доступны при прокрутке таблицы вправо.</p>' : ''}<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица, прокручивается по горизонтали"><table><thead><tr>${headers.map((h) => `<th scope="col">${(0, admin_components_1.escapeHtml)(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : (0, admin_components_1.empty)();
function overviewPage(store, since, days) {
    const { totals, latency, scenarios, outcomes, startedAt, retentionDays, load } = store.overview(since);
    const total = Number(totals.total);
    const ratio = (value) => total ? `${Math.round(Number(value) * 100 / total)}% обращений` : 'Пока нет обращений';
    const metrics = [
        ['Активные пользователи', (0, admin_components_1.number)(totals.users), 'Хотя бы одно обращение за период'],
        ['Обращения', (0, admin_components_1.number)(total), 'Сообщения и нажатия кнопок'],
        ['Технические ошибки', (0, admin_components_1.number)(totals.errors), ratio(totals.errors)],
        ['Время ответа · p95', (0, admin_components_1.duration)(latency.p95), `Медиана: ${(0, admin_components_1.duration)(latency.median)}`]
    ];
    const bars = scenarios.map((row) => `<div class="bar-row"><span class="bar-label">${(0, admin_components_1.escapeHtml)(analytics_types_1.SCENARIOS[String(row.scenario)] || 'Другое')}</span><strong>${(0, admin_components_1.number)(row.total)}</strong><progress class="bar" max="${Math.max(1, total)}" value="${Number(row.total)}" aria-label="Количество обращений"></progress></div>`).join('');
    return (0, admin_components_1.layout)('overview', 'Как живёт ваш бот', 'Пользователи, востребованные сценарии и точки, в которых нужна помощь.', `${filters(period(days), '/admin')}<div class="stats">${metrics.map(([label, value, note]) => `<section class="card"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></section>`).join('')}</div>
    <div class="columns"><section class="card"><div class="card-head"><h2>Популярные сценарии</h2><span class="badge">${days} дн.</span></div>${bars || (0, admin_components_1.empty)('Первые события ещё впереди', 'Статистика появится после обращения к боту.')}</section>
    <section class="card"><div class="card-head"><h2>Результаты обращений</h2><a href="${(0, admin_components_1.link)('/admin/activity', { days })}">Вся история →</a></div>${table(['Результат', 'Количество'], outcomes.map((row) => `<tr><td>${(0, admin_components_1.badge)(row.outcome)}</td><td>${(0, admin_components_1.number)(row.total)}</td></tr>`))}</section></div>
    <section class="card"><div class="card-head"><h2>Нагрузка и кеш</h2><span class="muted">Измерено обращений: ${(0, admin_components_1.number)(load.measured)}</span></div><div class="load-grid">${[
        ['HTTP-попытки Tracker', (0, admin_components_1.number)(load.requests)],
        ['Кеш / общая загрузка', `${(0, admin_components_1.number)(load.cache_hits)} / ${(0, admin_components_1.number)(load.shared_hits)}`],
        ['Ответы HTTP 429', (0, admin_components_1.number)(load.rate_limited)],
        ['Таймауты Tracker', (0, admin_components_1.number)(load.timeouts)]
    ].map(([label, value]) => `<div><p class="metric-label">${label}</p><p class="load-value">${value}</p></div>`).join('')}</div><p class="muted">Сумма ожиданий очереди: ${(0, admin_components_1.duration)(load.queue_ms)} · Сумма времени HTTP-попыток: ${(0, admin_components_1.duration)(load.http_ms)}. Параллельные операции суммируются, это не длительность одного ответа. Общая загрузка учитывается у инициатора; у остальных — ожидание без повторного подсчёта API. История до включения измерений не учитывается.</p></section>
    <div class="notice">Сбор данных включён ${(0, admin_components_1.date)(startedAt)} UTC. Хранение подробной истории — ${retentionDays} дней. «Ответ отправлен» не является оценкой полезности. Отказы доступа не считаются техническими ошибками. Задержка включает обработку и отправку сообщения; незавершённые обращения исключены из p95.</div>`);
}
function usersPage(store, since, query, page) {
    const { rows, total } = store.users(since, query.search, page);
    return (0, admin_components_1.layout)('users', 'Пользователи', 'Кто обращается к боту, возвращается ли снова и сталкивается ли с ошибками.', `${filters(period(query.days) + (0, admin_components_1.input)('search', 'Поиск по логину', query.search || '', 'Логин или его часть'), '/admin/users')}<section class="card"><div class="card-head"><h2>Участники</h2><span class="badge">${(0, admin_components_1.number)(total)}</span></div>${table(['Пользователь', 'Первое обращение', 'Последнее обращение', 'Действия за период', 'Ошибки за период', ''], rows.map((row) => `<tr><td class="user"><strong>${(0, admin_components_1.escapeHtml)(row.login)}</strong></td><td>${(0, admin_components_1.date)(row.first_seen)}</td><td>${(0, admin_components_1.date)(row.last_seen)}</td><td>${(0, admin_components_1.number)(row.total)}</td><td>${(0, admin_components_1.number)(row.errors)}</td><td><a href="${(0, admin_components_1.link)('/admin/activity', { user: String(row.user_key), days: query.days })}">История →</a></td></tr>`))}${(0, admin_components_1.pagination)('/admin/users', query, page, total)}</section><p class="muted">Первое и последнее обращения — за сохранённую историю пользователя. Количество действий и ошибок — за выбранный период. Идентификатор отправителя предоставлен Messenger; это не доказательство подтверждённого аккаунта Tracker.</p>`);
}
function loadDetails(row) {
    if (!Number(row.metrics_recorded))
        return '<span class="muted">Не измерялось</span>';
    const source = String(row.data_source);
    const label = source !== 'none' && Object.hasOwn(request_metrics_1.DATA_SOURCES, source) ? `${request_metrics_1.DATA_SOURCES[source]} · ` : '';
    return `<details class="load-details"><summary>${(0, admin_components_1.escapeHtml)(label)}${(0, admin_components_1.number)(row.tracker_requests)} HTTP</summary><div>
    Очередь: ${(0, admin_components_1.duration)(row.queue_wait_ms)}<br>HTTP-попытки: ${(0, admin_components_1.duration)(row.tracker_duration_ms)}<br>
    HTTP 429: ${(0, admin_components_1.number)(row.tracker_429)} · Таймауты: ${(0, admin_components_1.number)(row.tracker_timeouts)}
    ${Number(row.shared_wait_ms) ? `<br>Общая загрузка: ${(0, admin_components_1.duration)(row.shared_wait_ms)}` : ''}
    </div></details>`;
}
function activityPage(store, filter, query, page) {
    const { rows, total } = store.activities(filter);
    const userNote = query.user ? `<div class="notice">История выбранного пользователя. <a href="${(0, admin_components_1.link)('/admin/activity', { days: query.days })}">Показать всех</a></div>` : '';
    return (0, admin_components_1.layout)('activity', 'История действий', 'Безопасная диагностика: сценарий, результат, длительность и ID для поиска в серверных логах.', `${userNote}${filters(period(query.days) + (0, admin_components_1.select)('scenario', 'Сценарий', analytics_types_1.SCENARIOS, query.scenario, 'Все сценарии') + (0, admin_components_1.select)('outcome', 'Результат', analytics_types_1.OUTCOMES, query.outcome, 'Все результаты') + (0, admin_components_1.input)('requestId', 'Точный ID запроса', query.requestId || '', 'Введите ID запроса') + (query.user ? `<input type="hidden" name="user" value="${(0, admin_components_1.escapeHtml)(query.user)}">` : ''), '/admin/activity')}<section class="card"><div class="card-head"><h2>Обращения</h2><span class="badge">${(0, admin_components_1.number)(total)}</span></div>${table(['Время · UTC', 'Пользователь', 'Сценарий', 'Результат', 'Длительность', 'Загрузка', 'Диагностика'], rows.map((row) => `<tr><td>${(0, admin_components_1.date)(row.started_at)}</td><td class="user"><a href="${(0, admin_components_1.link)('/admin/activity', { user: String(row.user_key), days: query.days })}">${(0, admin_components_1.escapeHtml)(row.login)}</a></td><td>${(0, admin_components_1.escapeHtml)(analytics_types_1.SCENARIOS[String(row.scenario)] || 'Другое')}</td><td>${(0, admin_components_1.badge)(row.outcome)}</td><td>${['processing', 'interrupted'].includes(String(row.outcome)) ? '—' : (0, admin_components_1.duration)(row.duration_ms)}</td><td>${loadDetails(row)}</td><td class="request-id"><code>${(0, admin_components_1.escapeHtml)(row.request_id)}</code>${row.error_code ? `<br><span class="muted">${(0, admin_components_1.escapeHtml)(row.error_code)}</span>` : ''}</td></tr>`))}${(0, admin_components_1.pagination)('/admin/activity', query, page, total)}</section>`);
}
