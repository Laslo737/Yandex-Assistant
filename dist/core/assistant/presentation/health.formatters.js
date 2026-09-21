"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHealthCheck = formatHealthCheck;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const tracker_query_links_1 = require("../../../shared/utils/tracker-query-links");
function softenStatusLabel(label) {
    return label
        .replace('🔴 зона риска', '🔴 требует внимания')
        .replace('🟡 требует внимания', '🟡 есть точки внимания');
}
function softenRiskLine(risk) {
    return risk
        .replace('Много задач без движения > 7д', 'Много задач давно без движения')
        .replace('Высокая активная нагрузка в очереди', 'Большой объем активных задач в очереди');
}
function formatExecutiveSummary(result) {
    if (result.mainRisk) {
        return [`${result.score < 65 ? '🔴' : result.score < 85 ? '🟡' : '🟢'} ${result.mainRisk}`];
    }
    if (result.score >= 85) {
        return ['🟢 Команда выглядит стабильно: критичных сигналов немного, можно держать обычный ритм контроля.'];
    }
    const highlights = [];
    if (result.overdueCount > 0) {
        highlights.push(`есть ${result.overdueCount} просроченных задач`);
    }
    if (result.staleCount > 0) {
        highlights.push(`${result.staleCount} задач давно без движения`);
    }
    if (!highlights.length) {
        return ['🟡 Есть отдельные точки внимания, но без явной критики по ключевым сигналам.'];
    }
    return [`${result.score < 65 ? '🔴' : '🟡'} Главные сигналы: ${highlights.slice(0, 3).join(', ')}.`];
}
function formatInsightLines(items, emptyText) {
    return items.length ? items.map((item) => `• ${softenRiskLine(item)}`) : [`• ${emptyText}`];
}
function pluralizeTask(value) {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11)
        return 'задача';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
        return 'задачи';
    return 'задач';
}
function buildSingleQueueWhatHappenedLines(result, queueKeys) {
    return [
        (0, tracker_query_links_1.formatMetricLink)(`В активной работе ${result.activeIssues} ${pluralizeTask(result.activeIssues)}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, result.terminalStatusNames)),
        result.overdueCount > 0
            ? (0, tracker_query_links_1.formatMetricLink)(`Просрочено ${result.overdueCount} ${pluralizeTask(result.overdueCount)}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, result.terminalStatusNames))
            : 'Явных просрочек сейчас нет.',
        result.staleCount > 0
            ? (0, tracker_query_links_1.formatMetricLink)(`${result.staleCount} ${pluralizeTask(result.staleCount)} давно без движения`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, result.terminalStatusNames))
            : 'Критичных зависаний без движения сейчас не видно.'
    ];
}
function formatQueueHighlightLine(queue, terminalStatusNames) {
    const queueKeys = [queue.key];
    return [
        `• ${queue.key}: ${softenStatusLabel(queue.healthLabel)}`,
        (0, tracker_query_links_1.formatMetricLink)(`активных ${queue.active}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)(`просрочено ${queue.overdue}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)(`без движения ${queue.stale}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, terminalStatusNames)),
        (0, tracker_query_links_1.formatMetricLink)('все задачи', (0, tracker_query_links_1.buildTeamAllIssuesUrl)(queueKeys))
    ].join(' — ');
}
function formatTaskLines(tasks, includeQueue = true) {
    return tasks.length
        ? tasks.slice(0, 5).map((task, index) => {
            const flags = [
                task.overdue ? '⏰ просрочена' : null,
                task.stale ? '🕸 без движения' : null
            ].filter(Boolean);
            return `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${includeQueue && task.queue ? ` [${task.queue}]` : ''}${task.assignee ? ` — ${task.assignee}` : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
        })
        : ['1. Явных проблемных задач не найдено'];
}
function formatSingleQueueHealth(result) {
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
function formatMultiQueueHealth(result) {
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
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Активных задач: ${result.activeIssues}`, (0, tracker_query_links_1.buildTeamActiveIssuesUrl)(queueKeys, result.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Просрочено: ${result.overdueCount}`, (0, tracker_query_links_1.buildTeamOverdueIssuesUrl)(queueKeys, result.terminalStatusNames))}`,
        `• ${(0, tracker_query_links_1.formatMetricLink)(`Без движения > 7д: ${result.staleCount}`, (0, tracker_query_links_1.buildTeamStaleIssuesUrl)(queueKeys, result.terminalStatusNames))}`,
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
function formatHealthCheck(result) {
    if (result.queues.length <= 1) {
        return formatSingleQueueHealth(result);
    }
    return formatMultiQueueHealth(result);
}
