import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';

function periodLabel(hours: number): string {
  if (hours <= 24) return '24 часа';
  if (hours <= 24 * 7) return '7 дней';
  return `${Math.round(hours / 24)} дней`;
}

function formatChangeFlags(task: { statusChanged: boolean; commented: boolean; overdue: boolean }): string {
  const flags = [
    task.statusChanged ? '🔄 смена статуса' : null,
    task.commented ? '💬 комментарий / активность' : null,
    task.overdue ? '⏰ просрочена' : null
  ].filter(Boolean);

  return flags.length ? ` (${flags.join(', ')})` : '';
}

function formatDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatTaskDetailLines(task: {
  statusChangeText?: string;
  activityText?: string;
  overdue: boolean;
  updatedAt?: string;
}): string[] {
  const details = [
    task.statusChangeText ? `   • ${task.statusChangeText}` : null,
    task.activityText ? `   • ${task.activityText}` : null,
    task.overdue ? '   • Задача просрочена' : null
  ].filter(Boolean) as string[];

  if (details.length) return details;

  const updatedAt = formatDateTime(task.updatedAt);
  return [updatedAt ? `   • Последнее обновление: ${updatedAt}` : '   • Было обновление по задаче'];
}

export function formatChangesEntryPoint(isManager: boolean): string {
  return [
    '🕒 Что изменилось',
    '',
    'Выберите, что посмотреть:',
    '• Мои задачи',
    ...(isManager ? ['• Моя команда'] : []),
    '',
    'Дальше я предложу период анализа.'
  ].join('\n');
}

export function formatChangesPeriodPicker(scope: 'my' | 'team'): string {
  return [
    scope === 'my' ? '🕒 Изменения — мои задачи' : '🕒 Изменения — моя команда',
    '',
    'Выберите период:',
    '• 24 часа',
    '• 7 дней'
  ].join('\n');
}

function formatTaskTitle(
  task: {
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    statusChanged: boolean;
    commented: boolean;
    overdue: boolean;
  },
  index: number,
  scope: 'my' | 'team'
): string {
  const queuePart = task.queue ? ` [${task.queue}]` : '';
  const assigneePart = scope === 'team' && task.assignee ? ` — ${task.assignee}` : '';

  return `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${queuePart}${assigneePart}${formatChangeFlags(task)}`;
}

export function formatChangesSummary(summary: {
  scope: 'my' | 'team';
  periodHours: number;
  titleTarget: string;
  changedIssuesCount: number;
  statusChangedCount: number;
  commentedCount: number;
  overdueCount: number;
  topTasks: Array<{
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    updatedAt?: string;
    statusChanged: boolean;
    commented: boolean;
    overdue: boolean;
    statusChangeText?: string;
    activityText?: string;
  }>;
  queueStats?: Array<{ key: string; changed: number }>;
}): string {
  const scopeTitle = summary.scope === 'my' ? '🕒 Что изменилось — мои задачи' : '🕒 Что изменилось — моя команда';
  const taskBlocks = summary.topTasks.length
    ? summary.topTasks.flatMap((task, index) => [
        formatTaskTitle(task, index, summary.scope),
        ...formatTaskDetailLines(task),
        '────────'
      ]).slice(0, -1)
    : ['1. За выбранный период заметных изменений не найдено'];

  const sections = [
    [
      scopeTitle,
      `⏱ Период: ${periodLabel(summary.periodHours)}`,
      summary.scope === 'my' ? `👤 Профиль: ${summary.titleTarget}` : `📚 Очереди: ${summary.titleTarget}`
    ].join('\n'),
    [
      '📊 Итог',
      `• Изменившихся задач: ${summary.changedIssuesCount}`,
      `• Со сменой статуса: ${summary.statusChangedCount}`,
      `• С комментариями / активностью: ${summary.commentedCount}`,
      `• Просроченных среди изменившихся: ${summary.overdueCount}`
    ].join('\n'),
    summary.scope === 'team' && summary.queueStats?.length
      ? [
          '🗂 По очередям',
          ...summary.queueStats.map((queue) => `• ${queue.key}: изменений ${queue.changed}`)
        ].join('\n')
      : null,
    [
      '🔥 Главное за период',
      ...taskBlocks
    ].join('\n').trim()
  ].filter(Boolean);

  return sections.join('\n\n');
}
