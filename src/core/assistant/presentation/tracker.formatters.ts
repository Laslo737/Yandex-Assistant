import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import {
  buildMyActiveIssuesUrl,
  buildMyOverdueIssuesUrl,
  buildMyRecentlyUpdatedIssuesUrl,
  formatMetricLink
} from '../../../shared/utils/tracker-query-links';

export function formatTrackerConnectionPreview(preview: {
  ok: boolean;
  reason?: string;
  queueCount?: number;
  sampleQueues?: Array<{ id: string; key: string; name?: string }>;
}): string {
  if (!preview.ok) {
    return [
      'Tracker connection preview недоступен.',
      preview.reason ? `Причина: ${preview.reason}` : null
    ].filter(Boolean).join('\n');
  }

  return [
    'Tracker connection preview:',
    `- queues found: ${preview.queueCount ?? 0}`,
    ...(preview.sampleQueues?.length
      ? ['- sample queues:', ...preview.sampleQueues.map((queue) => `  - ${queue.key} (${queue.id})${queue.name ? ` — ${queue.name}` : ''}`)]
      : ['- sample queues: none'])
  ].join('\n');
}

export function formatIssueBundlePreview(preview: {
  key: string;
  summary?: string;
  status?: string;
  queue?: string;
  assignee?: string;
  commentsCount: number;
  changelogCount: number;
  usersDiscovered: number;
  customFieldCount: number;
  latestCommentAt?: string;
  latestIssueUpdateAt?: string;
}): string {
  return [
    `Tracker issue preview: ${formatTrackerIssueLabel(preview.key)}`,
    preview.summary ? `summary: ${preview.summary}` : null,
    preview.queue ? `queue: ${preview.queue}` : null,
    preview.status ? `status: ${preview.status}` : null,
    `assignee: ${preview.assignee || 'none'}`,
    `comments: ${preview.commentsCount}`,
    `changelog: ${preview.changelogCount}`,
    `users: ${preview.usersDiscovered}`,
    `custom fields: ${preview.customFieldCount}`,
    preview.latestCommentAt ? `last comment: ${preview.latestCommentAt}` : null,
    preview.latestIssueUpdateAt ? `updated: ${preview.latestIssueUpdateAt}` : null
  ].filter(Boolean).join(' | ');
}

export function formatMyDaySummary(summary: {
  login: string;
  assigneeCandidates: string[];
  matchedAssigneeCandidate?: string;
  terminalStatusNames: string[];
  totalAssigned: number;
  activeAssigned: number;
  overdueCount: number;
  recentlyUpdatedCount: number;
  topTasks: Array<{
    key: string;
    summary?: string;
    status?: string;
    overdue: boolean;
  }>;
}): string {
  const topLines = summary.topTasks.length
    ? summary.topTasks.slice(0, 3).map((task, index) => {
        const flags = [task.overdue ? '⏰ просрочена' : null]
          .filter(Boolean)
          .join(', ');

        return `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${flags ? ` (${flags})` : ''}`;
      })
    : ['1. Активных задач не найдено'];

  const linkLogin = summary.matchedAssigneeCandidate || summary.login;

  const title = summary.matchedAssigneeCandidate
    ? `☀️ Мой день — ${summary.matchedAssigneeCandidate}`
    : '☀️ Мой день';

  return [
    title,
    '',
    '📊 Сейчас',
    `• ${formatMetricLink(`Активных: ${summary.activeAssigned}`, buildMyActiveIssuesUrl(linkLogin, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${summary.overdueCount}`, buildMyOverdueIssuesUrl(linkLogin, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Были обновления за 24ч: ${summary.recentlyUpdatedCount}`, buildMyRecentlyUpdatedIssuesUrl(linkLogin, summary.terminalStatusNames))}`,
    summary.activeAssigned === 0
      ? `• Диагностика: login=${summary.login}; candidates=${summary.assigneeCandidates.join(', ')}; matched=${summary.matchedAssigneeCandidate || 'none'}`
      : null,
    '',
    '🎯 Фокус на сегодня',
    ...topLines
  ].filter((line) => line !== null).join('\n');
}
