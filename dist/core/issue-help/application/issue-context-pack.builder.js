"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIssueContextPack = buildIssueContextPack;
exports.formatIssueContextPackForLlm = formatIssueContextPackForLlm;
exports.formatCompactIssueContextPackForLlm = formatCompactIssueContextPackForLlm;
const tracker_comment_text_1 = require("../../../shared/utils/tracker-comment-text");
function normalizeSnippet(value, maxLength = 500) {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized)
        return undefined;
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}
function summarizeChangeField(value) {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (Array.isArray(value)) {
        const parts = value.map((item) => summarizeChangeField(item)).filter(Boolean);
        return parts.length ? parts.join(', ') : undefined;
    }
    if (typeof value === 'object') {
        const item = value;
        return item.display || item.key || (item.id !== undefined ? String(item.id) : undefined);
    }
    return undefined;
}
function buildChangeLine(field) {
    const fieldLabel = field.field?.display || field.field?.key || String(field.field?.id || 'field');
    const fromLabel = summarizeChangeField(field.from);
    const toLabel = summarizeChangeField(field.to);
    if (fromLabel || toLabel)
        return `${fieldLabel}: ${fromLabel || '—'} → ${toLabel || '—'}`;
    return fieldLabel;
}
function extractRelevantSentence(text, patterns) {
    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
    for (const sentence of sentences) {
        if (patterns.some((pattern) => pattern.test(sentence))) {
            return normalizeSnippet(sentence, 320);
        }
    }
    return undefined;
}
function findCommentByPattern(bundle, patterns) {
    const comments = bundle.comments
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    for (const comment of comments) {
        const text = normalizeSnippet((0, tracker_comment_text_1.normalizeTrackerCommentText)(comment.text, 300), 300);
        if (!text)
            continue;
        if (patterns.some((pattern) => pattern.test(text))) {
            return text;
        }
    }
    return undefined;
}
function findWaitingTopic(bundle) {
    const comments = bundle.comments
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    let topic;
    let sourceComment;
    let lastConcreteAsk;
    let agreedWhat;
    let remainingOpenPoint;
    for (const comment of comments) {
        const text = normalizeSnippet((0, tracker_comment_text_1.normalizeTrackerCommentText)(comment.text, 420), 420);
        if (!text)
            continue;
        if (!lastConcreteAsk) {
            lastConcreteAsk = extractRelevantSentence(text, [/\?/i, /когда будет удобно созвониться/i, /покажу нововведения/i, /все верно/i, /всё верно/i, /можете/i, /подскажите/i, /уточните/i]);
        }
        if (!agreedWhat) {
            agreedWhat = extractRelevantSentence(text, [/процесс в целом согласован/i, /функционал .* принят/i, /по остальным пунктам .* всё так/i, /по остальным пунктам .* все так/i]);
        }
        if (!remainingOpenPoint) {
            remainingOpenPoint = extractRelevantSentence(text, [/осталось согласовать правки/i, /система эскалации/i, /требуется доработка/i, /кроме пункта 4/i, /не получится/i, /альтернатива/i]);
        }
        if (!topic) {
            const topicSentence = extractRelevantSentence(text, [/буду ждать ос/i, /буду ждать обратн/i, /жду ос/i, /ждем ос/i, /ждём ос/i, /осталось согласовать/i, /нужно согласовать/i, /надо согласовать/i]);
            if (topicSentence) {
                topic = topicSentence;
                sourceComment = text;
            }
        }
    }
    if (!topic && remainingOpenPoint) {
        topic = remainingOpenPoint;
        sourceComment = remainingOpenPoint;
    }
    return { topic, sourceComment, lastConcreteAsk, agreedWhat, remainingOpenPoint };
}
function buildIssuePurpose(bundle) {
    const summary = normalizeSnippet(bundle.issue.summary, 220);
    const description = normalizeSnippet(typeof bundle.issue.description === 'string' ? (0, tracker_comment_text_1.normalizeTrackerCommentText)(bundle.issue.description, 420) : undefined, 420);
    if (summary && description)
        return `${summary}. ${description}`;
    return summary || description;
}
function buildEvidence(input) {
    const waitingForReplyFrom = Array.isArray(input.bundle.issue.pendingReplyFrom)
        ? input.bundle.issue.pendingReplyFrom
            .map((item) => {
            const typed = item;
            return typed.display || typed.key || (typed.id !== undefined ? String(typed.id) : undefined);
        })
            .filter((item) => Boolean(item))
        : [];
    const evidence = [];
    if (input.explain.overdue)
        evidence.push({ label: 'Срок', detail: 'Задача просрочена.' });
    if (input.explain.waitingForReply) {
        evidence.push({
            label: 'Ожидание ответа',
            detail: waitingForReplyFrom.length
                ? `Задача ждет ответа от: ${waitingForReplyFrom.join(', ')}.`
                : 'Задача находится в ожидании ответа.'
        });
    }
    if (input.explain.staleDays !== undefined)
        evidence.push({ label: 'Обновления', detail: `Задача не обновлялась ${input.explain.staleDays} дн.` });
    if (input.explain.commentSilenceDays !== undefined)
        evidence.push({ label: 'Комментарии', detail: `Свежих комментариев не было ${input.explain.commentSilenceDays} дн.` });
    if (input.explain.statusSilenceDays !== undefined)
        evidence.push({ label: 'Статус', detail: `Статус не менялся ${input.explain.statusSilenceDays} дн.` });
    if (input.latestStatusChange)
        evidence.push({ label: 'Последняя смена статуса', detail: input.latestStatusChange });
    if (input.latestFieldChange)
        evidence.push({ label: 'Последнее изменение поля', detail: input.latestFieldChange });
    if (input.explain.blockingReasonHumanized)
        evidence.push({ label: 'Человеческое объяснение блокера', detail: input.explain.blockingReasonHumanized });
    if (input.explain.requestedActionHumanized)
        evidence.push({ label: 'Какого действия ждут', detail: input.explain.requestedActionHumanized });
    if (input.latestBlockingComment)
        evidence.push({ label: 'Комментарий с блокером', detail: input.latestBlockingComment });
    if (input.latestAskComment)
        evidence.push({ label: 'Последний явный вопрос', detail: input.latestAskComment });
    if (input.latestDecisionComment)
        evidence.push({ label: 'Последнее решение/договоренность', detail: input.latestDecisionComment });
    if (input.latestComment)
        evidence.push({ label: 'Последний комментарий', detail: input.latestComment });
    return evidence.slice(0, 10);
}
function buildLatestStatusChange(bundle) {
    const statusEntry = bundle.changelog
        .slice()
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .find((entry) => entry.fields?.some((field) => {
        const id = String(field.field?.id ?? '').toLowerCase();
        const key = String(field.field?.key ?? '').toLowerCase();
        const display = String(field.field?.display ?? '').toLowerCase();
        return id === 'status' || key === 'status' || display.includes('статус') || display === 'status';
    }));
    if (!statusEntry)
        return undefined;
    const statusField = statusEntry.fields?.find((field) => {
        const id = String(field.field?.id ?? '').toLowerCase();
        const key = String(field.field?.key ?? '').toLowerCase();
        const display = String(field.field?.display ?? '').toLowerCase();
        return id === 'status' || key === 'status' || display.includes('статус') || display === 'status';
    });
    return statusField ? buildChangeLine(statusField) : undefined;
}
function buildLatestFieldChange(bundle) {
    const entry = bundle.changelog
        .slice()
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];
    const field = entry?.fields?.[0];
    return field ? buildChangeLine(field) : undefined;
}
function buildIssueContextPack(input) {
    const { issueKey, userRequest, intent, bundle, explain } = input;
    const latestComment = normalizeSnippet((0, tracker_comment_text_1.normalizeTrackerCommentText)(bundle.comments
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0]?.text, 300), 300);
    const latestStatusChange = buildLatestStatusChange(bundle);
    const latestFieldChange = buildLatestFieldChange(bundle);
    const latestAskComment = findCommentByPattern(bundle, [/\?/i, /нужн/i, /можешь/i, /подскаж/i, /уточн/i, /согласовать/i]);
    const latestDecisionComment = findCommentByPattern(bundle, [/решили/i, /договор/i, /сделаем/i, /беру/i, /готово/i, /сделано/i]);
    const latestBlockingComment = findCommentByPattern(bundle, [/ждем/i, /ждём/i, /буду ждать/i, /блок/i, /после ответа/i, /нужен ответ/i, /ожидаем/i, /согласовать/i, /требуется доработка/i]);
    const waitingTopic = findWaitingTopic(bundle);
    const issuePurpose = buildIssuePurpose(bundle);
    const waitingForReplyFrom = Array.isArray(bundle.issue.pendingReplyFrom)
        ? bundle.issue.pendingReplyFrom
            .map((item) => {
            const typed = item;
            return typed.display || typed.key || (typed.id !== undefined ? String(typed.id) : undefined);
        })
            .filter((item) => Boolean(item))
        : [];
    return {
        issueKey,
        userRequest,
        intent,
        meta: {
            summary: bundle.issue.summary,
            description: normalizeSnippet(typeof bundle.issue.description === 'string' ? bundle.issue.description : undefined, 1200),
            status: bundle.issue.status?.display,
            queue: bundle.issue.queue?.display || bundle.issue.queue?.key,
            assignee: bundle.issue.assignee?.display,
            priority: bundle.issue.priority?.display,
            type: bundle.issue.type?.display,
            deadline: typeof bundle.issue.deadline === 'string' ? bundle.issue.deadline : undefined,
            createdAt: bundle.issue.createdAt,
            updatedAt: bundle.issue.updatedAt,
            parent: bundle.issue.parent?.key || bundle.issue.parent?.display,
            tags: Array.isArray(bundle.issue.tags) ? bundle.issue.tags.filter((item) => typeof item === 'string').slice(0, 10) : [],
            followers: Array.isArray(bundle.issue.followers)
                ? bundle.issue.followers.map((item) => item.display).filter((item) => Boolean(item)).slice(0, 10)
                : [],
            commentsCount: bundle.comments.length,
            changelogCount: bundle.changelog.length
        },
        comments: bundle.comments
            .slice()
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
            .slice(0, 5)
            .map((comment) => ({
            author: comment.updatedBy?.display || comment.createdBy?.display,
            updatedAt: comment.updatedAt || comment.createdAt,
            text: normalizeSnippet((0, tracker_comment_text_1.normalizeTrackerCommentText)(comment.text, 500), 500)
        })),
        changelog: bundle.changelog
            .slice()
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .slice(0, 5)
            .map((entry) => ({
            updatedAt: entry.updatedAt,
            updatedBy: entry.updatedBy?.display,
            changes: (entry.fields || []).slice(0, 5).map((field) => buildChangeLine(field))
        })),
        highlights: {
            latestComment,
            latestStatusChange,
            latestFieldChange,
            latestAskComment,
            latestDecisionComment,
            latestBlockingComment: waitingTopic.topic || latestBlockingComment
        },
        derived: {
            issuePurpose,
            agreedWhat: waitingTopic.agreedWhat,
            remainingOpenPoint: waitingTopic.remainingOpenPoint,
            waitingTopic: waitingTopic.topic,
            waitingTopicSourceComment: waitingTopic.sourceComment,
            lastConcreteAsk: waitingTopic.lastConcreteAsk,
            waitingSubject: explain.waitingSubject,
            waitingQuestion: explain.waitingQuestion,
            blockingReasonHumanized: explain.blockingReasonHumanized,
            requestedActionHumanized: explain.requestedActionHumanized,
            lastCommentIntent: explain.lastCommentIntent
        },
        evidence: buildEvidence({
            bundle,
            explain,
            latestComment,
            latestStatusChange,
            latestFieldChange,
            latestAskComment,
            latestDecisionComment,
            latestBlockingComment: waitingTopic.topic || latestBlockingComment
        }),
        heuristics: {
            overdue: explain.overdue,
            waitingForReply: explain.waitingForReply,
            waitingForReplyFrom,
            staleDays: explain.staleDays,
            commentSilenceDays: explain.commentSilenceDays,
            statusSilenceDays: explain.statusSilenceDays,
            nextActionOwner: explain.nextActionOwner,
            nextActionReason: explain.nextActionReason,
            authorWaitingForExternalReply: explain.authorWaitingForExternalReply,
            authorLikelyOwnsNextStep: explain.authorLikelyOwnsNextStep,
            needsApproval: explain.needsApproval,
            probableCauses: explain.probableCauses,
            recommendations: explain.recommendations
        }
    };
}
function formatIssueContextPackForLlm(pack) {
    return [
        `USER_REQUEST: ${pack.userRequest}`,
        `INTENT: ${pack.intent}`,
        '',
        'ISSUE_META:',
        `- key: ${pack.issueKey}`,
        `- summary: ${pack.meta.summary || '—'}`,
        `- status: ${pack.meta.status || '—'}`,
        `- queue: ${pack.meta.queue || '—'}`,
        `- assignee: ${pack.meta.assignee || '—'}`,
        `- priority: ${pack.meta.priority || '—'}`,
        `- type: ${pack.meta.type || '—'}`,
        `- deadline: ${pack.meta.deadline || '—'}`,
        `- createdAt: ${pack.meta.createdAt || '—'}`,
        `- updatedAt: ${pack.meta.updatedAt || '—'}`,
        `- parent: ${pack.meta.parent || '—'}`,
        `- tags: ${pack.meta.tags.length ? pack.meta.tags.join(', ') : '—'}`,
        `- followers: ${pack.meta.followers.length ? pack.meta.followers.join(', ') : '—'}`,
        `- description: ${pack.meta.description || '—'}`,
        '',
        'DERIVED_CONTEXT:',
        `- issuePurpose: ${pack.derived.issuePurpose || '—'}`,
        `- agreedWhat: ${pack.derived.agreedWhat || '—'}`,
        `- remainingOpenPoint: ${pack.derived.remainingOpenPoint || '—'}`,
        `- waitingTopic: ${pack.derived.waitingTopic || '—'}`,
        `- waitingTopicSourceComment: ${pack.derived.waitingTopicSourceComment || '—'}`,
        `- lastConcreteAsk: ${pack.derived.lastConcreteAsk || '—'}`,
        `- waitingSubject: ${pack.derived.waitingSubject || '—'}`,
        `- waitingQuestion: ${pack.derived.waitingQuestion || '—'}`,
        `- blockingReasonHumanized: ${pack.derived.blockingReasonHumanized || '—'}`,
        `- requestedActionHumanized: ${pack.derived.requestedActionHumanized || '—'}`,
        `- lastCommentIntent: ${pack.derived.lastCommentIntent || '—'}`,
        '',
        'HEURISTICS:',
        `- overdue: ${pack.heuristics.overdue ? 'yes' : 'no'}`,
        `- waitingForReply: ${pack.heuristics.waitingForReply ? 'yes' : 'no'}`,
        `- waitingForReplyFrom: ${pack.heuristics.waitingForReplyFrom.length ? pack.heuristics.waitingForReplyFrom.join(', ') : '—'}`,
        `- staleDays: ${pack.heuristics.staleDays ?? '—'}`,
        `- commentSilenceDays: ${pack.heuristics.commentSilenceDays ?? '—'}`,
        `- statusSilenceDays: ${pack.heuristics.statusSilenceDays ?? '—'}`,
        `- nextActionOwner: ${pack.heuristics.nextActionOwner || '—'}`,
        `- nextActionReason: ${pack.heuristics.nextActionReason || '—'}`,
        `- authorWaitingForExternalReply: ${pack.heuristics.authorWaitingForExternalReply ? 'yes' : 'no'}`,
        `- authorLikelyOwnsNextStep: ${pack.heuristics.authorLikelyOwnsNextStep ? 'yes' : 'no'}`,
        `- needsApproval: ${pack.heuristics.needsApproval ? 'yes' : 'no'}`,
        `- probableCauses: ${pack.heuristics.probableCauses.length ? pack.heuristics.probableCauses.join(' | ') : '—'}`,
        `- recommendations: ${pack.heuristics.recommendations.length ? pack.heuristics.recommendations.join(' | ') : '—'}`,
        '',
        'HIGHLIGHTS:',
        `- latestComment: ${pack.highlights.latestComment || '—'}`,
        `- latestStatusChange: ${pack.highlights.latestStatusChange || '—'}`,
        `- latestFieldChange: ${pack.highlights.latestFieldChange || '—'}`,
        `- latestAskComment: ${pack.highlights.latestAskComment || '—'}`,
        `- latestDecisionComment: ${pack.highlights.latestDecisionComment || '—'}`,
        `- latestBlockingComment: ${pack.highlights.latestBlockingComment || '—'}`,
        '',
        'EVIDENCE:',
        ...pack.evidence.map((item) => `- ${item.label}: ${item.detail}`),
        '',
        'RECENT_CHANGELOG:',
        ...pack.changelog.flatMap((entry, index) => [
            `#${index + 1} ${entry.updatedAt || '—'} ${entry.updatedBy || ''}`.trim(),
            ...entry.changes.map((change) => `- ${change}`)
        ]),
        '',
        'RECENT_COMMENTS:',
        ...pack.comments.map((comment, index) => `#${index + 1} ${comment.updatedAt || '—'} ${comment.author || ''}: ${comment.text || '—'}`)
    ].join('\n');
}
function formatCompactIssueContextPackForLlm(pack) {
    const evidence = pack.evidence.slice(0, 6);
    const comments = pack.comments.slice(0, 2);
    const changes = pack.changelog.slice(0, 2);
    return [
        `USER_REQUEST: ${pack.userRequest}`,
        `INTENT: ${pack.intent}`,
        '',
        'ISSUE_CORE:',
        `- key: ${pack.issueKey}`,
        `- summary: ${pack.meta.summary || '—'}`,
        `- status: ${pack.meta.status || '—'}`,
        `- assignee: ${pack.meta.assignee || '—'}`,
        `- priority: ${pack.meta.priority || '—'}`,
        `- deadline: ${pack.meta.deadline || '—'}`,
        `- issuePurpose: ${pack.derived.issuePurpose || pack.meta.description || '—'}`,
        '',
        'BLOCKER_SUMMARY:',
        `- waitingForReplyFrom: ${pack.heuristics.waitingForReplyFrom.length ? pack.heuristics.waitingForReplyFrom.join(', ') : '—'}`,
        `- waitingTopic: ${pack.derived.waitingTopic || '—'}`,
        `- remainingOpenPoint: ${pack.derived.remainingOpenPoint || '—'}`,
        `- agreedWhat: ${pack.derived.agreedWhat || '—'}`,
        `- lastConcreteAsk: ${pack.derived.lastConcreteAsk || '—'}`,
        `- waitingSubject: ${pack.derived.waitingSubject || '—'}`,
        `- waitingQuestion: ${pack.derived.waitingQuestion || '—'}`,
        `- requestedActionHumanized: ${pack.derived.requestedActionHumanized || '—'}`,
        `- blockingReasonHumanized: ${pack.derived.blockingReasonHumanized || '—'}`,
        `- lastCommentIntent: ${pack.derived.lastCommentIntent || '—'}`,
        `- latestBlockingComment: ${pack.highlights.latestBlockingComment || '—'}`,
        '',
        'FACTS:',
        ...evidence.map((item) => `- ${item.label}: ${item.detail}`),
        '',
        'RECENT_SIGNALS:',
        ...changes.flatMap((entry, index) => [
            `#CHANGE_${index + 1} ${entry.updatedAt || '—'} ${entry.updatedBy || ''}`.trim(),
            ...entry.changes.slice(0, 2).map((change) => `- ${change}`)
        ]),
        ...comments.map((comment, index) => `#COMMENT_${index + 1} ${comment.updatedAt || '—'} ${comment.author || ''}: ${comment.text || '—'}`)
    ].join('\n');
}
