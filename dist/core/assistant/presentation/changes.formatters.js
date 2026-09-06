"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatChangesEntryPoint = formatChangesEntryPoint;
exports.formatChangesPeriodPicker = formatChangesPeriodPicker;
exports.formatChangesSummary = formatChangesSummary;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
function periodLabel(hours) {
    if (hours <= 24)
        return '24 часа';
    if (hours <= 24 * 7)
        return '7 дней';
    return `${Math.round(hours / 24)} дней`;
}
function formatChangeFlags(task) {
    const flags = [
        task.statusChanged ? '🔄 смена статуса' : null,
        task.commented ? '💬 комментарий / активность' : null,
        task.overdue ? '⏰ просрочена' : null
    ].filter(Boolean);
    return flags.length ? ` (${flags.join(', ')})` : '';
}
function formatDateTime(value) {
    if (!value)
        return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return undefined;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}
function formatTaskDetailLines(task) {
    const details = [
        task.statusChangeText ? `   • ${task.statusChangeText}` : null,
        task.activityText ? `   • ${task.activityText}` : null,
        task.overdue ? '   • Задача просрочена' : null
    ].filter(Boolean);
    if (details.length)
        return details;
    const updatedAt = formatDateTime(task.updatedAt);
    return [updatedAt ? `   • Последнее обновление: ${updatedAt}` : '   • Было обновление по задаче'];
}
function formatChangesEntryPoint(isManager) {
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
function formatChangesPeriodPicker(scope) {
    return [
        scope === 'my' ? '🕒 Изменения — мои задачи' : '🕒 Изменения — моя команда',
        '',
        'Выберите период:',
        '• 24 часа',
        '• 7 дней'
    ].join('\n');
}
function formatTaskTitle(task, index, scope) {
    const queuePart = task.queue ? ` [${task.queue}]` : '';
    const assigneePart = scope === 'team' && task.assignee ? ` — ${task.assignee}` : '';
    return `${index + 1}. ${(0, tracker_links_1.formatTrackerIssueLabel)(task.key)} — ${task.summary || 'без названия'}${queuePart}${assigneePart}${formatChangeFlags(task)}`;
}
function formatChangesSummary(summary) {
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
