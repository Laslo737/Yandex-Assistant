import { TrackerApiClient } from '../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../authorization/application/issue-authorization.service';
import { isDone, WorkdayService } from '../workday/application/workday.service';
import { fetchActiveIssuesByAssignee, ISSUE_AUTH_FIELDS } from '../../integrations/yandex-tracker/active-issues';
import { dateOnly, nextDate, priorityRank } from './digest-calendar';
import { formatTrackerIssueLabel } from '../../shared/utils/tracker-links';
import { buildMyActiveIssuesUrl, buildMyDueTodayIssuesUrl, buildMyOverdueIssuesUrl, formatMetricLink } from '../../shared/utils/tracker-query-links';
import { YandexMessengerReplyMessage } from '../../interfaces/yandex-messenger/yandex-messenger.types';

export interface DailyTask {
  key: string; summary?: string; deadline?: string; priority?: string; priorityKey?: string;
}
export interface DailyDigestData {
  date: string; login: string; today: number; overdue: number; active: number;
  terminalStatuses: string[]; focus: Array<{ task: DailyTask; reason: string }>;
}
export function selectDailyFocus(tasks: DailyTask[], date: string): DailyDigestData['focus'] {
  const tomorrow = nextDate(date);
  const category = (task: DailyTask) => {
    if (task.deadline === date) return 0;
    if (task.deadline && task.deadline < date && priorityRank(task.priority, task.priorityKey)) return 1;
    if (task.deadline === tomorrow) return 2;
    if (priorityRank(task.priority, task.priorityKey)) return 3;
    return 4;
  };
  const seen = new Set<string>();
  return tasks.filter((task) => category(task) < 4).slice().sort((a, b) =>
    category(a) - category(b) || priorityRank(b.priority, b.priorityKey) - priorityRank(a.priority, a.priorityKey) ||
    (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.key.localeCompare(b.key)
  ).filter((task) => {
    if (seen.has(task.key)) return false;
    seen.add(task.key); return true;
  }).slice(0, 3).map((task) => {
    const high = priorityRank(task.priority, task.priorityKey);
    const priority = high >= 2 ? 'критический приоритет' : 'высокий приоритет';
    let reason: string;
    if (task.deadline === date) reason = `Срок сегодня${high ? `, ${priority}` : ''}.`;
    else if (task.deadline && task.deadline < date) {
      const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${task.deadline}T12:00:00Z`)) / 86400_000);
      reason = `Просрочка: ${days} дн., ${priority}.`;
    } else if (task.deadline === tomorrow) reason = 'Срок завтра — стоит запланировать работу сегодня.';
    else reason = `${high >= 2 ? 'Критический' : 'Высокий'} приоритет${task.deadline ? `, срок ${task.deadline}` : ', дедлайн не указан'}.`;
    return { task, reason };
  });
}
export class DailyDigestService {
  constructor(private readonly tracker: TrackerApiClient, private readonly authorization: IssueAuthorizationService,
    private readonly workday: WorkdayService) {}
  async build(login: string, expectedTrackerId: string, date: string): Promise<YandexMessengerReplyMessage> {
    const identity = await this.authorization.resolveIdentity(login);
    if (!identity || identity.id !== expectedTrackerId) throw new Error('DIGEST_IDENTITY_NOT_CONFIRMED');
    const statuses = await this.workday.getStatuses();
    if (!Array.isArray(statuses) || !statuses.length) throw new Error('DIGEST_STATUSES_UNAVAILABLE');
    const terminal = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
    const terminalStatusNames = terminal.map((status) => status.name || status.key || String(status.id));
    const ids = new Set(terminal.map((status) => String(status.id)));
    const keys = new Set(terminal.map((status) => status.key).filter((key): key is string => Boolean(key)));
    const assigned = await fetchActiveIssuesByAssignee(this.tracker, identity.trackerLogin, terminalStatusNames,
      ['summary', 'status', 'statusType', 'assignee', 'priority', 'deadline', 'queue', ...ISSUE_AUTH_FIELDS]);
    const own = assigned.filter((issue) => issue.assignee?.id === identity.id && !isDone(issue, ids, keys));
    // Unlike the explicitly simplified interactive My day, scheduled reports never bypass ACL.
    const active = await this.authorization.filterReadableSearchIssues(identity.id, own, true);
    const tasks = active.map((issue): DailyTask => ({ key: issue.key, summary: issue.summary,
      deadline: dateOnly(issue.deadline), priority: issue.priority?.display, priorityKey: issue.priority?.key }));
    return formatDailyDigest({ date, login: identity.trackerLogin,
      today: tasks.filter((task) => task.deadline === date).length,
      overdue: tasks.filter((task) => task.deadline && task.deadline < date).length,
      active: active.length, terminalStatuses: terminalStatusNames,
      focus: selectDailyFocus(tasks, date) });
  }
}
function plainTitle(value: string) {
  // Tracker summaries are untrusted Markdown, not executable bot instructions or arbitrary links.
  return value.replace(/[\r\n\t]+/g, ' ').replace(/[\[\]()*_`~<>\\]/g, '').slice(0, 130);
}
export function formatDailyDigest(data: DailyDigestData): YandexMessengerReplyMessage {
  const displayDate = data.date.split('-').reverse().join('.');
  const lines = [
    `☀️ **Ваш день · ${displayDate}**`, '',
    `📋 ${formatMetricLink(`Активных задач на мне: ${data.active}`, buildMyActiveIssuesUrl(data.login, data.terminalStatuses))}`,
    `📅 ${formatMetricLink(`С дедлайном сегодня: ${data.today}`, buildMyDueTodayIssuesUrl(data.login, data.terminalStatuses, data.date))}`,
    `⏰ ${formatMetricLink(`Просроченные: ${data.overdue}`, buildMyOverdueIssuesUrl(data.login, data.terminalStatuses, data.date))}`,
    '', '**Обратить внимание**', ''
  ];
  for (const [index, item] of data.focus.entries()) {
    lines.push(`${index + 1}. ${formatTrackerIssueLabel(item.task.key)} — ${plainTitle(item.task.summary || 'Без названия')}`,
      item.reason, '');
  }
  if (!data.focus.length) lines.push(data.active ? 'Ближайших дедлайнов и задач высокого приоритета нет.' : 'Активных задач нет.', '');
  lines.push('Снимок на утро, МСК. Только доступные боту задачи; список в Tracker может отличаться.');
  return { text: lines.join('\n'), buttons: [[{ text: '🗓 Мой день' }], [{ text: '⚙️ Настройки дайджеста' }]] };
}
