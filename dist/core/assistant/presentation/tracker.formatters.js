"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTrackerConnectionPreview = formatTrackerConnectionPreview;
exports.formatIssueBundlePreview = formatIssueBundlePreview;
exports.formatMyDaySummary = formatMyDaySummary;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../../shared/utils/tracker-query-links");
function formatTrackerConnectionPreview(preview) {
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
function formatIssueBundlePreview(preview) {
    return [
        `Tracker issue preview: ${(0, tracker_links_1.formatTrackerIssueLabel)(preview.key)}`,
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
function formatMyDaySummary(summary) {
    const topLines = summary.topTasks.length
        ? summary.topTasks.slice(0, 3).map((task, index) => {
            const flags = [task.overdue ? '⏰ просрочена' : null, task.waitingForUser ? '💬 ждет ответа' : null]
                .filter(Boolean)
                .join(', ');
            return `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${flags ? ` (${flags})` : ''}`;
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
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных: ${summary.activeAssigned}`, (0, tracker_query_links_1.buildMyActiveIssuesUrl)(linkLogin, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${summary.overdueCount}`, (0, tracker_query_links_1.buildMyOverdueIssuesUrl)(linkLogin, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут моего ответа: ${summary.waitingForReplyCount}`, (0, tracker_query_links_1.buildMyWaitingForReplyUrl)(linkLogin, summary.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Были обновления за 24ч: ${summary.recentlyUpdatedCount}`, (0, tracker_query_links_1.buildMyRecentlyUpdatedIssuesUrl)(linkLogin, summary.terminalStatusNames))}`,
        summary.activeAssigned === 0
            ? `• Диагностика: login=${summary.login}; candidates=${summary.assigneeCandidates.join(', ')}; matched=${summary.matchedAssigneeCandidate || 'none'}`
            : null,
        '',
        '🎯 Фокус на сегодня',
        ...topLines
    ].filter((line) => line !== null).join('\n');
}
