"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyDigestService = void 0;
exports.selectDailyFocus = selectDailyFocus;
exports.formatDailyDigest = formatDailyDigest;
const workday_service_1 = require("../workday/application/workday.service");
const active_issues_1 = require("../../integrations/yandex-tracker/active-issues");
const digest_calendar_1 = require("./digest-calendar");
const tracker_links_1 = require("../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../shared/utils/tracker-query-links");
function selectDailyFocus(tasks, date) {
    const tomorrow = (0, digest_calendar_1.nextDate)(date);
    const category = (task) => {
        if (task.deadline === date)
            return 0;
        if (task.deadline && task.deadline < date && (0, digest_calendar_1.priorityRank)(task.priority, task.priorityKey))
            return 1;
        if (task.deadline === tomorrow)
            return 2;
        if ((0, digest_calendar_1.priorityRank)(task.priority, task.priorityKey))
            return 3;
        return 4;
    };
    const seen = new Set();
    return tasks.filter((task) => category(task) < 4).slice().sort((a, b) => category(a) - category(b) || (0, digest_calendar_1.priorityRank)(b.priority, b.priorityKey) - (0, digest_calendar_1.priorityRank)(a.priority, a.priorityKey) ||
        (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.key.localeCompare(b.key)).filter((task) => {
        if (seen.has(task.key))
            return false;
        seen.add(task.key);
        return true;
    }).slice(0, 3).map((task) => {
        const high = (0, digest_calendar_1.priorityRank)(task.priority, task.priorityKey);
        const priority = high >= 2 ? 'критический приоритет' : 'высокий приоритет';
        let reason;
        if (task.deadline === date)
            reason = `Срок сегодня${high ? `, ${priority}` : ''}.`;
        else if (task.deadline && task.deadline < date) {
            const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${task.deadline}T12:00:00Z`)) / 86400_000);
            reason = `Просрочка: ${days} дн., ${priority}.`;
        }
        else if (task.deadline === tomorrow)
            reason = 'Срок завтра — стоит запланировать работу сегодня.';
        else
            reason = `${high >= 2 ? 'Критический' : 'Высокий'} приоритет${task.deadline ? `, срок ${task.deadline}` : ', дедлайн не указан'}.`;
        return { task, reason };
    });
}
class DailyDigestService {
    tracker;
    authorization;
    workday;
    constructor(tracker, authorization, workday) {
        this.tracker = tracker;
        this.authorization = authorization;
        this.workday = workday;
    }
    async build(login, expectedTrackerId, date) {
        const identity = await this.authorization.resolveIdentity(login);
        if (!identity || identity.id !== expectedTrackerId)
            throw new Error('DIGEST_IDENTITY_NOT_CONFIRMED');
        const statuses = await this.workday.getStatuses();
        if (!Array.isArray(statuses) || !statuses.length)
            throw new Error('DIGEST_STATUSES_UNAVAILABLE');
        const terminal = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
        const terminalStatusNames = terminal.map((status) => status.name || status.key || String(status.id));
        const ids = new Set(terminal.map((status) => String(status.id)));
        const keys = new Set(terminal.map((status) => status.key).filter((key) => Boolean(key)));
        const assigned = await (0, active_issues_1.fetchActiveIssuesByAssignee)(this.tracker, identity.trackerLogin, terminalStatusNames, ['summary', 'status', 'statusType', 'assignee', 'priority', 'deadline', 'queue', ...active_issues_1.ISSUE_AUTH_FIELDS]);
        const own = assigned.filter((issue) => issue.assignee?.id === identity.id && !(0, workday_service_1.isDone)(issue, ids, keys));
        // Unlike the explicitly simplified interactive My day, scheduled reports never bypass ACL.
        const active = await this.authorization.filterReadableSearchIssues(identity.id, own, true);
        const tasks = active.map((issue) => ({ key: issue.key, summary: issue.summary,
            deadline: (0, digest_calendar_1.dateOnly)(issue.deadline), priority: issue.priority?.display, priorityKey: issue.priority?.key }));
        return formatDailyDigest({ date, login: identity.trackerLogin,
            today: tasks.filter((task) => task.deadline === date).length,
            overdue: tasks.filter((task) => task.deadline && task.deadline < date).length,
            active: active.length, terminalStatuses: terminalStatusNames,
            focus: selectDailyFocus(tasks, date) });
    }
}
exports.DailyDigestService = DailyDigestService;
function plainTitle(value) {
    // Tracker summaries are untrusted Markdown, not executable bot instructions or arbitrary links.
    return value.replace(/[\r\n\t]+/g, ' ').replace(/[\[\]()*_`~<>\\]/g, '').slice(0, 130);
}
function formatDailyDigest(data) {
    const displayDate = data.date.split('-').reverse().join('.');
    const lines = [
        `☀️ **Ваш день · ${displayDate}**`, '',
        `📋 ${(0, tracker_query_links_1.formatMetricLink)(`Активных задач на мне: ${data.active}`, (0, tracker_query_links_1.buildMyActiveIssuesUrl)(data.login, data.terminalStatuses))}`,
        `📅 ${(0, tracker_query_links_1.formatMetricLink)(`С дедлайном сегодня: ${data.today}`, (0, tracker_query_links_1.buildMyDueTodayIssuesUrl)(data.login, data.terminalStatuses, data.date))}`,
        `⏰ ${(0, tracker_query_links_1.formatMetricLink)(`Просроченные: ${data.overdue}`, (0, tracker_query_links_1.buildMyOverdueIssuesUrl)(data.login, data.terminalStatuses, data.date))}`,
        '', '**Обратить внимание**', ''
    ];
    for (const [index, item] of data.focus.entries()) {
        lines.push(`${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(item.task.key)} — ${plainTitle(item.task.summary || 'Без названия')}`, item.reason, '');
    }
    if (!data.focus.length)
        lines.push(data.active ? 'Ближайших дедлайнов и задач высокого приоритета нет.' : 'Активных задач нет.', '');
    lines.push('Снимок на утро, МСК. Только доступные боту задачи; список в Tracker может отличаться.');
    return { text: lines.join('\n'), buttons: [[{ text: '🗓 Мой день' }], [{ text: '⚙️ Настройки дайджеста' }]] };
}
