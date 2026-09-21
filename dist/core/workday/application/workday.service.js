"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkdayService = void 0;
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
    statusesCache = null;
    constructor(trackerClient) {
        this.trackerClient = trackerClient;
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
    async getMyDayByLogin(login) {
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
            Promise.resolve(buildAssigneeCandidates(login))
        ]);
        const terminalStatuses = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
        const doneStatusIds = new Set(terminalStatuses.map((status) => String(status.id)));
        const doneStatusKeys = new Set(terminalStatuses.filter((status) => status.key).map((status) => String(status.key)));
        let matchedAssigneeCandidate;
        let assignedIssues = [];
        let bestScore = -1;
        for (const candidate of assigneeCandidates) {
            const issues = await fetchAllIssuesByAssignee(this.trackerClient, candidate, fields);
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
            topTasks
        };
    }
}
exports.WorkdayService = WorkdayService;
