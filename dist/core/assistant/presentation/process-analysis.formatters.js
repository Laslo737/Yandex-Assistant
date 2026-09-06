"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatProcessAnalysis = formatProcessAnalysis;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../../shared/utils/tracker-query-links");
function formatTaskFlags(task) {
    const flags = [];
    if (task.overdue)
        flags.push('⏰ просрочена');
    if (task.stale && task.daysWithoutUpdate !== undefined)
        flags.push(`🕸️ без движения ${task.daysWithoutUpdate}д`);
    if (task.longInProgress && task.daysInProgress !== undefined)
        flags.push(`⌛️ в работе ${task.daysInProgress}д`);
    if (task.waitingForReply && task.waitingDays !== undefined)
        flags.push(`💬 ждет ответа ${task.waitingDays}д`);
    if (task.veryOldStale || task.veryLongInProgress)
        flags.push('🧹 старый хвост');
    return flags.join(', ');
}
function formatCount(value, one, few, many) {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11)
        return `${value} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
        return `${value} ${few}`;
    return `${value} ${many}`;
}
function formatRiskLevel(level) {
    if (level === 'high')
        return 'Высокий риск';
    if (level === 'medium')
        return 'Средний риск';
    return 'Низкий риск';
}
function formatRiskType(type) {
    switch (type) {
        case 'mixed':
            return 'смешанный риск';
        case 'old_tail':
            return 'старый хвост';
        case 'overdue':
            return 'просрочка';
        case 'waiting':
            return 'ожидание ответа';
        case 'stuck':
            return 'живой стопор';
        default:
            return 'перегруз';
    }
}
function formatQueueLine(queue, terminalStatusNames) {
    const queueKeys = [queue.key];
    return [
        `• ${queue.key}`,
        (0, tracker_query_links_1.formatMetricLink)(`активных ${queue.active}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)(`просрочено ${queue.overdue}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)(`без движения ${queue.stale}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)(`ждут ответа ${queue.waitingForReply}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, terminalStatusNames)),
        `долго в работе ${queue.longInProgress}`
    ].join(' — ');
}
function formatTopTaskLine(task, index, singleQueueMode) {
    const flags = formatTaskFlags(task);
    return `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${!singleQueueMode && task.queue ? ` [${task.queue.toUpperCase()}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags ? ` (${flags})` : ''}`;
}
function formatIssueMentionLine(line) {
    return line.replace(/\b([A-Z][A-Z0-9_]+-\d+)\b/i, (match) => (0, tracker_links_1.formatTrackerIssueLabel)(match.toUpperCase()));
}
function formatProcessAnalysis(result) {
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
            const issues = item.topIssueKeys.map((key) => (0, tracker_links_1.formatTrackerIssueLabel)(key)).join(', ');
            return `• ${item.assignee} — ${formatCount(item.longInProgressCount, 'задача', 'задачи', 'задач')}, в среднем ${item.averageDaysInProgress}д в работе${issues ? ` (${issues})` : ''}`;
        })
        : [];
    const queueLines = result.queueHighlights.length
        ? result.queueHighlights.map((queue) => formatQueueLine(queue, result.terminalStatusNames))
        : ['• Нет данных по очередям'];
    const metricLines = [
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных задач: ${result.activeIssues}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, result.terminalStatusNames))}`,
        ...(result.overdueCount > 0
            ? [`• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${result.overdueCount}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, result.terminalStatusNames))}`]
            : []),
        ...(result.staleCount > 0
            ? [`• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${result.staleCount}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, result.terminalStatusNames))}`]
            : []),
        ...(result.waitingForReplyCount > 0
            ? [`• ${(0, tracker_query_links_1.formatMetricLink)(`Ждут ответа всего: ${result.waitingForReplyCount}`, (0, tracker_query_links_1.buildTeamWaitingForReplyUrl)(queueKeys, result.terminalStatusNames))}`]
            : []),
        ...(result.longInProgressCount > 0
            ? [`• ${(0, tracker_query_links_1.formatMetricLink)(`${formatCount(result.longInProgressCount, 'задача', 'задачи', 'задач')} в работе больше 10д`, (0, tracker_query_links_1.buildTeamLongInProgressIssuesUrl)(queueKeys, result.terminalStatusNames, 10))}`]
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
                        `• ${(0, tracker_query_links_1.formatMetricLink)(`${result.oldBacklogLines[0]}`, (0, tracker_query_links_1.buildTeamOldBacklogIssuesUrl)(queueKeys, result.terminalStatusNames, 90))}`
                    ]
                    : []),
                ...(result.veryLongInProgressCount > 0
                    ? [
                        `• ${(0, tracker_query_links_1.formatMetricLink)(`${result.oldBacklogLines[result.oldBacklogCount > 0 ? 1 : 0]}`, (0, tracker_query_links_1.buildTeamLongInProgressIssuesUrl)(queueKeys, result.terminalStatusNames, 90))}`
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
