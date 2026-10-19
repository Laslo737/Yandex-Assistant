import { AnalyticsStore } from '../../core/analytics/analytics.store';
import { ActivityFilter, OUTCOMES, SCENARIOS } from '../../core/analytics/analytics.types';
import { DATA_SOURCES, DataSource } from '../../core/analytics/request-metrics';
import { badge, date, duration, empty, escapeHtml as e, input, layout, link, number, pagination, select } from './admin.components';

const periods = { '1': 'Последние 24 часа', '7': 'Последние 7 дней', '30': 'Последние 30 дней' };
const period = (days: string) => select('days', 'Период', periods, days);
const filters = (content: string, resetPath: string) => `<form method="get" class="card filters" aria-label="Фильтры">${content}<div class="filter-actions"><a class="button button-secondary" href="${e(resetPath)}">Сбросить</a><button type="submit">Применить</button></div></form>`;
const table = (headers: string[], rows: string[]) => rows.length
  ? `${headers.length > 3 ? '<p class="table-hint">↔ Все столбцы доступны при прокрутке таблицы вправо.</p>' : ''}<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица, прокручивается по горизонтали"><table><thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty();

export function overviewPage(store: AnalyticsStore, since: string, days: string) {
  const { totals, latency, scenarios, outcomes, startedAt, retentionDays, load } = store.overview(since);
  const total = Number(totals.total);
  const ratio = (value: unknown) => total ? `${Math.round(Number(value) * 100 / total)}% обращений` : 'Пока нет обращений';
  const metrics = [
    ['Активные пользователи', number(totals.users), 'Хотя бы одно обращение за период'],
    ['Обращения', number(total), 'Сообщения и нажатия кнопок'],
    ['Технические ошибки', number(totals.errors), ratio(totals.errors)],
    ['Время ответа · p95', duration(latency.p95), `Медиана: ${duration(latency.median)}`]
  ];
  const bars = scenarios.map((row) => `<div class="bar-row"><span class="bar-label">${e(SCENARIOS[String(row.scenario) as keyof typeof SCENARIOS] || 'Другое')}</span><strong>${number(row.total)}</strong><progress class="bar" max="${Math.max(1, total)}" value="${Number(row.total)}" aria-label="Количество обращений"></progress></div>`).join('');
  return layout('overview', 'Как живёт ваш бот', 'Пользователи, востребованные сценарии и точки, в которых нужна помощь.',
    `${filters(period(days), '/admin')}<div class="stats">${metrics.map(([label, value, note]) => `<section class="card"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></section>`).join('')}</div>
    <div class="columns"><section class="card"><div class="card-head"><h2>Популярные сценарии</h2><span class="badge">${days} дн.</span></div>${bars || empty('Первые события ещё впереди', 'Статистика появится после обращения к боту.')}</section>
    <section class="card"><div class="card-head"><h2>Результаты обращений</h2><a href="${link('/admin/activity', { days })}">Вся история →</a></div>${table(['Результат', 'Количество'], outcomes.map((row) => `<tr><td>${badge(row.outcome)}</td><td>${number(row.total)}</td></tr>`))}</section></div>
    <section class="card"><div class="card-head"><h2>Нагрузка и кеш</h2><span class="muted">Измерено обращений: ${number(load.measured)}</span></div><div class="load-grid">${[
      ['HTTP-попытки Tracker', number(load.requests)],
      ['Кеш / общая загрузка', `${number(load.cache_hits)} / ${number(load.shared_hits)}`],
      ['Ответы HTTP 429', number(load.rate_limited)],
      ['Таймауты Tracker', number(load.timeouts)]
    ].map(([label, value]) => `<div><p class="metric-label">${label}</p><p class="load-value">${value}</p></div>`).join('')}</div><p class="muted">Сумма ожиданий очереди: ${duration(load.queue_ms)} · Сумма времени HTTP-попыток: ${duration(load.http_ms)}. Параллельные операции суммируются, это не длительность одного ответа. Общая загрузка учитывается у инициатора; у остальных — ожидание без повторного подсчёта API. История до включения измерений не учитывается.</p></section>
    <div class="notice">Сбор данных включён ${date(startedAt)} UTC. Хранение подробной истории — ${retentionDays} дней. «Ответ отправлен» не является оценкой полезности. Отказы доступа не считаются техническими ошибками. Задержка включает обработку и отправку сообщения; незавершённые обращения исключены из p95.</div>`);
}

export function usersPage(store: AnalyticsStore, since: string, query: Record<string, string>, page: number) {
  const { rows, total } = store.users(since, query.search, page);
  return layout('users', 'Пользователи', 'Кто обращается к боту, возвращается ли снова и сталкивается ли с ошибками.',
    `${filters(period(query.days) + input('search', 'Поиск по логину', query.search || '', 'Логин или его часть'), '/admin/users')}<section class="card"><div class="card-head"><h2>Участники</h2><span class="badge">${number(total)}</span></div>${table(
      ['Пользователь', 'Первое обращение', 'Последнее обращение', 'Действия за период', 'Ошибки за период', ''], rows.map((row) => `<tr><td class="user"><strong>${e(row.login)}</strong></td><td>${date(row.first_seen)}</td><td>${date(row.last_seen)}</td><td>${number(row.total)}</td><td>${number(row.errors)}</td><td><a href="${link('/admin/activity', { user: String(row.user_key), days: query.days })}">История →</a></td></tr>`)
    )}${pagination('/admin/users', query, page, total)}</section><p class="muted">Первое и последнее обращения — за сохранённую историю пользователя. Количество действий и ошибок — за выбранный период. Идентификатор отправителя предоставлен Messenger; это не доказательство подтверждённого аккаунта Tracker.</p>`);
}

function loadDetails(row: Record<string, unknown>) {
  if (!Number(row.metrics_recorded)) return '<span class="muted">Не измерялось</span>';
  const source = String(row.data_source) as DataSource;
  const label = source !== 'none' && Object.hasOwn(DATA_SOURCES, source) ? `${DATA_SOURCES[source]} · ` : '';
  return `<details class="load-details"><summary>${e(label)}${number(row.tracker_requests)} HTTP</summary><div>
    Очередь: ${duration(row.queue_wait_ms)}<br>HTTP-попытки: ${duration(row.tracker_duration_ms)}<br>
    HTTP 429: ${number(row.tracker_429)} · Таймауты: ${number(row.tracker_timeouts)}
    ${Number(row.shared_wait_ms) ? `<br>Общая загрузка: ${duration(row.shared_wait_ms)}` : ''}
    </div></details>`;
}

export function activityPage(store: AnalyticsStore, filter: ActivityFilter, query: Record<string, string>, page: number) {
  const { rows, total } = store.activities(filter);
  const userNote = query.user ? `<div class="notice">История выбранного пользователя. <a href="${link('/admin/activity', { days: query.days })}">Показать всех</a></div>` : '';
  return layout('activity', 'История действий', 'Безопасная диагностика: сценарий, результат, длительность и ID для поиска в серверных логах.',
    `${userNote}${filters(period(query.days) + select('scenario', 'Сценарий', SCENARIOS, query.scenario, 'Все сценарии') + select('outcome', 'Результат', OUTCOMES, query.outcome, 'Все результаты') + input('requestId', 'Точный ID запроса', query.requestId || '', 'Введите ID запроса') + (query.user ? `<input type="hidden" name="user" value="${e(query.user)}">` : ''), '/admin/activity')}<section class="card"><div class="card-head"><h2>Обращения</h2><span class="badge">${number(total)}</span></div>${table(
      ['Время · UTC', 'Пользователь', 'Сценарий', 'Результат', 'Длительность', 'Загрузка', 'Диагностика'], rows.map((row) => `<tr><td>${date(row.started_at)}</td><td class="user"><a href="${link('/admin/activity', { user: String(row.user_key), days: query.days })}">${e(row.login)}</a></td><td>${e(SCENARIOS[String(row.scenario) as keyof typeof SCENARIOS] || 'Другое')}</td><td>${badge(row.outcome)}</td><td>${['processing', 'interrupted'].includes(String(row.outcome)) ? '—' : duration(row.duration_ms)}</td><td>${loadDetails(row)}</td><td class="request-id"><code>${e(row.request_id)}</code>${row.error_code ? `<br><span class="muted">${e(row.error_code)}</span>` : ''}</td></tr>`)
    )}${pagination('/admin/activity', query, page, total)}</section>`);
}
