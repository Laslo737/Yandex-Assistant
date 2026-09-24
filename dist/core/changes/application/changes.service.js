"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangesService = void 0;
const tracker_comment_text_1 = require("../../../shared/utils/tracker-comment-text");
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function isWithinHours(value, hours) {
    const date = toDate(value);
    if (!date)
        return false;
    return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}
function buildAssigneeCandidates(login) {
    const normalized = login.trim();
    const noAtPrefix = normalized.replace(/^@/, '');
    const localPart = noAtPrefix.includes('@') ? noAtPrefix.split('@')[0] : noAtPrefix;
    return Array.from(new Set([normalized, noAtPrefix, `@${noAtPrefix}`, localPart].filter(Boolean)));
}
function buildLoginCandidates(login) {
    const normalized = login.trim();
    const noAtPrefix = normalized.replace(/^@/, '');
    const localPart = noAtPrefix.includes('@') ? noAtPrefix.split('@')[0] : noAtPrefix;
    return Array.from(new Set([normalized, noAtPrefix, localPart].filter(Boolean)));
}
function userIdentitySet(user) {
    return new Set([
        user.id,
        user.uid !== undefined ? String(user.uid) : undefined,
        user.trackerUid !== undefined ? String(user.trackerUid) : undefined,
        user.passportUid !== undefined ? String(user.passportUid) : undefined,
        user.cloudUid
    ].filter(Boolean));
}
function isQueueLead(queueLead, user) {
    if (!queueLead)
        return false;
    const identities = userIdentitySet(user);
    if (queueLead.id && identities.has(String(queueLead.id)))
        return true;
    if (queueLead.cloudUid && identities.has(String(queueLead.cloudUid)))
        return true;
    if (queueLead.passportUid !== undefined && identities.has(String(queueLead.passportUid)))
        return true;
    return false;
}
function isStatusFieldChange(entry) {
    return Boolean(entry.fields?.some((field) => {
        const id = String(field.field?.id ?? '').toLowerCase();
        const key = String(field.field?.key ?? '').toLowerCase();
        const display = String(field.field?.display ?? '').toLowerCase();
        return id === 'status' || key === 'status' || display.includes('статус') || display === 'status';
    }));
}
function extractDisplay(value) {
    if (!value)
        return undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        const displays = value.map((item) => extractDisplay(item)).filter(Boolean);
        return displays.length ? displays.join(', ') : undefined;
    }
    if (typeof value === 'object') {
        const typed = value;
        return typed.display || typed.key || (typed.id !== undefined ? String(typed.id) : undefined);
    }
    return undefined;
}
function getStatusChangeText(entry) {
    const statusField = entry.fields?.find((field) => {
        const id = String(field.field?.id ?? '').toLowerCase();
        const key = String(field.field?.key ?? '').toLowerCase();
        const display = String(field.field?.display ?? '').toLowerCase();
        return id === 'status' || key === 'status' || display.includes('статус') || display === 'status';
    });
    if (!statusField)
        return undefined;
    const from = extractDisplay(statusField.from);
    const to = extractDisplay(statusField.to);
    if (from && to)
        return `Статус: ${from} → ${to}`;
    if (to)
        return `Статус изменен на ${to}`;
    return 'Статус изменился';
}
function stripHtml(html) {
    return html
        .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&amp;/gi, '&')
        .replace(/\r/g, '')
        .trim();
}
function normalizePreviewText(text) {
    return text
        .replace(/\{data-quotelink=true\}/g, ' ')
        .replace(/\\\./g, '.')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}
function sanitizeCommentPreview(text) {
    const normalized = normalizePreviewText(text || '');
    if (!normalized)
        return undefined;
    return (0, tracker_comment_text_1.normalizeTrackerCommentText)(normalized, 90);
}
function extractCommentPreview(comment) {
    if (!comment)
        return undefined;
    const fromHtml = comment.textHtml ? sanitizeCommentPreview(stripHtml(comment.textHtml)) : undefined;
    if (fromHtml)
        return fromHtml;
    const fromText = sanitizeCommentPreview(comment.text);
    if (fromText)
        return fromText;
    return undefined;
}
function toNumericId(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function findLatestCommentWithinPeriod(comments, periodHours) {
    const recentComments = comments.filter((comment) => isWithinHours(comment.updatedAt || comment.createdAt, periodHours));
    if (!recentComments.length)
        return undefined;
    return recentComments
        .slice()
        .sort((a, b) => {
        const aTime = toDate(a.updatedAt || a.createdAt)?.getTime() || 0;
        const bTime = toDate(b.updatedAt || b.createdAt)?.getTime() || 0;
        if (aTime !== bTime)
            return bTime - aTime;
        return toNumericId(b.id) - toNumericId(a.id);
    })[0];
}
function findLatestCommentFromChangelog(changelogEntries, comments, periodHours) {
    const recentCommentEvents = changelogEntries
        .filter((entry) => isWithinHours(entry.updatedAt, periodHours))
        .filter((entry) => (entry.comments?.added?.length || 0) > 0)
        .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
    for (const entry of recentCommentEvents) {
        const refs = entry.comments?.added || [];
        for (const ref of refs) {
            const matched = comments.find((comment) => {
                const refId = String(ref.id);
                const refObjectId = ref.objectId ? String(ref.objectId) : undefined;
                return String(comment.id) === refId || (comment.longId && String(comment.longId) === refObjectId);
            });
            if (matched)
                return matched;
        }
    }
    return undefined;
}
function parseNextIdFromLinkHeader(linkHeader) {
    if (!linkHeader)
        return undefined;
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
    if (!nextMatch?.[1])
        return undefined;
    try {
        const url = new URL(nextMatch[1]);
        return url.searchParams.get('id') || undefined;
    }
    catch {
        return undefined;
    }
}
async function fetchAllIssueComments(trackerClient, issueIdOrKey) {
    const commentsById = new Map();
    const perPage = 100;
    let page = 1;
    let totalPages = 1;
    do {
        const result = await trackerClient.getIssueComments(issueIdOrKey, {
            expand: ['html'],
            perPage,
            page
        });
        for (const comment of result.comments) {
            commentsById.set(String(comment.id), comment);
        }
        totalPages = Math.max(result.pagination.totalPages || 1, 1);
        page += 1;
    } while (page <= totalPages);
    return Array.from(commentsById.values());
}
function isOverdue(issue) {
    const deadline = typeof issue.deadline === 'string' ? issue.deadline : undefined;
    if (!deadline)
        return false;
    const dueDate = new Date(`${deadline}T23:59:59`);
    if (Number.isNaN(dueDate.getTime()))
        return false;
    const done = issue.statusType?.id === 'done' || issue.statusType?.key === 'done';
    const cancelled = issue.statusType?.id === 'cancelled' || issue.statusType?.key === 'cancelled';
    return dueDate.getTime() < Date.now() && !done && !cancelled;
}
async function fetchAllIssuesByAssignee(trackerClient, assignee, fields) {
    const issuesById = new Map();
    const perPage = 100;
    let page = 1;
    let totalPages = 1;
    do {
        const result = await trackerClient.searchIssues({ filter: { assignee }, order: '-updatedAt' }, { fields, perPage, page });
        for (const issue of result.issues)
            issuesById.set(issue.id, issue);
        totalPages = Math.max(result.pagination.totalPages || 1, 1);
        page += 1;
    } while (page <= totalPages);
    return Array.from(issuesById.values());
}
async function fetchAllIssuesByQueue(trackerClient, queueKey, fields) {
    const issuesById = new Map();
    const perPage = 100;
    let cursorId;
    while (true) {
        const result = await trackerClient.searchIssues({ queue: queueKey, order: '-updatedAt' }, { fields, perPage, id: cursorId });
        for (const issue of result.issues)
            issuesById.set(issue.id, issue);
        const nextId = parseNextIdFromLinkHeader(result.pagination.nextLink);
        if (!nextId || String(nextId) === String(cursorId))
            break;
        cursorId = nextId;
    }
    return Array.from(issuesById.values());
}
class ChangesService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async resolveTrackerUser(login) {
        let lastError;
        for (const candidate of buildLoginCandidates(login)) {
            try {
                return await this.deps.trackerClient.getUser(candidate);
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Не удалось найти пользователя Tracker по login.');
    }
    async getIssueSignals(issue, periodHours) {
        const commented = isWithinHours(issue.lastCommentUpdatedAt, periodHours);
        try {
            const [changelog, comments] = await Promise.all([
                this.deps.trackerClient.getIssueChangelog(issue.key),
                fetchAllIssueComments(this.deps.trackerClient, issue.key)
            ]);
            const recentEntries = changelog.entries
                .filter((entry) => isWithinHours(entry.updatedAt, periodHours))
                .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
            const lastStatusChange = recentEntries.find(isStatusFieldChange);
            const statusChanged = Boolean(lastStatusChange);
            const latestComment = findLatestCommentFromChangelog(recentEntries, comments, periodHours) ||
                findLatestCommentWithinPeriod(comments, periodHours);
            const commentPreview = extractCommentPreview(latestComment);
            const activityText = latestComment && commentPreview
                ? `Свежий комментарий: ${commentPreview}`
                : undefined;
            return {
                statusChanged,
                commented,
                statusChangeText: lastStatusChange ? getStatusChangeText(lastStatusChange) : undefined,
                activityText
            };
        }
        catch {
            return {
                statusChanged: false,
                commented,
                activityText: undefined
            };
        }
    }
    async getMyChangesByLogin(login, periodHours, userId) {
        const fields = ['summary', 'statusType', 'assignee', 'updatedAt', 'lastCommentUpdatedAt', 'queue', 'deadline'];
        const candidates = buildAssigneeCandidates(login);
        let matchedAssigneeCandidate = candidates[0];
        let bestIssues = [];
        let bestScore = -1;
        for (const candidate of candidates) {
            const issues = await this.deps.authorization.filterReadableIssues(userId, (await fetchAllIssuesByAssignee(this.deps.trackerClient, candidate, fields))
                .filter((issue) => issue.assignee?.id === userId));
            const changed = issues.filter((issue) => isWithinHours(issue.updatedAt, periodHours) || isWithinHours(issue.lastCommentUpdatedAt, periodHours));
            const score = changed.length * 100000 + issues.length;
            if (score > bestScore) {
                bestScore = score;
                matchedAssigneeCandidate = candidate;
                bestIssues = issues;
            }
        }
        const changedIssues = bestIssues
            .filter((issue) => isWithinHours(issue.updatedAt, periodHours) || isWithinHours(issue.lastCommentUpdatedAt, periodHours))
            .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
        const enriched = await Promise.all(changedIssues.slice(0, 15).map(async (issue) => ({
            issue,
            ...(await this.getIssueSignals(issue, periodHours))
        })));
        return {
            scope: 'my',
            periodHours,
            titleTarget: matchedAssigneeCandidate,
            changedIssuesCount: changedIssues.length,
            statusChangedCount: enriched.filter((item) => item.statusChanged).length,
            commentedCount: enriched.filter((item) => item.commented).length,
            overdueCount: enriched.filter((item) => isOverdue(item.issue)).length,
            topTasks: enriched.slice(0, 5).map(({ issue, statusChanged, commented, statusChangeText, activityText }) => ({
                key: issue.key,
                summary: issue.summary,
                queue: issue.queue?.display || issue.queue?.key,
                assignee: issue.assignee?.display,
                updatedAt: issue.updatedAt,
                statusChanged,
                commented,
                overdue: isOverdue(issue),
                statusChangeText,
                activityText
            }))
        };
    }
    async getTeamChangesByLogin(login, periodHours, userId) {
        if (!(await this.deps.managerSummaryService.isManagerLogin(login, true))) {
            throw new Error('Изменения по команде доступны только владельцам очередей / руководителям.');
        }
        const user = await this.resolveTrackerUser(login);
        const queues = (await this.deps.trackerClient.getQueues()).filter((queue) => isQueueLead(queue.lead, user));
        const fields = ['summary', 'statusType', 'assignee', 'updatedAt', 'lastCommentUpdatedAt', 'queue', 'deadline'];
        const issuesByQueue = await Promise.all(queues.map(async (queue) => ({
            queue,
            issues: await this.deps.authorization.filterReadableIssues(userId, await fetchAllIssuesByQueue(this.deps.trackerClient, queue.key, fields))
        })));
        const changedByQueue = issuesByQueue.map(({ queue, issues }) => ({
            queue,
            changed: issues.filter((issue) => isWithinHours(issue.updatedAt, periodHours) || isWithinHours(issue.lastCommentUpdatedAt, periodHours))
        }));
        const changedIssues = changedByQueue.flatMap((item) => item.changed)
            .sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0));
        const enriched = await Promise.all(changedIssues.slice(0, 20).map(async (issue) => ({
            issue,
            ...(await this.getIssueSignals(issue, periodHours))
        })));
        return {
            scope: 'team',
            periodHours,
            titleTarget: queues.map((queue) => queue.key).join(', '),
            changedIssuesCount: changedIssues.length,
            statusChangedCount: enriched.filter((item) => item.statusChanged).length,
            commentedCount: enriched.filter((item) => item.commented).length,
            overdueCount: enriched.filter((item) => isOverdue(item.issue)).length,
            queueStats: changedByQueue
                .map(({ queue, changed }) => ({ key: queue.key, changed: changed.length }))
                .sort((a, b) => b.changed - a.changed)
                .slice(0, 5),
            topTasks: enriched.slice(0, 5).map(({ issue, statusChanged, commented, statusChangeText, activityText }) => ({
                key: issue.key,
                summary: issue.summary,
                queue: issue.queue?.display || issue.queue?.key,
                assignee: issue.assignee?.display,
                updatedAt: issue.updatedAt,
                statusChanged,
                commented,
                overdue: isOverdue(issue),
                statusChangeText,
                activityText
            }))
        };
    }
}
exports.ChangesService = ChangesService;
