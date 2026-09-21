"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatIssueHelpResult = formatIssueHelpResult;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const text_1 = require("../../../shared/utils/text");
function formatIssueHelpResult(result) {
    const { meta, heuristics, derived } = result.contextPack;
    const statusParts = [
        meta.status ? `Статус: ${meta.status}` : undefined,
        meta.assignee ? `Исполнитель: ${meta.assignee}` : undefined,
        meta.deadline ? `Дедлайн: ${meta.deadline}` : undefined
    ].filter(Boolean);
    if (result.aiUsed && result.aiAnswer) {
        return [
            `🆘 ${(0, tracker_links_1.formatTrackerIssueLabel)(result.issueKey)}${meta.summary ? ` — ${meta.summary}` : ''}`,
            statusParts.length ? `📌 ${statusParts.join(' · ')}` : null,
            '',
            (0, text_1.truncateText)(result.aiAnswer.trim(), 1800)
        ].filter((line) => line !== null).join('\n');
    }
    const observations = [
        derived?.issuePurpose,
        ...heuristics.probableCauses.slice(0, 2),
        derived?.requestedActionHumanized
            ? `Сейчас требуется: ${derived.requestedActionHumanized}`
            : derived?.lastConcreteAsk
                ? `Последний открытый вопрос: ${derived.lastConcreteAsk}`
                : undefined,
        heuristics.nextActionOwner ? `Следующий шаг: ${heuristics.nextActionOwner}` : undefined
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
    return [
        `🆘 ${(0, tracker_links_1.formatTrackerIssueLabel)(result.issueKey)}${meta.summary ? ` — ${meta.summary}` : ''}`,
        statusParts.length ? `📌 ${statusParts.join(' · ')}` : null,
        '',
        'Коротко:',
        ...(observations.length ? observations.slice(0, 4).map((item) => `• ${item}`) : ['• Явная причина задержки по данным задачи не найдена.']),
        '',
        'Что делать:',
        ...(heuristics.recommendations.length
            ? heuristics.recommendations.slice(0, 2).map((item) => `• ${item}`)
            : ['• Проверить последний комментарий и уточнить владельца следующего шага.'])
    ].filter((line) => line !== null).join('\n');
}
