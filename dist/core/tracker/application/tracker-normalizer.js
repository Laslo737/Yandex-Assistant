"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTrackerIssueBundle = normalizeTrackerIssueBundle;
function collectUser(map, user) {
    if (!user?.id)
        return;
    map.set(user.id, {
        trackerUserId: user.id,
        display: user.display,
        cloudUid: user.cloudUid,
        passportUid: user.passportUid
    });
}
function toReferenceKey(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const typed = value;
    return typed.key;
}
function extractCustomFields(issue) {
    const knownKeys = new Set([
        'self',
        'id',
        'key',
        'version',
        'summary',
        'description',
        'createdAt',
        'updatedAt',
        'lastCommentUpdatedAt',
        'statusStartTime',
        'start',
        'unique',
        'messengerId',
        'questionForPartner',
        'commentWithExternalMessageCount',
        'commentWithoutExternalMessageCount',
        'aliases',
        'tags',
        'favorite',
        'votes',
        'boards',
        'parent',
        'updatedBy',
        'createdBy',
        'assignee',
        'previousStatusLastAssignee',
        'followers',
        'sprint',
        'type',
        'priority',
        'queue',
        'status',
        'previousStatus',
        'statusType',
        'project',
        'sla'
    ]);
    return Object.fromEntries(Object.entries(issue).filter(([key]) => !knownKeys.has(key)));
}
function normalizeTrackerIssueBundle(bundle) {
    const users = new Map();
    const issue = bundle.issue;
    collectUser(users, issue.assignee);
    collectUser(users, issue.createdBy);
    collectUser(users, issue.updatedBy);
    collectUser(users, issue.previousStatusLastAssignee);
    issue.followers?.forEach((user) => collectUser(users, user));
    const normalizedIssue = {
        trackerIssueId: issue.id,
        key: issue.key,
        summary: issue.summary,
        description: issue.description,
        queueKey: issue.queue?.key,
        queueName: issue.queue?.display,
        statusKey: issue.status?.key,
        statusName: issue.status?.display,
        previousStatusKey: issue.previousStatus?.key,
        previousStatusName: issue.previousStatus?.display,
        statusTypeKey: issue.statusType?.key,
        priorityKey: issue.priority?.key,
        priorityName: issue.priority?.display,
        assigneeId: issue.assignee?.id,
        assigneeDisplay: issue.assignee?.display,
        createdById: issue.createdBy?.id,
        updatedById: issue.updatedBy?.id,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        lastCommentUpdatedAt: issue.lastCommentUpdatedAt,
        statusStartTime: issue.statusStartTime,
        followerIds: (issue.followers || []).map((user) => user.id),
        boardIds: (issue.boards || []).map((board) => board.id),
        tags: issue.tags || [],
        rawCustomFields: extractCustomFields(issue)
    };
    const comments = bundle.comments.map((comment) => {
        collectUser(users, comment.createdBy);
        collectUser(users, comment.updatedBy);
        comment.summonees?.forEach((user) => collectUser(users, user));
        return {
            trackerCommentId: comment.id,
            trackerCommentLongId: comment.longId,
            trackerIssueId: issue.id,
            trackerIssueKey: issue.key,
            text: comment.text,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            createdById: comment.createdBy?.id,
            updatedById: comment.updatedBy?.id,
            summoneeIds: (comment.summonees || []).map((user) => user.id),
            transport: comment.transport,
            type: comment.type
        };
    });
    const history = bundle.changelog.map((entry) => {
        collectUser(users, entry.updatedBy);
        const statusChange = entry.fields?.find((field) => field.field.id === 'status');
        return {
            trackerHistoryId: entry.id,
            trackerIssueId: issue.id,
            trackerIssueKey: issue.key,
            type: entry.type,
            transport: entry.transport,
            updatedAt: entry.updatedAt,
            updatedById: entry.updatedBy?.id,
            changedFieldIds: (entry.fields || []).map((field) => String(field.field.id)),
            addedCommentIds: (entry.comments?.added || []).map((comment) => comment.id),
            executedTriggerIds: (entry.executedTriggers || []).map((trigger) => trigger.trigger.id),
            statusFromKey: toReferenceKey(statusChange?.from),
            statusToKey: toReferenceKey(statusChange?.to)
        };
    });
    return {
        issue: normalizedIssue,
        comments,
        history,
        users: Array.from(users.values()),
        meta: {
            fetchedAt: bundle.fetchedAt,
            commentsCount: comments.length,
            historyCount: history.length
        }
    };
}
