import { env } from '../../config/env';
import { buildShortRedirectUrl } from './short-link-store';

function normalizeLogin(login: string): string {
  return login.trim().replace(/^@/, '');
}

function exactLogin(login: string): string {
  const normalized = normalizeLogin(login);
  return normalized.endsWith('@') ? normalized : `${normalized}@`;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function uniqueStatusNames(statuses: string[]): string[] {
  return Array.from(new Set(statuses.map((item) => item.trim()).filter(Boolean)));
}

function excludeStatusesClause(statuses: string[]): string {
  return uniqueStatusNames(statuses)
    .map((status) => `Status: !"${escapeQueryValue(status)}"`)
    .join(' ');
}

function includeStatusesClause(statuses: string[]): string {
  const items = uniqueStatusNames(statuses);
  if (!items.length) return '';
  return `Status: ${items.map((status) => `"${escapeQueryValue(status)}"`).join(', ')}`;
}

function joinClauses(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildIssuesUrl(query: string, order = 'updated DESC'): string {
  const baseUrl = env.tracker.webBaseUrl.replace(/\/+$/, '');
  const encodedOrder = strictEncode(order.replace(/\s+/g, '+'));
  const encodedQuery = strictEncode(query);
  return `${baseUrl}/issues?_newUi=1&_o=${encodedOrder}&_q=${encodedQuery}`;
}

export function buildMyAllIssuesUrl(login: string): string {
  return buildIssuesUrl(`Assignee: ${exactLogin(login)}`);
}

export function buildMyActiveIssuesUrl(login: string, terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    `Assignee: ${exactLogin(login)}`,
    excludeStatusesClause(terminalStatuses)
  ]));
}

export function buildMyClosedIssuesUrl(login: string, terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    `Assignee: ${exactLogin(login)}`,
    includeStatusesClause(terminalStatuses)
  ]));
}

export function buildMyOverdueIssuesUrl(login: string, terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    `Assignee: ${exactLogin(login)}`,
    excludeStatusesClause(terminalStatuses),
    'Deadline: < today()'
  ]));
}

export function buildMyRecentlyUpdatedIssuesUrl(login: string, terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    `Assignee: ${exactLogin(login)}`,
    excludeStatusesClause(terminalStatuses),
    'Updated: > now()-24h'
  ]));
}

function queueClause(queueKeys: string[]): string {
  const unique = Array.from(new Set(queueKeys.map((item) => item.trim()).filter(Boolean)));
  return unique.length === 1
    ? `Queue: ${escapeQueryValue(unique[0])}`
    : `Queue: ${unique.map((item) => `"${escapeQueryValue(item)}"`).join(', ')}`;
}

export function buildTeamAllIssuesUrl(queueKeys: string[]): string {
  return buildIssuesUrl(`${queueClause(queueKeys)}`);
}

export function buildTeamActiveIssuesUrl(queueKeys: string[], terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    queueClause(queueKeys),
    excludeStatusesClause(terminalStatuses)
  ]));
}

export function buildTeamOverdueIssuesUrl(queueKeys: string[], terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    queueClause(queueKeys),
    excludeStatusesClause(terminalStatuses),
    'Deadline: < today()'
  ]));
}

export function buildTeamStaleIssuesUrl(queueKeys: string[], terminalStatuses: string[]): string {
  return buildIssuesUrl(joinClauses([
    queueClause(queueKeys),
    excludeStatusesClause(terminalStatuses),
    'Updated: < now()-7d'
  ]));
}

export function buildTeamLongInProgressIssuesUrl(queueKeys: string[], terminalStatuses: string[], days: number): string {
  return buildIssuesUrl(joinClauses([
    queueClause(queueKeys),
    excludeStatusesClause(terminalStatuses),
    `Updated: < now()-${days}d`
  ]));
}

export function buildTeamOldBacklogIssuesUrl(queueKeys: string[], terminalStatuses: string[], days: number): string {
  return buildIssuesUrl(joinClauses([
    queueClause(queueKeys),
    excludeStatusesClause(terminalStatuses),
    `Updated: < now()-${days}d`
  ]));
}

export function formatMetricLink(label: string, url: string): string {
  return `[${label}](${buildShortRedirectUrl(url)})`;
}
