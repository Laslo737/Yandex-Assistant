import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import {
  buildTeamActiveIssuesUrl,
  buildTeamAllIssuesUrl,
  buildTeamOverdueIssuesUrl,
  buildTeamStaleIssuesUrl,
  formatMetricLink
} from '../../../shared/utils/tracker-query-links';

type ManagerFormatterSummary = {
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
    total: number;
    active: number;
    overdue: number;
    stale: number;
    topTasks: Array<{
      key: string;
      summary?: string;
      assignee?: string;
      overdue: boolean;
      stale: boolean;
    }>;
  }>;
  topTasks: Array<{
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    overdue: boolean;
    stale: boolean;
  }>;
};

function formatTaskFlags(flagsSource: {
  overdue: boolean;
  stale: boolean;
}): string {
  const flags = [
    flagsSource.overdue ? '⏰ просрочена' : null,
    flagsSource.stale ? '🕸 без движения' : null
  ].filter(Boolean);

  return flags.length ? ` (${flags.join(', ')})` : '';
}

function formatCompactMetrics(metrics: {
  total: number;
  active: number;
  overdue: number;
  stale: number;
}): string[] {
  return [
    `• Всего задач: ${metrics.total}`,
    `• Активных: ${metrics.active}`,
    `• Просрочено: ${metrics.overdue}`,
    `• Без движения > 7д: ${metrics.stale}`
  ];
}

function formatLinkedQueueMetrics(
  queueKey: string,
  metrics: {
    total: number;
    active: number;
    overdue: number;
    stale: number;
  },
  terminalStatusNames: string[]
): string[] {
  const queueKeys = [queueKey];

  return [
    `• ${formatMetricLink(`Всего задач: ${metrics.total}`, buildTeamAllIssuesUrl(queueKeys))}`,
    `• ${formatMetricLink(`Активных: ${metrics.active}`, buildTeamActiveIssuesUrl(queueKeys, terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${metrics.overdue}`, buildTeamOverdueIssuesUrl(queueKeys, terminalStatusNames))}`,
    `• ${formatMetricLink(`Без движения > 7д: ${metrics.stale}`, buildTeamStaleIssuesUrl(queueKeys, terminalStatusNames))}`
  ];
}

function formatSingleQueueView(summary: ManagerFormatterSummary): string {
  const queue = summary.queueStats[0];
  const queueKeys = summary.queues.map((item) => item.key);
  const queueLabel = queue ? `${queue.key}${queue.name ? ` — ${queue.name}` : ''}` : 'не определена';
  const focusLines = queue?.topTasks?.length
    ? queue.topTasks.map((task, index) =>
        `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`
      )
    : ['1. Критичных активных задач не найдено'];

  return [
    summary.manager?.display ? `👥 Моя команда — ${summary.manager.display}` : '👥 Моя команда',
    queue ? `📁 Очередь: ${queueLabel}` : null,
    '',
    '📊 Сейчас',
    `• ${formatMetricLink(`Всего задач: ${summary.totalIssues}`, buildTeamAllIssuesUrl(queueKeys))}`,
    `• ${formatMetricLink(`Активных: ${summary.activeIssues}`, buildTeamActiveIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${summary.overdueCount}`, buildTeamOverdueIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Без движения > 7д: ${summary.staleCount}`, buildTeamStaleIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    '',
    '🎯 Фокус',
    ...focusLines
  ].filter(Boolean).join('\n');
}

function formatMultiQueueView(summary: ManagerFormatterSummary): string {
  const queueKeys = summary.queues.map((item) => item.key);
  const queueLine = summary.queues.length
    ? summary.queues.map((queue) => queue.key).join(', ')
    : 'нет очередей';

  const queueBlocks = summary.queueStats.length
    ? summary.queueStats.flatMap((queue) => {
        const queueTopTasks = queue.topTasks.length
          ? queue.topTasks.map((task, index) =>
              `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`
            )
          : ['1. Критичных активных задач не найдено'];

        return [
          `📁 ${queue.key}${queue.name ? ` — ${queue.name}` : ''}`,
          ...formatLinkedQueueMetrics(queue.key, queue, summary.terminalStatusNames),
          '🎯 Фокус',
          ...queueTopTasks,
          ''
        ];
      })
    : ['Нет данных по очередям'];

  const topTasks = summary.topTasks.length
    ? summary.topTasks.slice(0, 5).map((task, index) =>
        `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`
      )
    : ['1. Критичных активных задач не найдено'];

  return [
    summary.manager?.display ? `👥 Моя команда — ${summary.manager.display}` : '👥 Моя команда',
    `📚 Очереди: ${queueLine}`,
    '',
    '📊 Общая сводка',
    `• ${formatMetricLink(`Всего задач: ${summary.totalIssues}`, buildTeamAllIssuesUrl(queueKeys))}`,
    `• ${formatMetricLink(`Активных: ${summary.activeIssues}`, buildTeamActiveIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${summary.overdueCount}`, buildTeamOverdueIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    `• ${formatMetricLink(`Без движения > 7д: ${summary.staleCount}`, buildTeamStaleIssuesUrl(queueKeys, summary.terminalStatusNames))}`,
    '',
    '🗂 По очередям',
    ...queueBlocks,
    '🔥 Главный фокус',
    ...topTasks
  ].join('\n');
}

export function formatManagerSummary(summary: ManagerFormatterSummary): string {
  if (summary.queueStats.length <= 1) {
    return formatSingleQueueView(summary);
  }

  return formatMultiQueueView(summary);
}
