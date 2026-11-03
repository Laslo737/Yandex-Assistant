import { TrackerApiClient } from './tracker.client';
import { TrackerIssue } from './tracker.types';
import { buildMyActiveIssuesQuery, buildTeamActiveIssuesQuery } from '../../shared/utils/tracker-query-links';

export const ISSUE_AUTH_FIELDS = ['createdBy', 'followers', 'access', 'components'];

export function isTerminalIssue(issue: TrackerIssue, terminalStatusNames: string[]): boolean {
  return [issue.statusType?.id, issue.statusType?.key].some((type) => type === 'done' || type === 'cancelled') ||
    Boolean(issue.status?.display && terminalStatusNames.includes(issue.status.display));
}

async function fetchActiveIssues(client: TrackerApiClient, query: string, terminalStatuses: string[], fields: string[]) {
  // An unavailable status catalog must not silently turn an operational report into an archive scan.
  if (!terminalStatuses.some((name) => name.trim())) throw new Error('TERMINAL_STATUSES_UNAVAILABLE');
  const issues = new Map<string, TrackerIssue>();
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  do {
    // _search gives queue > filter > query precedence. Scope AND status belong in the SAME
    // query; adding a top-level queue/filter here would silently discard the active filter.
    const result = await client.searchIssues({ query, order: '-updatedAt' }, {
      fields: Array.from(new Set([...fields, 'status', 'statusType'])), perPage, page
    });
    if (!Array.isArray(result.issues)) throw new Error('INVALID_TRACKER_SEARCH_RESPONSE');
    for (const issue of result.issues) {
      if (!issue?.id || !issue.key) throw new Error('INVALID_TRACKER_SEARCH_RESPONSE');
      issues.set(issue.id, issue);
    }
    const pages = result.pagination.totalPages ??
      (result.pagination.totalCount === undefined ? undefined : Math.ceil(result.pagination.totalCount / perPage));
    if (pages !== undefined) {
      if (!Number.isInteger(pages) || pages < 0) throw new Error('INVALID_TRACKER_PAGINATION');
      totalPages = Math.max(pages, 1);
    } else {
      totalPages = result.issues.length === perPage ? page + 1 : page;
    }
    page++;
  } while (page <= totalPages);
  // Defensive check before ACL/scoring: a closed task must not become a focus item even
  // if the source changes state during pagination or unexpectedly ignores a filter.
  return Array.from(issues.values()).filter((issue) => !isTerminalIssue(issue, terminalStatuses));
}

export function fetchActiveIssuesByAssignee(client: TrackerApiClient, login: string, terminalStatuses: string[], fields: string[]) {
  return fetchActiveIssues(client, buildMyActiveIssuesQuery(login, terminalStatuses), terminalStatuses, fields);
}
export function fetchActiveIssuesByQueue(client: TrackerApiClient, queueKey: string, terminalStatuses: string[], fields: string[]) {
  return fetchActiveIssues(client, buildTeamActiveIssuesQuery([queueKey], terminalStatuses), terminalStatuses, fields);
}
