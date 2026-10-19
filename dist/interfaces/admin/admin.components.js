"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.duration = exports.number = exports.escapeHtml = void 0;
exports.date = date;
exports.badge = badge;
exports.empty = empty;
exports.select = select;
exports.input = input;
exports.link = link;
exports.pagination = pagination;
exports.layout = layout;
const analytics_types_1 = require("../../core/analytics/analytics.types");
const analytics_store_1 = require("../../core/analytics/analytics.store");
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
exports.escapeHtml = escapeHtml;
const number = (value) => Number(value || 0).toLocaleString('ru-RU');
exports.number = number;
function date(value) {
    if (!value)
        return '—';
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short'
    }).format(parsed);
}
const duration = (value) => value == null ? '—' : `${(Number(value) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с`;
exports.duration = duration;
function badge(outcome) {
    const key = String(outcome);
    const tone = analytics_types_1.ERROR_OUTCOMES.includes(key) ? 'error' : key === 'replied' ? 'good' : 'neutral';
    return `<span class="badge ${tone}">${(0, exports.escapeHtml)(analytics_types_1.OUTCOMES[key] || 'Неизвестно')}</span>`;
}
function empty(title = 'Здесь пока тихо', text = 'За выбранный период событий нет. Попробуйте изменить фильтры.') {
    return `<div class="empty"><strong>${(0, exports.escapeHtml)(title)}</strong>${(0, exports.escapeHtml)(text)}</div>`;
}
function select(name, label, values, selected, all) {
    return `<label>${(0, exports.escapeHtml)(label)}<span class="select-control"><select name="${(0, exports.escapeHtml)(name)}">${all ? `<option value="">${(0, exports.escapeHtml)(all)}</option>` : ''}${Object.entries(values).map(([key, text]) => `<option value="${(0, exports.escapeHtml)(key)}"${key === selected ? ' selected' : ''}>${(0, exports.escapeHtml)(text)}</option>`).join('')}</select></span></label>`;
}
function input(name, label, value, placeholder = '') {
    return `<label>${(0, exports.escapeHtml)(label)}<input type="search" name="${(0, exports.escapeHtml)(name)}" value="${(0, exports.escapeHtml)(value)}" placeholder="${(0, exports.escapeHtml)(placeholder)}" maxlength="200" autocomplete="off" spellcheck="false"></label>`;
}
function link(path, values) {
    const query = new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]));
    return (0, exports.escapeHtml)(`${path}?${query}`);
}
function pagination(path, query, page, total) {
    const pages = Math.max(1, Math.ceil(total / analytics_store_1.PAGE_SIZE));
    return `<div class="pagination"><span class="muted">${(0, exports.number)(total)} записей · страница ${page} из ${pages}</span><div>${page > 1 ? `<a href="${link(path, { ...query, page: page - 1 })}">← Назад</a> ` : ''}${page < pages ? `<a href="${link(path, { ...query, page: page + 1 })}">Далее →</a>` : ''}</div></div>`;
}
const navigation = [
    { id: 'overview', href: '/admin', label: '◈  Обзор' },
    { id: 'users', href: '/admin/users', label: '◎  Пользователи' },
    { id: 'activity', href: '/admin/activity', label: '≡  История действий' }
];
function layout(screen, title, subtitle, content) {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${(0, exports.escapeHtml)(title)} · Copilot Admin</title><link rel="icon" href="/admin/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/theme.css"></head><body><div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-icon" aria-hidden="true">✦</span><div>Tracker Copilot<div class="eyebrow">Admin workspace</div></div></div><nav aria-label="Разделы админки">${navigation.map((item) => `<a href="${item.href}"${item.id === screen ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')}</nav><div class="sidebar-note">Аналитика использования<br>Без переписки и содержимого задач.<br><br>Только для администратора</div></aside><main class="main"><header class="topbar"><span class="eyebrow">Рабочее пространство</span><span class="muted"><span class="status-dot"></span>Обновлено ${date(new Date().toISOString())} UTC</span></header><div class="page-head"><h1>${(0, exports.escapeHtml)(title)}</h1><p class="subtitle">${(0, exports.escapeHtml)(subtitle)}</p></div><div class="stack">${content}</div><footer class="footer">Время указано в UTC · «Последнее обращение» не означает открытие чата.</footer></main></div></body></html>`;
}
