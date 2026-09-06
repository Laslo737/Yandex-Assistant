import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import {
  buildTeamActiveIssuesUrl,
  buildTeamAllIssuesUrl,
  buildTeamOverdueIssuesUrl,
  buildTeamStaleIssuesUrl,
  buildTeamWaitingForReplyUrl,
  formatMetricLink
} from '../../../shared/utils/tracker-query-links';

type HealthFormatterResult = {
  manager?: { display?: string };
  score: number;
  statusLabel: string;
  headline: string;
  mainRisk?: string;
  whatHappened: string[];
  bottlenecks: string[];
  todayActions: string[];
  oldBacklogLines: string[];
  queues: Array<{ key: string; name?: string }>;
  terminalStatusNames: string[];
  overdueCount: number;
  staleCount: number;
  waitingForReplyCount: number;
  activeIssues: number;
  risks: string[];
  recommendations: string[];
  queueHighlights: Array<{
    key: string;
    name?: string;
    active: number;
    overdue: number;
    stale: number;
    waitingForReply: number;
    healthLabel: string;
  }>;
  topTasks: Array<{
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    overdue: boolean;
    stale: boolean;
    waitingForUser: boolean;
  }>;
};

function softenStatusLabel(label: string): string {
  return label
    .replace('🔴 зона риска', '🔴 требует внимания')
    .replace('🟡 требует внимания', '🟡 есть точки внимания');
}

function softenRiskLine(risk: string): string {
  return risk
    .replace('Много задач без движения > 7д', 'Много задач давно без движения')
    .replace('Высокая активная нагрузка в очереди', 'Большой объем активных задач в очереди');
}

function formatExecutiveSummary(result: HealthFormatterResult): string[] {
  if (result.mainRisk) {
    return [`${result.score < 65 ? '🔴' : result.score < 85 ? '🟡' : '🟢'} ${result.mainRisk}`];
  }

  if (result.score >= 85) {
    return ['🟢 Команда выглядит стабильно: критичных сигналов немного, можно держать обычный ритм контроля.'];
  }

  const highlights: string[] = [];

  if (result.overdueCount > 0) {
    highlights.push(`есть ${result.overdueCount} просроченных задач`);
  }
  if (result.staleCount > 0) {
    highlights.push(`${result.staleCount} задач давно без движения`);
  }
  if (result.waitingForReplyCount > 0) {
    highlights.push(`${result.waitingForReplyCount} задач ждут ответа`);
  }

  if (!highlights.length) {
    return ['🟡 Есть отдельные точки внимания, но без явной критики по ключевым сигналам.'];
  }

  return [`${result.score < 65 ? '🔴' : '🟡'} Главные сигналы: ${highlights.slice(0, 3).join(', ')}.`];
}

function formatInsightLines(items: string[], emptyText: string): string[] {
  return items.length ? items.map((item) => `• ${softenRiskLine(item)}`) : [`• ${emptyText}`];
}

function pluralizeTask(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return 'задача';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
  return 'задач';
}

function buildSingleQueueWhatHappenedLines(result: HealthFormatterResult, queueKeys: string[]): string[] {
  return [
    formatMetricLink(`В активной работе ${result.activeIssues} ${pluralizeTask(result.activeIssues)}`, buildTeamActiveIssuesUrl(queueKeys, result.terminalStatusNames)),
    result.overdueCount > 0
      ? formatMetricLink(`Просрочено ${result.overdueCount} ${pluralizeTask(result.overdueCount)}`, buildTeamOverdueIssuesUrl(queueKeys, result.terminalStatusNames))
      : 'Явных просрочек сейчас нет.',
    result.staleCount > 0
      ? formatMetricLink(`${result.staleCount} ${pluralizeTask(result.staleCount)} давно без движения`, buildTeamStaleIssuesUrl(queueKeys, result.terminalStatusNames))
      : 'Критичных зависаний без движения сейчас не видно.',
    result.waitingForReplyCount > 0
      ? formatMetricLink(`${result.waitingForReplyCount} ${pluralizeTask(result.waitingForReplyCount)} ждут ответа`, buildTeamWaitingForReplyUrl(queueKeys, result.terminalStatusNames))
      : 'Зависших ожиданий ответа сейчас не видно.'
  ];
}

function formatQueueHighlightLine(
  queue: {
    key: string;
    active: number;
    overdue: number;
    stale: number;
    waitingForReply: number;
    healthLabel: string;
  },
  terminalStatusNames: string[]
): string {
  const queueKeys = [queue.key];

  return [
    `• ${queue.key}: ${softenStatusLabel(queue.healthLabel)}`,
    formatMetricLink(`активных ${queue.active}`, buildTeamActiveIssuesUrl(queueKeys, terminalStatusNames)),
    formatMetricLink(`просрочено ${queue.overdue}`, buildTeamOverdueIssuesUrl(queueKeys, terminalStatusNames)),
    formatMetricLink(`без движения ${queue.stale}`, buildTeamStaleIssuesUrl(queueKeys, terminalStatusNames)),
    formatMetricLink(`ждут ответа ${queue.waitingForReply}`, buildTeamWaitingForReplyUrl(queueKeys, terminalStatusNames)),
    formatMetricLink('все задачи', buildTeamAllIssuesUrl(queueKeys))
  ].join(' — ');
}

function formatTaskLines(tasks: HealthFormatterResult['topTasks'], includeQueue = true): string[] {
  return tasks.length
    ? tasks.slice(0, 5).map((task, index) => {
        const flags = [
          task.overdue ? '⏰ просрочена' : null,
          task.stale ? '🕸 без движения' : null,
          task.waitingForUser ? '💬 ждет ответа' : null
        ].filter(Boolean);

        return `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${includeQueue && task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
      })
    : ['1. Явных проблемных задач не найдено'];
}

function formatSingleQueueHealth(result: HealthFormatterResult): string {
  const queue = result.queueHighlights[0];
  const queueKeys = result.queues.map((item) => item.key);
  const queueLabel = queue
    ? `${queue.key}${queue.name && queue.name !== queue.key ? ` — ${queue.name}` : ''}`
    : result.queues[0]
      ? `${result.queues[0].key}${result.queues[0].name && result.queues[0].name !== result.queues[0].key ? ` — ${result.queues[0].name}` : ''}`
      : 'не определена';

  return [
    result.manager?.display ? `🧭 Сводка руководителя — ${result.manager.display}` : '🧭 Сводка руководителя',
    `📁 Очередь: ${queueLabel}`,
    '',
    `🏥 Статус: ${softenStatusLabel(result.statusLabel)} · Health ${result.score}/100`,
    `💡 ${result.headline}`,
    ...formatExecutiveSummary(result),
    '',
    '📌 Что произошло',
    ...formatInsightLines(buildSingleQueueWhatHappenedLines(result, queueKeys), 'Существенных отклонений не видно.'),
    '',
    '✅ Что сделать сегодня',
    ...formatInsightLines(Array.from(new Set(result.todayActions)), 'Поддерживать текущий темп и контролировать обновления.'),
    '',
    '🔥 Куда смотреть в первую очередь',
    ...formatTaskLines(result.topTasks, false)
  ].join('\n');
}

function formatMultiQueueHealth(result: HealthFormatterResult): string {
  const queueKeys = result.queues.map((queue) => queue.key);
  const queueLine = result.queues.map((queue) => queue.key).join(', ');

  const queueLines = result.queueHighlights.length
    ? result.queueHighlights.map((queue) => formatQueueHighlightLine(queue, result.terminalStatusNames))
    : ['• Нет данных по очередям'];

  return [
    result.manager?.display ? `🧭 Сводка руководителя — ${result.manager.display}` : '🧭 Сводка руководителя',
    `📚 Очереди: ${queueLine}`,
    '',
    `🏥 Статус: ${softenStatusLabel(result.statusLabel)} · Health ${result.score}/100`,
    `💡 ${result.headline}`,
    ...formatExecutiveSummary(result),
    '',
    '📌 Что произошло',
    ...formatInsightLines(result.whatHappened, 'Существенных отклонений не видно.'),
    `• ${formatMetricLink(`Активных задач: ${result.activeIssues}`, buildTeamActiveIssuesUrl(queueKeys, result.terminalStatusNames))}`,
    `• ${formatMetricLink(`Просрочено: ${result.overdueCount}`, buildTeamOverdueIssuesUrl(queueKeys, result.terminalStatusNames))}`,
    `• ${formatMetricLink(`Без движения > 7д: ${result.staleCount}`, buildTeamStaleIssuesUrl(queueKeys, result.terminalStatusNames))}`,
    '',
    '🗂 Где больше всего внимания',
    ...queueLines,
    '',
    '✅ Что сделать сегодня',
    ...formatInsightLines(Array.from(new Set(result.todayActions)), 'Поддерживать текущий темп и контролировать обновления.'),
    '',
    '🔥 Куда смотреть в первую очередь',
    ...formatTaskLines(result.topTasks, true)
  ].join('\n');
}

export function formatHealthCheck(result: HealthFormatterResult): string {
  if (result.queues.length <= 1) {
    return formatSingleQueueHealth(result);
  }

  return formatMultiQueueHealth(result);
}
