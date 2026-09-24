"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagerSummaryService = void 0;
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function getDeadline(issue) {
    return typeof issue.deadline === 'string' ? issue.deadline : undefined;
}
function isDone(issue, doneStatusIds, doneStatusKeys) {
    const statusTypeId = issue.statusType?.id;
    const statusTypeKey = issue.statusType?.key;
    const statusId = issue.status?.id;
    const statusKey = issue.status?.key;
    if (statusTypeId === 'done' || statusTypeKey === 'done')
        return true;
    if (statusTypeId === 'cancelled' || statusTypeKey === 'cancelled')
        return true;
    if (statusId !== undefined && doneStatusIds.has(String(statusId)))
        return true;
    if (statusKey && doneStatusKeys.has(statusKey))
        return true;
    return false;
}
function isStale(issue) {
    const updated = toDate(issue.updatedAt);
    if (!updated)
        return false;
    const diffDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 7;
}
function isOverdue(issue, doneStatusIds, doneStatusKeys) {
    const deadline = getDeadline(issue);
    if (!deadline)
        return false;
    const dueDate = new Date(`${deadline}T23:59:59`);
    if (Number.isNaN(dueDate.getTime()))
        return false;
    return dueDate.getTime() < Date.now() && !isDone(issue, doneStatusIds, doneStatusKeys);
}
function scoreTask(task) {
    let score = 0;
    if (task.overdue)
        score += 100;
    if (task.stale)
        score += 60;
    return score;
}
function mapTask(issue, doneStatusIds, doneStatusKeys) {
    return {
        key: issue.key,
        summary: issue.summary,
        queue: issue.queue?.display || issue.queue?.key,
        assignee: issue.assignee?.display,
        status: issue.status?.display,
        updatedAt: issue.updatedAt,
        deadline: getDeadline(issue),
        overdue: isOverdue(issue, doneStatusIds, doneStatusKeys),
        stale: isStale(issue)
    };
}
function buildLoginCandidates(login) {
    const normalized = login.trim();
    const noAtPrefix = normalized.replace(/^@/, '');
    const localPart = noAtPrefix.includes('@') ? noAtPrefix.split('@')[0] : noAtPrefix;
    return Array.from(new Set([
        normalized,
        noAtPrefix,
        localPart
    ].filter(Boolean)));
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
async function fetchAllIssuesByQueue(trackerClient, queueKey, fields) {
    const perPage = 100;
    const issuesById = new Map();
    let cursorId;
    while (true) {
        const result = await trackerClient.searchIssues({
            queue: queueKey,
            order: '-updatedAt'
        }, {
            fields,
            perPage,
            id: cursorId
        });
        for (const issue of result.issues) {
            issuesById.set(issue.id, issue);
        }
        const nextId = parseNextIdFromLinkHeader(result.pagination.nextLink);
        if (!nextId || String(nextId) === String(cursorId))
            break;
        cursorId = nextId;
    }
    return Array.from(issuesById.values());
}
class ManagerSummaryService {
    trackerClient;
    authorization;
    statusesCache = null;
    queuesCache = null;
    managerCheckCache = new Map();
    resolvedUserCache = new Map();
    constructor(trackerClient, authorization) {
        this.trackerClient = trackerClient;
        this.authorization = authorization;
    }
    async getStatuses() {
        const now = Date.now();
        if (this.statusesCache && this.statusesCache.expiresAt > now) {
            return this.statusesCache.value;
        }
        const statuses = await this.trackerClient.getStatuses();
        this.statusesCache = {
            value: statuses,
            expiresAt: now + 4 * 60 * 60 * 1000
        };
        return statuses;
    }
    async getQueues(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this.queuesCache && this.queuesCache.expiresAt > now) {
            return this.queuesCache.value;
        }
        const queues = await this.trackerClient.getQueues();
        this.queuesCache = {
            value: queues,
            expiresAt: now + 5 * 60 * 1000
        };
        return queues;
    }
    async resolveUserByLogin(login) {
        const normalized = login.trim();
        const now = Date.now();
        const cached = this.resolvedUserCache.get(normalized);
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }
        let lastError;
        for (const candidate of buildLoginCandidates(normalized)) {
            try {
                const user = await this.trackerClient.getUser(candidate);
                this.resolvedUserCache.set(normalized, {
                    value: user,
                    expiresAt: now + 5 * 60 * 1000
                });
                return user;
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Не удалось найти пользователя Tracker по login.');
    }
    async isManagerLogin(login, forceRefresh = false) {
        const normalized = login.trim();
        const cached = this.managerCheckCache.get(normalized);
        const now = Date.now();
        if (!forceRefresh && cached && cached.expiresAt > now) {
            return cached.value;
        }
        try {
            const user = await this.resolveUserByLogin(normalized);
            const queues = await this.getQueues(forceRefresh);
            const value = queues.some((queue) => isQueueLead(queue.lead, user));
            this.managerCheckCache.set(normalized, { value, expiresAt: now + 5 * 60 * 1000 });
            return value;
        }
        catch {
            return false;
        }
    }
    async getManagerContextByLogin(login) {
        const [manager, queues, statuses] = await Promise.all([
            this.resolveUserByLogin(login),
            this.getQueues(),
            this.getStatuses()
        ]);
        const managerQueues = queues.filter((queue) => isQueueLead(queue.lead, manager));
        if (!managerQueues.length) {
            throw new Error('Вы не являетесь владельцем ни одной очереди Tracker.');
        }
        const terminalStatuses = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
        return {
            manager,
            queues: managerQueues.map((queue) => ({ key: queue.key, name: queue.name })),
            terminalStatusNames: terminalStatuses
                .map((status) => status.name || status.key || String(status.id))
                .filter(Boolean)
        };
    }
    async getSummaryByLogin(login, userId) {
        const fields = [
            'summary',
            'status',
            'statusType',
            'priority',
            'assignee',
            'updatedAt',
            'deadline',
            'queue'
        ];
        const context = await this.getManagerContextByLogin(login);
        const manager = context.manager;
        const managerQueues = context.queues;
        const statuses = await this.getStatuses();
        const terminalStatuses = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
        const doneStatusIds = new Set(terminalStatuses.map((status) => String(status.id)));
        const doneStatusKeys = new Set(terminalStatuses.filter((status) => status.key).map((status) => String(status.key)));
        const issuesByQueue = await Promise.all(managerQueues.map(async (queue) => ({
            queue,
            issues: await this.authorization.filterReadableIssues(userId, await fetchAllIssuesByQueue(this.trackerClient, queue.key, fields))
        })));
        const allIssues = issuesByQueue.flatMap((item) => item.issues);
        const activeIssues = allIssues.filter((issue) => !isDone(issue, doneStatusIds, doneStatusKeys));
        const tasks = activeIssues.map((issue) => mapTask(issue, doneStatusIds, doneStatusKeys));
        const queueStats = issuesByQueue.map(({ queue, issues }) => {
            const active = issues.filter((issue) => !isDone(issue, doneStatusIds, doneStatusKeys));
            const activeTasks = active.map((issue) => mapTask(issue, doneStatusIds, doneStatusKeys));
            return {
                key: queue.key,
                name: queue.name,
                total: issues.length,
                active: active.length,
                overdue: activeTasks.filter((task) => task.overdue).length,
                stale: activeTasks.filter((task) => task.stale).length,
                topTasks: activeTasks
                    .slice()
                    .sort((a, b) => scoreTask(b) - scoreTask(a))
                    .slice(0, 3)
            };
        });
        return {
            login,
            manager,
            queues: managerQueues.map((queue) => ({ key: queue.key, name: queue.name })),
            terminalStatusNames: terminalStatuses.map((status) => status.name || status.key || String(status.id)).filter(Boolean),
            totalIssues: allIssues.length,
            activeIssues: activeIssues.length,
            problematicCount: tasks.filter((task) => task.overdue || task.stale).length,
            overdueCount: tasks.filter((task) => task.overdue).length,
            staleCount: tasks.filter((task) => task.stale).length,
            queueStats,
            topTasks: tasks
                .slice()
                .sort((a, b) => scoreTask(b) - scoreTask(a))
                .slice(0, 5)
        };
    }
}
exports.ManagerSummaryService = ManagerSummaryService;
