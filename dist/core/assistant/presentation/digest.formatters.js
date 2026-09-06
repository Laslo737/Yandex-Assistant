"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEmployeeDigest = formatEmployeeDigest;
exports.formatManagerDigest = formatManagerDigest;
exports.formatCombinedDigest = formatCombinedDigest;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../../shared/utils/tracker-query-links");
function formatTaskFlags(flagsSource) {
    const flags = [
        flagsSource.overdue ? '⏰ просрочена' : null,
        flagsSource.waitingForUser ? '💬 ждет ответа' : null
    ].filter(Boolean);
    return flags.length ? ` (${flags.join(', ')})` : '';
}
function formatEmployeeDigest(summary) {
    const focusLines = summary.topTasks.length
        ? summary.topTasks.slice(0, 3).map((task, index) => `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${formatTaskFlags(task)}`)
        : ['1. Активных задач не найдено'];
    const linkLogin = summary.matchedAssigneeCandidate || summary.login;
    return [
        '☀️ Личный дайджест',
        summary.matchedAssigneeCandidate ? `👤 Профиль: ${summary.matchedAssigneeCandidate}` : null,
        '',
        '📊 На сегодня',
        linkLogin ? `• ${(0, tracker_query_links_1.formatMetricLink)(`Всего задач на мне: ${summary.totalAssigned}`, (0, tracker_query_links_1.buildMyAllIssuesUrl)(linkLogin))}` : `• Всего задач на мне: ${summary.totalAssigned}`,
        linkLogin && summary.terminalStatusNames ? `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${summary.activeAssigned}`, (0, tracker_query_links_1.buildMyActiveIssuesUrl)(linkLogin, summary.terminalStatusNames))}` : `• Активных: ${summary.activeAssigned}`,
        linkLogin && summary.terminalStatusNames ? `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${summary.overdueCount}`, (0, tracker_query_links_1.buildMyOverdueIssuesUrl)(linkLogin, summary.terminalStatusNames))}` : `• Просрочено: ${summary.overdueCount}`,
        linkLogin && summary.terminalStatusNames ? `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа: ${summary.waitingForReplyCount}`, (0, tracker_query_links_1.buildMyWaitingForReplyUrl)(linkLogin, summary.terminalStatusNames))}` : `• Ждут ответа: ${summary.waitingForReplyCount}`,
        linkLogin && summary.terminalStatusNames ? `• ${(0, tracker_query_links_1.formatMetricLink)(`Обновлялись за 24ч: ${summary.recentlyUpdatedCount}`, (0, tracker_query_links_1.buildMyRecentlyUpdatedIssuesUrl)(linkLogin, summary.terminalStatusNames))}` : `• Обновлялись за 24ч: ${summary.recentlyUpdatedCount}`,
        '',
        '🎯 Главное',
        ...focusLines
    ].filter(Boolean).join('\n');
}
function formatManagerDigest(summary) {
    const queueKeys = summary.queues.map((queue) => queue.key);
    const queueLine = summary.queues.map((queue) => queue.key).join(', ');
    const queueLines = summary.queueStats.slice(0, 5).map((queue) => `• ${queue.key}: активных ${queue.active}, просрочено ${queue.overdue}, без движения ${queue.stale}`);
    const focusLines = summary.topTasks.length
        ? summary.topTasks.slice(0, 5).map((task, index) => {
            const flags = [
                task.overdue ? '⏰ просрочена' : null,
                task.stale ? '🕸 без движения' : null,
                task.waitingForUser ? '💬 ждет ответа' : null
            ].filter(Boolean);
            return `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
        })
        : ['1. Критичных активных задач не найдено'];
    return [
        summary.manager?.display ? `👥 Дайджест руководителя — ${summary.manager.display}` : '👥 Дайджест руководителя',
        `📚 Очереди: ${queueLine}`,
        '',
        '📊 По команде',
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Всего задач: ${summary.totalIssues}`, (0, tracker_query_links_1.buildTeamAllIssuesUrl)(queueKeys))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${summary.activeIssues}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${summary.overdueCount}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${summary.staleCount}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа: ${summary.waitingForReplyCount}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, summary.terminalStatusNames))}`,
        '',
        '🗂 По очередям',
        ...(queueLines.length ? queueLines : ['• Нет данных']),
        '',
        '🔥 Куда смотреть',
        ...focusLines
    ].join('\n');
}
function formatCombinedDigest(parts) {
    return [parts.employee, parts.manager ? `\n━━━━━━━━━━\n${parts.manager}` : null]
        .filter(Boolean)
        .join('\n');
}
