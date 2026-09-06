"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatIssueHelpResult = formatIssueHelpResult;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
function formatDateTime(value) {
    if (!value)
        return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}
function formatIssueHelpResult(result) {
    const meta = result.contextPack.meta;
    return [
        `🆘 Помощь с задачей — ${(0, tracker_links_1.formatTrackerIssueLabel)(result.issueKey)}`,
        meta.summary ? `📝 ${meta.summary}` : null,
        '',
        `🎯 Запрос: ${result.request}`,
        `📦 Контекст собран: issue + comments ${meta.commentsCount} + changelog ${meta.changelogCount}`,
        result.aiUsed && result.aiAnswer ? '' : null,
        result.aiUsed && result.aiAnswer ? '🤖 Ответ AI' : null,
        result.aiUsed && result.aiAnswer ? result.aiAnswer : null,
        '',
        meta.queue ? `📁 Очередь: ${meta.queue}` : null,
        meta.status ? `🏷 Статус: ${meta.status}` : null,
        meta.assignee ? `👤 Исполнитель: ${meta.assignee}` : null,
        meta.priority ? `⚡ Приоритет: ${meta.priority}` : null,
        meta.type ? `🧩 Тип: ${meta.type}` : null,
        meta.deadline ? `📅 Дедлайн: ${meta.deadline}` : null,
        meta.parent ? `🪜 Родитель: ${meta.parent}` : null,
        meta.tags?.length ? `🏷 Теги: ${meta.tags.join(', ')}` : null,
        '',
        result.contextPack.derived?.issuePurpose ? '🧩 Общий смысл задачи' : null,
        result.contextPack.derived?.issuePurpose ? `• ${result.contextPack.derived.issuePurpose}` : null,
        result.contextPack.derived?.agreedWhat ? `• Что уже согласовано: ${result.contextPack.derived.agreedWhat}` : null,
        '',
        '🧠 Что уже можно сказать без AI',
        ...(result.contextPack.heuristics.probableCauses.length
            ? result.contextPack.heuristics.probableCauses.map((item) => `• ${item}`)
            : ['• Явной причины по сигналам не видно.']),
        result.contextPack.heuristics.waitingForReplyFrom?.length ? `• По системному сигналу задача ждет ответа от: ${result.contextPack.heuristics.waitingForReplyFrom.join(', ')}` : null,
        result.contextPack.derived?.lastCommentIntent ? `• Intent последнего содержательного комментария: ${result.contextPack.derived.lastCommentIntent}` : null,
        result.contextPack.derived?.blockingReasonHumanized ? `• По смыслу блокер: ${result.contextPack.derived.blockingReasonHumanized}` : null,
        result.contextPack.derived?.requestedActionHumanized ? `• Какого действия сейчас ждут: ${result.contextPack.derived.requestedActionHumanized}` : null,
        result.contextPack.heuristics.authorWaitingForExternalReply ? '• Последний комментарий больше похож на ожидание внешней реакции, а не на активный следующий шаг автора.' : null,
        result.contextPack.heuristics.nextActionOwner ? `• Вероятный владелец следующего шага: ${result.contextPack.heuristics.nextActionOwner}` : null,
        '',
        '🕒 Последняя активность',
        result.contextPack.derived?.waitingTopic ? `• По смыслу сейчас ждут: ${result.contextPack.derived.waitingTopic}` : null,
        result.contextPack.derived?.waitingSubject ? `• Предмет ожидания: ${result.contextPack.derived.waitingSubject}` : null,
        result.contextPack.derived?.waitingQuestion ? `• Какой вопрос/запрос остался открытым: ${result.contextPack.derived.waitingQuestion}` : null,
        result.contextPack.derived?.lastConcreteAsk ? `• Последний конкретный вопрос/запрос: ${result.contextPack.derived.lastConcreteAsk}` : null,
        result.contextPack.derived?.remainingOpenPoint ? `• Непроработанный открытый вопрос: ${result.contextPack.derived.remainingOpenPoint}` : null,
        result.contextPack.highlights?.latestStatusChange ? `• Последняя смена статуса: ${result.contextPack.highlights.latestStatusChange}` : null,
        result.contextPack.highlights?.latestFieldChange ? `• Последнее изменение поля: ${result.contextPack.highlights.latestFieldChange}` : null,
        result.contextPack.highlights?.latestBlockingComment ? `• Комментарий с возможным блокером: ${result.contextPack.highlights.latestBlockingComment}` : null,
        result.contextPack.highlights?.latestAskComment ? `• Последний явный вопрос: ${result.contextPack.highlights.latestAskComment}` : null,
        result.contextPack.highlights?.latestDecisionComment ? `• Последняя договоренность/решение: ${result.contextPack.highlights.latestDecisionComment}` : null,
        result.contextPack.highlights?.latestComment ? `• Последний комментарий: ${result.contextPack.highlights.latestComment}` : null,
        ...(result.contextPack.changelog.length
            ? result.contextPack.changelog.slice(0, 2).map((entry) => {
                const at = formatDateTime(entry.updatedAt);
                const changes = entry.changes.slice(0, 2).join('; ');
                return `• ${at || 'без даты'}${entry.updatedBy ? ` — ${entry.updatedBy}` : ''}${changes ? `: ${changes}` : ''}`;
            })
            : ['• Недавних изменений статуса/полей не видно.']),
        ...(result.contextPack.comments.length
            ? result.contextPack.comments.slice(0, 2).map((comment) => {
                const at = formatDateTime(comment.updatedAt);
                return `• Комментарий${comment.author ? ` от ${comment.author}` : ''}${at ? ` — ${at}` : ''}${comment.text ? `: ${comment.text}` : ''}`;
            })
            : ['• Свежих комментариев не видно.']),
        '',
        ...(result.contextPack.evidence?.length ? ['', '🧾 Факты, на которые можно опереться', ...result.contextPack.evidence.slice(0, 5).map((item) => `• ${item.label}: ${item.detail}`)] : []),
        '',
        '✅ Что делать дальше',
        ...(result.contextPack.heuristics.recommendations.length
            ? result.contextPack.heuristics.recommendations.map((item) => `• ${item}`)
            : ['• Дальше можно подключить AI-саммари по полному контексту задачи.'])
    ].filter(Boolean).join('\n');
}
