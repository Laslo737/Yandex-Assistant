import { formatTrackerIssueLabel } from '../../../shared/utils/tracker-links';
import {
  buildTeamActiveIssuesUrl,
  buildTeamLongInProgressIssuesUrl,
  buildTeamOldBacklogIssuesUrl,
  buildTeamOverdueIssuesUrl,
  buildTeamStaleIssuesUrl,
  formatMetricLink
} from '../../../shared/utils/tracker-query-links';

type ProcessAnalysisFormatterResult = {
  manager?: { display?: string };
  queues: Array<{ key: string; name?: string }>;
  terminalStatusNames: string[];
  singleQueueMode: boolean;
  primaryQueueKey?: string;
  activeIssues: number;
  overdueCount: number;
  staleCount: number;
  longInProgressCount: number;
  oldBacklogCount: number;
  veryLongInProgressCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskType: 'overdue' | 'stuck' | 'overload' | 'old_tail' | 'mixed';
  headline: string;
  mainRisk?: string;
  mainFinding: string;
  summaryLines: string[];
  keySignals: string[];
  liveRiskLines: string[];
  hygieneRiskLines: string[];
  oldBacklogLines: string[];
  todayActions: string[];
  queueHighlights: Array<{
    key: string;
    name?: string;
    active: number;
    overdue: number;
    stale: number;
    longInProgress: number;
    score: number;
  }>;
  assigneeHighlights: Array<{
    assignee: string;
    longInProgressCount: number;
    averageDaysInProgress: number;
    topIssueKeys: string[];
  }>;
  topTasks: Array<{
    key: string;
    summary?: string;
    queue?: string;
    assignee?: string;
    overdue: boolean;
    stale: boolean;
    longInProgress: boolean;
    veryOldStale: boolean;
    veryLongInProgress: boolean;
    daysWithoutUpdate?: number;
    daysInProgress?: number;
  }>;
};

function formatTaskFlags(task: ProcessAnalysisFormatterResult['topTasks'][number]): string {
  const flags: string[] = [];

  if (task.overdue) flags.push('⏰ просрочена');
  if (task.stale && task.daysWithoutUpdate !== undefined) flags.push(`🕸️ без движения ${task.daysWithoutUpdate}д`);
  if (task.longInProgress && task.daysInProgress !== undefined) flags.push(`⌛️ в работе ${task.daysInProgress}д`);
  if (task.veryOldStale || task.veryLongInProgress) flags.push('🧹 старый хвост');

  return flags.join(', ');
}

function formatCount(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} ${few}`;
  return `${value} ${many}`;
}

function formatRiskLevel(level: ProcessAnalysisFormatterResult['riskLevel']): string {
  if (level === 'high') return 'Высокий риск';
  if (level === 'medium') return 'Средний риск';
  return 'Низкий риск';
}

function formatRiskType(type: ProcessAnalysisFormatterResult['riskType']): string {
  switch (type) {
    case 'mixed':
      return 'смешанный риск';
    case 'old_tail':
      return 'старый хвост';
    case 'overdue':
      return 'просрочка';
    case 'stuck':
      return 'живой стопор';
    default:
      return 'перегруз';
  }
}

function formatQueueLine(
  queue: ProcessAnalysisFormatterResult['queueHighlights'][number],
  terminalStatusNames: string[]
): string {
  const queueKeys = [queue.key];

  return [
    `• ${queue.key}`,
    formatMetricLink(`активных ${queue.active}`, buildTeamActiveIssuesUrl(queueKeys, terminalStatusNames)),
    formatMetricLink(`просрочено ${queue.overdue}`, buildTeamOverdueIssuesUrl(queueKeys, terminalStatusNames)),
    formatMetricLink(`без движения ${queue.stale}`, buildTeamStaleIssuesUrl(queueKeys, terminalStatusNames)),
    `долго в работе ${queue.longInProgress}`
  ].join(' — ');
}

function formatTopTaskLine(
  task: ProcessAnalysisFormatterResult['topTasks'][number],
  index: number,
  singleQueueMode: boolean
): string {
  const flags = formatTaskFlags(task);
  return `${index + 1}. ${formatTrackerIssueLabel(task.key)} — ${task.summary || 'без названия'}${!singleQueueMode && task.queue ? ` [${task.queue.toUpperCase()}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags ? ` (${flags})` : ''}`;
}

function formatIssueMentionLine(line: string): string {
  return line.replace(/\b([A-Z][A-Z0-9_]+-\d+)\b/i, (match) => formatTrackerIssueLabel(match.toUpperCase()));
}

export function formatProcessAnalysis(result: ProcessAnalysisFormatterResult): string {
  const queueKeys = result.queues.map((queue) => queue.key);
  const singleQueueKey = result.queues[0]?.key;
  const title = result.singleQueueMode
    ? `📈 Риски в очереди${singleQueueKey ? ` — ${singleQueueKey}` : ''}`
    : result.manager?.display
      ? `📈 Риски по очередям — ${result.manager.display}`
      : '📈 Риски по очередям';

  const topTaskLines = result.topTasks.length
    ? result.topTasks.map((task, index) => formatTopTaskLine(task, index, result.singleQueueMode))
    : ['1. Явных проблемных задач не найдено'];

  const assigneeLines = result.assigneeHighlights.length
    ? result.assigneeHighlights.map((item) => {
        const issues = item.topIssueKeys.map((key) => formatTrackerIssueLabel(key)).join(', ');
        return `• ${item.assignee} — ${formatCount(item.longInProgressCount, 'задача', 'задачи', 'задач')}, в среднем ${item.averageDaysInProgress}д в работе${issues ? ` (${issues})` : ''}`;
      })
    : [];

  const queueLines = result.queueHighlights.length
    ? result.queueHighlights.map((queue) => formatQueueLine(queue, result.terminalStatusNames))
    : ['• Нет данных по очередям'];

  const metricLines = [
    `• ${formatMetricLink(`Активных задач: ${result.activeIssues}`, buildTeamActiveIssuesUrl(queueKeys, result.terminalStatusNames))}`,
    ...(result.overdueCount > 0
      ? [`• ${formatMetricLink(`Просрочено: ${result.overdueCount}`, buildTeamOverdueIssuesUrl(queueKeys, result.terminalStatusNames))}`]
      : []),
    ...(result.staleCount > 0
      ? [`• ${formatMetricLink(`Без движения > 7д: ${result.staleCount}`, buildTeamStaleIssuesUrl(queueKeys, result.terminalStatusNames))}`]
      : []),
    ...(result.longInProgressCount > 0
      ? [`• ${formatMetricLink(`${formatCount(result.longInProgressCount, 'задача', 'задачи', 'задач')} в работе больше 10д`, buildTeamLongInProgressIssuesUrl(queueKeys, result.terminalStatusNames, 10))}`]
      : [])
  ];

  const singleQueueSections = [
    title,
    ...(result.manager?.display ? [`👤 ${result.manager.display}`] : []),
    `⚖️ ${formatRiskLevel(result.riskLevel)} · ${formatRiskType(result.riskType)}`,
    '',
    '💡 Главное',
    result.mainFinding,
    '',
    '📌 Что важно сейчас',
    ...result.keySignals.map((line) => `• ${line}`),
    ...(result.keySignals.length === 0 ? ['• Критичных сигналов по базовым правилам сейчас не видно.'] : []),
    '',
    '🧹 Старый хвост',
    ...(result.hygieneRiskLines.length
      ? result.hygieneRiskLines.map((line) => `• ${formatIssueMentionLine(line)}`)
      : ['• Явного старого хвоста по базовым сигналам не видно.']),
    '',
    '✅ Что сделать сейчас',
    ...result.todayActions.map((line) => `• ${line}`),
    '',
    '🔎 Куда смотреть первым',
    ...topTaskLines.slice(0, 3),
    '',
    '🔗 Открыть выборки',
    ...metricLines,
    ...(assigneeLines.length
      ? ['', '👤 Кто держит задачи дольше нормы', ...assigneeLines]
      : [])
  ];

  const multiQueueSections = [
    title,
    `📚 Очереди: ${queueKeys.join(', ')}`,
    '',
    '💡 Главное',
    result.mainFinding,
    ...(result.mainRisk ? ['', `⚠️ ${result.mainRisk}`] : []),
    '',
    '📌 Что важно сейчас',
    ...result.summaryLines.map((line) => `• ${line}`),
    ...(result.summaryLines.length === 0 ? ['• Критичных сигналов по базовым правилам сейчас не видно.'] : []),
    '',
    '🔗 Открыть выборки',
    ...metricLines,
    ...(result.oldBacklogLines.length
      ? [
          '',
          '🧹 Старый хвост',
          ...(result.oldBacklogCount > 0
            ? [
                `• ${formatMetricLink(
                  `${result.oldBacklogLines[0]}`,
                  buildTeamOldBacklogIssuesUrl(queueKeys, result.terminalStatusNames, 90)
                )}`
              ]
            : []),
          ...(result.veryLongInProgressCount > 0
            ? [
                `• ${formatMetricLink(
                  `${result.oldBacklogLines[result.oldBacklogCount > 0 ? 1 : 0]}`,
                  buildTeamLongInProgressIssuesUrl(queueKeys, result.terminalStatusNames, 90)
                )}`
              ]
            : [])
        ]
      : []),
    '',
    '✅ Что сделать сейчас',
    ...result.todayActions.map((line) => `• ${line}`),
    '',
    '🗂 Где больше всего внимания',
    ...queueLines,
    ...(assigneeLines.length ? ['', '👤 Кто держит задачи слишком долго', ...assigneeLines] : []),
    '',
    '🔥 Куда смотреть в первую очередь',
    ...topTaskLines.slice(0, 3)
  ];

  return (result.singleQueueMode ? singleQueueSections : multiQueueSections).join('\n');
}
