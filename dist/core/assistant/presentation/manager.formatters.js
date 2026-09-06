"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatManagerSummary = formatManagerSummary;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../../shared/utils/tracker-query-links");
function formatTaskFlags(flagsSource) {
    const flags = [
        flagsSource.overdue ? '⏰ просрочена' : null,
        flagsSource.stale ? '🕸 без движения' : null,
        flagsSource.waitingForUser ? '💬 ждет ответа' : null
    ].filter(Boolean);
    return flags.length ? ` (${flags.join(', ')})` : '';
}
function formatCompactMetrics(metrics) {
    return [
        `• Всего задач: ${metrics.total}`,
        `• Активных: ${metrics.active}`,
        `• Просрочено: ${metrics.overdue}`,
        `• Без движения > 7д: ${metrics.stale}`,
        `• Ждут ответа: ${metrics.waitingForReply}`
    ];
}
function formatLinkedQueueMetrics(queueKey, metrics, terminalStatusNames) {
    const queueKeys = [queueKey];
    return [
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Всего задач: ${metrics.total}`, (0, tracker_query_links_1.buildTeamAllIssuesUrl)(queueKeys))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${metrics.active}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${metrics.overdue}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${metrics.stale}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа: ${metrics.waitingForReply}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, terminalStatusNames))}`
    ];
}
function formatSingleQueueView(summary) {
    const queue = summary.queueStats[0];
    const queueKeys = summary.queues.map((item) => item.key);
    const queueLabel = queue ? `${queue.key}${queue.name ? ` — ${queue.name}` : ''}` : 'не определена';
    const focusLines = queue?.topTasks?.length
        ? queue.topTasks.map((task, index) => `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`)
        : ['1. Критичных активных задач не найдено'];
    return [
        summary.manager?.display ? `👥 Моя команда — ${summary.manager.display}` : '👥 Моя команда',
        queue ? `📁 Очередь: ${queueLabel}` : null,
        '',
        '📊 Сейчас',
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Всего задач: ${summary.totalIssues}`, (0, tracker_query_links_1.buildTeamAllIssuesUrl)(queueKeys))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${summary.activeIssues}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${summary.overdueCount}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${summary.staleCount}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа: ${summary.waitingForReplyCount}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, summary.terminalStatusNames))}`,
        '',
        '🎯 Фокус',
        ...focusLines
    ].filter(Boolean).join('\n');
}
function formatMultiQueueView(summary) {
    const queueKeys = summary.queues.map((item) => item.key);
    const queueLine = summary.queues.length
        ? summary.queues.map((queue) => queue.key).join(', ')
        : 'нет очередей';
    const queueBlocks = summary.queueStats.length
        ? summary.queueStats.flatMap((queue) => {
            const queueTopTasks = queue.topTasks.length
                ? queue.topTasks.map((task, index) => `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`)
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
        ? summary.topTasks.slice(0, 5).map((task, index) => `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${formatTaskFlags(task)}`)
        : ['1. Критичных активных задач не найдено'];
    return [
        summary.manager?.display ? `👥 Моя команда — ${summary.manager.display}` : '👥 Моя команда',
        `📚 Очереди: ${queueLine}`,
        '',
        '📊 Общая сводка',
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Всего задач: ${summary.totalIssues}`, (0, tracker_query_links_1.buildTeamAllIssuesUrl)(queueKeys))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${summary.activeIssues}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${summary.overdueCount}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${summary.staleCount}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа: ${summary.waitingForReplyCount}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, summary.terminalStatusNames))}`,
        '',
        '🗂 По очередям',
        ...queueBlocks,
        '🔥 Главный фокус',
        ...topTasks
    ].join('\n');
}
function formatManagerSummary(summary) {
    if (summary.queueStats.length <= 1) {
        return formatSingleQueueView(summary);
    }
    return formatMultiQueueView(summary);
}
