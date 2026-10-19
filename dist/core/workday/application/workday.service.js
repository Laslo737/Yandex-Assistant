"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkdayService = void 0;
const env_1 = require("../../../config/env");
const expiring_cache_1 = require("../../../shared/utils/expiring-cache");
const request_metrics_1 = require("../../analytics/request-metrics");
const tracker_load_1 = require("../../../integrations/yandex-tracker/tracker-load");
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
function isRecentlyUpdated(issue) {
    const updated = toDate(issue.updatedAt);
    if (!updated)
        return false;
    const diffHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
    return diffHours <= 24;
}
function getDeadline(issue) {
    const deadline = issue.deadline;
    return typeof deadline === 'string' ? deadline : undefined;
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
function mapTask(issue, doneStatusIds, doneStatusKeys) {
    return {
        key: issue.key,
        summary: issue.summary,
        status: issue.status?.display,
        queue: issue.queue?.display,
        priority: issue.priority?.display,
        updatedAt: issue.updatedAt,
        deadline: getDeadline(issue),
        overdue: isOverdue(issue, doneStatusIds, doneStatusKeys)
    };
}
function scoreTask(task) {
    let score = 0;
    if (task.overdue)
        score += 100;
    if (task.priority?.toLowerCase().includes('крит'))
        score += 50;
    if (task.priority?.toLowerCase().includes('выс'))
        score += 30;
    if (task.updatedAt)
        score += 5;
    return score;
}
function buildAssigneeCandidates(login) {
    const normalized = login.trim();
    const noAtPrefix = normalized.replace(/^@/, '');
    const localPart = noAtPrefix.includes('@') ? noAtPrefix.split('@')[0] : noAtPrefix;
    return Array.from(new Set([
        normalized,
        noAtPrefix,
        `@${noAtPrefix}`,
        localPart
    ].filter(Boolean)));
}
async function fetchAllIssuesByAssignee(trackerClient, assignee, fields) {
    const issuesById = new Map();
    const perPage = 100;
    let page = 1;
    let totalPages = 1;
    do {
        const result = await trackerClient.searchIssues({
            filter: {
                assignee
            },
            order: '-updatedAt'
        }, {
            fields,
            perPage,
            page
        });
        for (const issue of result.issues) {
            issuesById.set(issue.id, issue);
        }
        totalPages = Math.max(result.pagination.totalPages || 1, 1);
        page += 1;
    } while (page <= totalPages);
    return Array.from(issuesById.values());
}
class WorkdayService {
    trackerClient;
    authorization;
    loadOptions;
    statusesCache = null;
    statusesInFlight;
    cache;
    constructor(trackerClient, authorization, loadOptions = env_1.env.workday) {
        this.trackerClient = trackerClient;
        this.authorization = authorization;
        this.loadOptions = loadOptions;
        if (!Number.isInteger(loadOptions.loadTimeoutMs) || loadOptions.loadTimeoutMs < 1 || loadOptions.loadTimeoutMs > 120000) {
            throw new Error('Invalid My day timeout');
        }
        this.cache = new expiring_cache_1.ExpiringCache(loadOptions.cacheTtlMs, loadOptions.cacheMaxEntries, loadOptions.maxPending);
    }
    async getStatuses() {
        const now = Date.now();
        if (this.statusesCache && this.statusesCache.expiresAt > now) {
            return this.statusesCache.value;
        }
        if (!this.statusesInFlight) {
            this.statusesInFlight = Promise.resolve().then(() => this.trackerClient.getStatuses()).then((statuses) => {
                this.statusesCache = { value: statuses, expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
                return statuses;
            }).finally(() => { this.statusesInFlight = undefined; });
        }
        return this.statusesInFlight;
    }
    async getMyDayByLogin(login, userId, options = {}) {
        // Only the explicitly simplified interactive mode is cached. Never serve it to ACL-aware callers.
        if (!options.skipIssueAuthorization || !options.assigneeLogin || !userId) {
            return this.loadMyDayByLogin(login, userId, options);
        }
        const key = JSON.stringify([userId, login.trim().toLowerCase(), options.assigneeLogin]);
        const observed = { source: 'fresh' };
        const startedAt = performance.now();
        try {
            const summary = await this.cache.get(key, () => (0, tracker_load_1.withTrackerDeadline)(this.loadOptions.loadTimeoutMs, () => this.loadMyDayByLogin(login, userId, options)), (value) => { observed.source = value; (0, request_metrics_1.dataSource)(value); });
            // Keep cache and concurrent callers isolated from downstream mutation.
            return structuredClone(summary);
        }
        catch (error) {
            if (error instanceof expiring_cache_1.CacheBusyError)
                throw new tracker_load_1.TrackerLoadError('MY_DAY_BUSY');
            throw error;
        }
        finally {
            if (observed.source === 'shared')
                (0, request_metrics_1.dataSource)(observed.source, performance.now() - startedAt);
        }
    }
    async loadMyDayByLogin(login, userId, options) {
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
        const [statuses, assigneeCandidates] = await Promise.all([
            this.getStatuses(),
            Promise.resolve(options.assigneeLogin ? [options.assigneeLogin] : buildAssigneeCandidates(login))
        ]);
        const terminalStatuses = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
        const doneStatusIds = new Set(terminalStatuses.map((status) => String(status.id)));
        const doneStatusKeys = new Set(terminalStatuses.filter((status) => status.key).map((status) => String(status.key)));
        let matchedAssigneeCandidate;
        let assignedIssues = [];
        let bestScore = -1;
        for (const candidate of assigneeCandidates) {
            const assignedToUser = (await fetchAllIssuesByAssignee(this.trackerClient, candidate, fields))
                .filter((issue) => issue.assignee?.id === userId);
            // MVP demo: the interactive "My day" skips per-issue ACL checks, but never the
            // exact assignee ID check. Digest and other callers retain authorization.
            const issues = options.skipIssueAuthorization
                ? assignedToUser
                : await this.authorization.filterReadableIssues(userId, assignedToUser);
            const activeIssuesForCandidate = issues.filter((issue) => !isDone(issue, doneStatusIds, doneStatusKeys));
            const score = activeIssuesForCandidate.length * 100000 + issues.length;
            if (score > bestScore) {
                bestScore = score;
                matchedAssigneeCandidate = issues.length > 0 ? candidate : matchedAssigneeCandidate;
                assignedIssues = issues;
            }
        }
        const activeIssues = assignedIssues.filter((issue) => !isDone(issue, doneStatusIds, doneStatusKeys));
        const tasks = activeIssues.map((issue) => mapTask(issue, doneStatusIds, doneStatusKeys));
        const overdueCount = tasks.filter((task) => task.overdue).length;
        const recentlyUpdatedCount = activeIssues.filter((issue) => isRecentlyUpdated(issue)).length;
        const topTasks = tasks
            .slice()
            .sort((a, b) => scoreTask(b) - scoreTask(a))
            .slice(0, 5);
        return {
            login,
            assigneeCandidates,
            matchedAssigneeCandidate,
            terminalStatusNames: terminalStatuses.map((status) => status.name || status.key || String(status.id)).filter(Boolean),
            totalAssigned: assignedIssues.length,
            activeAssigned: activeIssues.length,
            overdueCount,
            recentlyUpdatedCount,
            dataLoadedAt: new Date().toISOString(),
            topTasks
        };
    }
}
exports.WorkdayService = WorkdayService;
