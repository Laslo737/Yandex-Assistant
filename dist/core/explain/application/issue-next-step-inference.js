"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferIssueNextStep = inferIssueNextStep;
const tracker_comment_text_1 = require("../../../shared/utils/tracker-comment-text");
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function isRobotUser(user) {
    const display = String(user?.display || '').toLowerCase();
    const id = String(user?.id || '').toLowerCase();
    return display.includes('робот') || display.includes('robot') || id.includes('robot');
}
function normalizeSnippet(value, maxLength = 220) {
    return (0, tracker_comment_text_1.normalizeTrackerCommentText)(value, maxLength);
}
function userDisplay(user) {
    return user?.display;
}
function splitSentences(text) {
    if (!text)
        return [];
    return text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function findSentence(text, patterns) {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
        if (patterns.some((pattern) => pattern.test(sentence))) {
            return sentence;
        }
    }
    if (text && patterns.some((pattern) => pattern.test(text))) {
        return text;
    }
    return undefined;
}
function isMeaningfulComment(comment) {
    const text = normalizeSnippet(comment.text, 220)?.toLowerCase();
    if (!text)
        return false;
    if (isRobotUser(comment.updatedBy || comment.createdBy))
        return false;
    if (text.length < 12)
        return false;
    if (/^(ок|окей|хорошо|спасибо|понял|поняла|принято|привет)$/i.test(text))
        return false;
    return true;
}
function sortCommentsNewestFirst(comments) {
    return comments
        .slice()
        .sort((a, b) => (toDate(b.updatedAt || b.createdAt)?.getTime() || 0) - (toDate(a.updatedAt || a.createdAt)?.getTime() || 0));
}
function isAdministrativeComment(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized)
        return false;
    return [
        /пока исполнителем тебя постав/i,
        /снова меня постав.*исполнител/i,
        /поставлю.*исполнител/i,
        /поставь.*исполнител/i,
        /верни.*исполнител/i,
        /сменил.*исполнител/i,
        /поменял.*исполнител/i,
        /назначил.*исполнител/i,
        /пока тебя постав/i,
        /как дадите ос/i,
        /как дадите обратн/i,
        /можешь снова меня поставить/i
    ].some((pattern) => pattern.test(normalized));
}
function isSemanticComment(comment) {
    const text = normalizeSnippet(comment.text, 320);
    if (!isMeaningfulComment(comment))
        return false;
    if (!text)
        return false;
    return !isAdministrativeComment(text);
}
function findLastMeaningfulComment(comments) {
    const sorted = sortCommentsNewestFirst(comments);
    return sorted.find(isMeaningfulComment) || sorted.find((comment) => !isRobotUser(comment.updatedBy || comment.createdBy)) || sorted[0];
}
function findLastSemanticComment(comments) {
    const sorted = sortCommentsNewestFirst(comments);
    return sorted.find(isSemanticComment) || findLastMeaningfulComment(sorted);
}
function classifyIntent(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized)
        return 'unknown';
    if (/(жду|ждем|ждём|буду ждать|будем ждать|ожидаем|после ответа|после согласования|как только согласуют|как только ответят|осталось согласовать|нужно согласовать|надо согласовать|жду ос|ждем ос|ждём ос|обратн(ую|ой)? связь|на согласовани)/i.test(normalized)) {
        return 'waiting';
    }
    if (/(блокер|заблок|не можем|не могу|не получается|невозможно|уперл|мешает|нет доступа|ошибк|падает|сломал|не взлет)/i.test(normalized)) {
        return 'blocked';
    }
    if (/(готово к согласованию|готово на проверку|готово к проверке|можно согласовывать|можно принимать|нужно решение|требуется решение|ждём решение|ждем решение|готовы показать|готово для ревью)/i.test(normalized)) {
        return 'decision-ready';
    }
    if (/(\?|подскаж|уточн|можете|можешь|нужно ли|какой вариант|когда .*\?|посмотрите|проверьте|подтвердите|согласуйте|дайте ос|дай ос|нужен ответ)/i.test(normalized)) {
        return 'asking';
    }
    if (/(в работе|делаю|делаем|занимаюсь|беру в работу|исправляю|готовлю|проверяю|смотрю|разбираюсь|пилю|дорабатываю|перенесу|заведу|сейчас запрошу|запрошу|уточню|узнаю|сообщу|оповещу|вернусь)/i.test(normalized)) {
        return 'doing';
    }
    if (/(сделал|сделали|готово|готова|исправил|исправили|добавил|добавили|обновил|обновили|отправил|отправили|проверил|проверили|завершил|починил|залил|выложил|смёржил|смержил|применил|внес)/i.test(normalized)) {
        return 'reporting';
    }
    return 'unknown';
}
function extractWaitingQuestion(comments) {
    const sorted = sortCommentsNewestFirst(comments);
    for (const comment of sorted) {
        const text = normalizeSnippet(comment.text, 420);
        if (!text)
            continue;
        const sentence = findSentence(text, [/\?/i, /подскаж/i, /уточн/i, /можете/i, /можешь/i, /согласуйте/i, /подтвердите/i, /нужен ответ/i, /дайте ос/i, /дай ос/i]);
        if (sentence)
            return sentence;
    }
    return undefined;
}
function humanizeWaitingSubject(text) {
    const sentence = findSentence(text, [/жду|ждем|ждём|буду ждать|ожидаем|согласова|ответ|ос|правк|решени/i]);
    if (!sentence)
        return undefined;
    if (/согласова/i.test(sentence))
        return 'согласование / подтверждение решения';
    if (/правк/i.test(sentence))
        return 'правки по решению';
    if (/ос|обратн(ую|ой)? связь/i.test(sentence))
        return 'обратную связь по текущему варианту';
    if (/решени/i.test(sentence))
        return 'решение по следующему шагу';
    if (/ответ/i.test(sentence))
        return 'ответ на последний вопрос по задаче';
    return sentence;
}
function humanizeBlockingReason(text) {
    const sentence = findSentence(text, [/блокер|заблок|не можем|не могу|не получается|невозможно|мешает|нет доступа|ошибк|жду|ждем|ждём|ожидаем|согласова|требуется доработка/i]);
    if (!sentence)
        return undefined;
    if (/(жду|ждем|ждём|ожидаем|буду ждать)/i.test(sentence)) {
        const subject = humanizeWaitingSubject(sentence);
        return subject ? `Сейчас задача уперлась в ожидание: ${subject}.` : 'Сейчас задача уперлась в ожидание внешнего ответа или согласования.';
    }
    if (/согласова/i.test(sentence))
        return 'Задача не двигается без согласования или подтверждения решения.';
    if (/требуется доработка/i.test(sentence))
        return 'Текущий вариант требует доработки, поэтому задача не может перейти дальше.';
    if (/нет доступа/i.test(sentence))
        return 'Продвижение остановилось из-за отсутствия нужного доступа.';
    if (/ошибк|невозможно|не получается|не можем/i.test(sentence))
        return 'Текущий вариант уперся в техническое ограничение или проблему реализации.';
    return sentence;
}
function humanizeRequestedAction(text, intent) {
    const sentence = findSentence(text, [/\?/i, /подскаж/i, /уточн/i, /можете/i, /можешь/i, /согласуйте/i, /подтвердите/i, /дайте ос/i, /дай ос/i, /нужен ответ/i, /осталось согласовать/i, /нужно согласовать/i, /сейчас запрошу/i, /запрошу/i, /уточню/i, /узнаю/i, /сообщу/i, /оповещу/i, /вернусь/i]);
    if (sentence) {
        if (/согласуйте|подтвердите|осталось согласовать|нужно согласовать/i.test(sentence)) {
            return 'дать согласование / подтверждение по текущему варианту';
        }
        if (/дайте ос|дай ос|обратн(ую|ой)? связь/i.test(sentence)) {
            return 'дать обратную связь по текущему варианту';
        }
        return sentence;
    }
    if (intent === 'decision-ready')
        return 'принять решение или согласовать следующий шаг';
    if (intent === 'blocked')
        return 'снять блокер и зафиксировать рабочий вариант';
    return undefined;
}
function inferIssueNextStep(input) {
    const lastComment = findLastMeaningfulComment(input.comments);
    const semanticComment = findLastSemanticComment(input.comments);
    const lastCommentText = normalizeSnippet(lastComment?.text, 420);
    const semanticCommentText = normalizeSnippet(semanticComment?.text, 420) || lastCommentText;
    const lastCommentAuthor = userDisplay(lastComment?.updatedBy || lastComment?.createdBy);
    const semanticCommentAuthor = userDisplay(semanticComment?.updatedBy || semanticComment?.createdBy) || lastCommentAuthor;
    const lastCommentIntent = classifyIntent(semanticCommentText);
    const waitingQuestion = extractWaitingQuestion(input.comments);
    const waitingSubject = humanizeWaitingSubject(semanticCommentText) || humanizeWaitingSubject(waitingQuestion);
    const requestedActionHumanized = humanizeRequestedAction(semanticCommentText, lastCommentIntent) || humanizeRequestedAction(waitingQuestion, lastCommentIntent);
    const blockingReasonHumanized = humanizeBlockingReason(semanticCommentText);
    const needsApproval = /согласова|утверд|подтверд|апрув|approve|решени/i.test(String(semanticCommentText || ''));
    const authorWaitingForExternalReply = lastCommentIntent === 'waiting' || lastCommentIntent === 'asking';
    let nextActionOwner;
    let nextActionReason;
    let authorLikelyOwnsNextStep = false;
    if (authorWaitingForExternalReply) {
        if (needsApproval) {
            nextActionOwner = 'согласующий / заказчик';
            nextActionReason = requestedActionHumanized
                ? `Последний содержательный комментарий показывает, что автор уже ждет внешнее согласование; следующий шаг не у автора, а у стороны, которая должна ${requestedActionHumanized}.`
                : 'Последний содержательный комментарий показывает, что автор уже ждет внешнее согласование; следующий шаг не у автора.';
        }
        else {
            nextActionOwner = requestedActionHumanized ? 'сторона, от которой ждут ответ' : undefined;
            nextActionReason = requestedActionHumanized
                ? `Последний содержательный комментарий показывает, что автор уже ждет внешний ответ; следующий шаг у того, кто должен ${requestedActionHumanized}.`
                : 'Последний содержательный комментарий показывает, что автор уже ждет внешний ответ; автоматически назначать следующий шаг на автора нельзя.';
        }
    }
    else if (lastCommentIntent === 'decision-ready') {
        nextActionOwner = needsApproval ? 'согласующий / руководитель' : (input.assignee || input.lastStatusChangedBy);
        nextActionReason = needsApproval
            ? 'По смыслу задача уже подготовлена и упирается в решение или согласование со стороны руководителя/заказчика.'
            : 'Последний комментарий больше похож на готовность к следующему решению, чем на активную работу автора.';
    }
    else if (lastCommentIntent === 'reporting' || lastCommentIntent === 'doing' || lastCommentIntent === 'blocked') {
        nextActionOwner = semanticCommentAuthor || input.assignee || input.lastStatusChangedBy;
        nextActionReason = lastCommentIntent === 'blocked'
            ? 'Последний содержательный комментарий показывает блокер, поэтому начинать разбор логично с текущего исполнителя.'
            : 'По последнему содержательному комментарию похоже, что текущее движение или фиксация результата идет со стороны исполнителя.';
        authorLikelyOwnsNextStep = Boolean(nextActionOwner);
    }
    else if (input.assignee) {
        nextActionOwner = input.assignee;
        nextActionReason = 'Явного внешнего ожидания не видно, поэтому следующий шаг вероятнее всего у текущего исполнителя.';
        authorLikelyOwnsNextStep = true;
    }
    else if (input.lastStatusChangedBy) {
        nextActionOwner = input.lastStatusChangedBy;
        nextActionReason = 'Исполнитель не указан, поэтому начать стоит с участника, который последним двигал статус.';
        authorLikelyOwnsNextStep = true;
    }
    else {
        nextActionReason = 'Явный владелец следующего шага не определился по доступным полям задачи и последним комментариям.';
    }
    return {
        lastCommentIntent,
        lastCommentAuthor: semanticCommentAuthor || lastCommentAuthor,
        lastCommentAt: semanticComment?.updatedAt || semanticComment?.createdAt || lastComment?.updatedAt || lastComment?.createdAt,
        lastCommentSnippet: semanticCommentText,
        semanticCommentAuthor,
        semanticCommentAt: semanticComment?.updatedAt || semanticComment?.createdAt,
        semanticCommentSnippet: semanticCommentText,
        authorWaitingForExternalReply,
        authorLikelyOwnsNextStep,
        needsApproval,
        blockingReasonHumanized,
        requestedActionHumanized,
        waitingSubject,
        waitingQuestion,
        nextActionOwner,
        nextActionReason
    };
}
