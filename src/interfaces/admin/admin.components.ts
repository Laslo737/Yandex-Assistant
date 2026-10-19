import { ERROR_OUTCOMES, OUTCOMES } from '../../core/analytics/analytics.types';
import { PAGE_SIZE } from '../../core/analytics/analytics.store';

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export const number = (value: unknown) => Number(value || 0).toLocaleString('ru-RU');
export function date(value: unknown) {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short'
  }).format(parsed);
}
export const duration = (value: unknown) => value == null ? '—' : `${(Number(value) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с`;
export function badge(outcome: unknown) {
  const key = String(outcome) as keyof typeof OUTCOMES;
  const tone = ERROR_OUTCOMES.includes(key) ? 'error' : key === 'replied' ? 'good' : 'neutral';
  return `<span class="badge ${tone}">${escapeHtml(OUTCOMES[key] || 'Неизвестно')}</span>`;
}
export function empty(title = 'Здесь пока тихо', text = 'За выбранный период событий нет. Попробуйте изменить фильтры.') {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
}
export function select(name: string, label: string, values: Record<string, string>, selected: string, all?: string) {
  return `<label>${escapeHtml(label)}<span class="select-control"><select name="${escapeHtml(name)}">${all ? `<option value="">${escapeHtml(all)}</option>` : ''}${Object.entries(values).map(([key, text]) =>
    `<option value="${escapeHtml(key)}"${key === selected ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></span></label>`;
}
export function input(name: string, label: string, value: string, placeholder = '') {
  return `<label>${escapeHtml(label)}<input type="search" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="200" autocomplete="off" spellcheck="false"></label>`;
}
export function link(path: string, values: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]));
  return escapeHtml(`${path}?${query}`);
}
export function pagination(path: string, query: Record<string, string>, page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `<div class="pagination"><span class="muted">${number(total)} записей · страница ${page} из ${pages}</span><div>${page > 1 ? `<a href="${link(path, { ...query, page: page - 1 })}">← Назад</a> ` : ''}${page < pages ? `<a href="${link(path, { ...query, page: page + 1 })}">Далее →</a>` : ''}</div></div>`;
}

export type Screen = 'overview' | 'users' | 'activity';
const navigation: Array<{ id: Screen; href: string; label: string }> = [
  { id: 'overview', href: '/admin', label: '◈  Обзор' },
  { id: 'users', href: '/admin/users', label: '◎  Пользователи' },
  { id: 'activity', href: '/admin/activity', label: '≡  История действий' }
];
export function layout(screen: Screen, title: string, subtitle: string, content: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · Copilot Admin</title><link rel="icon" href="/admin/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/theme.css"></head><body><div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-icon" aria-hidden="true">✦</span><div>Tracker Copilot<div class="eyebrow">Admin workspace</div></div></div><nav aria-label="Разделы админки">${navigation.map((item) => `<a href="${item.href}"${item.id === screen ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')}</nav><div class="sidebar-note">Аналитика использования<br>Без переписки и содержимого задач.<br><br>Только для администратора</div></aside><main class="main"><header class="topbar"><span class="eyebrow">Рабочее пространство</span><span class="muted"><span class="status-dot"></span>Обновлено ${date(new Date().toISOString())} UTC</span></header><div class="page-head"><h1>${escapeHtml(title)}</h1><p class="subtitle">${escapeHtml(subtitle)}</p></div><div class="stack">${content}</div><footer class="footer">Время указано в UTC · «Последнее обращение» не означает открытие чата.</footer></main></div></body></html>`;
}
