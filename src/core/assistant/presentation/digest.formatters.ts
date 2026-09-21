import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import {
  buildMyActiveIssuesUrl,
  buildMyAllIssuesUrl,
  buildMyOverdueIssuesUrl,
  buildMyRecentlyUpdatedIssuesUrl,
  buildTeamActiveIssuesUrl,
  buildTeamAllIssuesUrl,
  buildTeamOverdueIssuesUrl,
  buildTeamStaleIssuesUrl,
  formatMetricLink
} from '../../../shared/utils/tracker-query-links';

function formatTaskFlags(flagsSource: {
  overdue: boolean;
}): string {
  const flags = [
    flagsSource.overdue ? '⏰ просрочена' : null
  ].filter(Boolean);

  return flags.length ? ` (${flags.join(', ')})` : '';
}

export function formatEmployeeDigest(summary: {
  login?: string;
  matchedAssigneeCandidate?: string;
  terminalStatusNames?: string[];
  totalAssigned: number;
  activeAssigned: number;
  overdueCount: number;
  recentlyUpdatedCount: number;
  topTasks: Array<{
    key: string;
    summary?: string;
    overdue: boolean;
  }>;
}): string {
  const focusLines = summary.topTasks.length
    ? summary.topTasks.slice(0, 3).map((task, index) =>
        `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${formatTaskFlags(task)}`
      )
    : ['1. Активных задач не найдено'];

  const linkLogin = summary.matchedAssigneeCandidate || summary.login;

  return [
    '☀️ Личный дайджест',
    summary.matchedAssigneeCandidate ? `👤 Профиль: ${summary.matchedAssigneeCandidate}` : null,
    '',
    '📊 На сегодня',
    linkLogin ? `• ${formatMetricLink(`Всего задач на мне: ${summary.totalAssigned}`, buildMyAllIssuesUrl(linkLogin))}` : `• Всего задач на мне: ${summary.totalAssigned}`,
    linkLogin && summary.terminalStatusNames ? `• ${formatMetricLink(`Активных: ${summary.activeAssigned}`, buildMyActiveIssuesUrl(linkLogin, summary.terminalStatusNames))}` : `• Активных: ${summary.activeAssigned}`,
    linkLogin && summary.terminalStatusNames ? `• ${formatMetricLink(`Просрочено: ${summary.overdueCount}`, buildMyOverdueIssuesUrl(linkLogin, summary.terminalStatusNames))}` : `• Просрочено: ${summary.overdueCount}`,
    linkLogin && summary.terminalStatusNames ? `• ${formatMetricLink(`Обновлялись за 24ч: ${summary.recentlyUpdatedCount}`, buildMyRecentlyUpdatedIssuesUrl(linkLogin, summary.terminalStatusNames))}` : `• Обновлялись за 24ч: ${summary.recentlyUpdatedCount}`,
    '',
    '🎯 Главное',
    ...focusLines
  ].filter(Boolean).join('\n');
}

export function formatManagerDigest(summary: {
  manager?: { display?: string };
  queues: Array<{ key: string; name?: string }>;
  terminalStatusNames: string[];
  totalIssues: number;
  activeIssues: number;
  overdueCount: number;
  staleCount: number;
  queueStats: Array<{
    key: string;
    name?: string;
    active: number;
    overdue: number;
    stale: number;
  }>;
  topTasks: Array<{
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    overdue: boolean;
    stale: boolean;
  }>;
}): string {
  const queueKeys = summary.queues.map((queue) => queue.key);
  const queueLine = summary.queues.map((queue) => queue.key).join(', ');
  const queueLines = summary.queueStats.slice(0, 5).map((queue) =>
    `• ${queue.key}: активных ${queue.active}, просрочено ${queue.overdue}, без движения ${queue.stale}`
  );

  const focusLines = summary.topTasks.length
    ? summary.topTasks.slice(0, 5).map((task, index) => {
        const flags = [
          task.overdue ? '⏰ просрочена' : null,
          task.stale ? '🕸 без движения' : null
        ].filter(Boolean);

        return `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
      })
    : ['1. Критичных активных задач не найдено'];

  return [
    summary.manager?.display ? `👥 Дайджест руководителя — ${summary.manager.display}` : '👥 Дайджест руководителя',
    `📚 Очереди: ${queueLine}`,
    '',
    '📊 По команде',
    `• ${formatMetricLink(`Всего задач: ${summary.totalIssues}`, buildTeamAllIssuesUrl(queueKeys))}`,
    `• ${formatMetricLink(`Активных: ${summary.activeIssues}`, buildTeamActiveIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${summary.overdueCount}`, buildTeamOverdueIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Без движения > 7д: ${summary.staleCount}`, buildTeamStaleIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    '',
    '🗂 По очередям',
    ...(queueLines.length ? queueLines : ['• Нет данных']),
    '',
    '🔥 Куда смотреть',
    ...focusLines
  ].join('\n');
}

export function formatCombinedDigest(parts: { employee: string; manager?: string }): string {
  return [parts.employee, parts.manager ? `\n━━━━━━━━━━\n${parts.manager}` : null]
    .filter(Boolean)
    .join('\n');
}
