import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { TrackerIssue, TrackerStatus, TrackerUser } from '../../../integrations/yandex-tracker/tracker.types';

export interface UserDayTaskItem {
  key: string;
  summary?: string;
  status?: string;
  queue?: string;
  priority?: string;
  updatedAt?: string;
  deadline?: string;
  waitingForUser: boolean;
  overdue: boolean;
}

export interface UserDaySummary {
  login: string;
  assigneeCandidates: string[];
  matchedAssigneeCandidate?: string;
  terminalStatusNames: string[];
  totalAssigned: number;
  activeAssigned: number;
  overdueCount: number;
  waitingForReplyCount: number;
  recentlyUpdatedCount: number;
  topTasks: UserDayTaskItem[];
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDone(issue: TrackerIssue, doneStatusIds: Set<string>, doneStatusKeys: Set<string>): boolean {
  const statusTypeId = issue.statusType?.id;
  const statusTypeKey = issue.statusType?.key;
  const statusId = issue.status?.id;
  const statusKey = issue.status?.key;

  if (statusTypeId === 'done' || statusTypeKey === 'done') return true;
  if (statusTypeId === 'cancelled' || statusTypeKey === 'cancelled') return true;
  if (statusId !== undefined && doneStatusIds.has(String(statusId))) return true;
  if (statusKey && doneStatusKeys.has(statusKey)) return true;
  return false;
}

function getPendingReplyUsers(issue: TrackerIssue): TrackerUser[] {
  const value = issue.pendingReplyFrom;
  return Array.isArray(value) ? (value as TrackerUser[]) : [];
}

function isWaitingForUser(issue: TrackerIssue): boolean {
  return getPendingReplyUsers(issue).length > 0;
}

function isRecentlyUpdated(issue: TrackerIssue): boolean {
  const updated = toDate(issue.updatedAt);
  if (!updated) return false;
  const diffHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

function getDeadline(issue: TrackerIssue): string | undefined {
  const deadline = issue.deadline;
  return typeof deadline === 'string' ? deadline : undefined;
}

function isOverdue(issue: TrackerIssue, doneStatusIds: Set<string>, doneStatusKeys: Set<string>): boolean {
  const deadline = getDeadline(issue);
  if (!deadline) return false;
  const dueDate = new Date(`${deadline}T23:59:59`);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < Date.now() && !isDone(issue, doneStatusIds, doneStatusKeys);
}

function mapTask(issue: TrackerIssue, doneStatusIds: Set<string>, doneStatusKeys: Set<string>): UserDayTaskItem {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status?.display,
    queue: issue.queue?.display,
    priority: issue.priority?.display,
    updatedAt: issue.updatedAt,
    deadline: getDeadline(issue),
    waitingForUser: isWaitingForUser(issue),
    overdue: isOverdue(issue, doneStatusIds, doneStatusKeys)
  };
}

function scoreTask(task: UserDayTaskItem): number {
  let score = 0;
  if (task.overdue) score += 100;
  if (task.waitingForUser) score += 70;
  if (task.priority?.toLowerCase().includes('крит')) score += 50;
  if (task.priority?.toLowerCase().includes('выс')) score += 30;
  if (task.updatedAt) score += 5;
  return score;
}

function buildAssigneeCandidates(login: string): string[] {
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

async function fetchAllIssuesByAssignee(
  trackerClient: TrackerApiClient,
  assignee: string,
  fields: string[]
): Promise<TrackerIssue[]> {
  const issuesById = new Map<string, TrackerIssue>();
  const perPage = 100;
  let page = 1;
  let totalPages = 1;

  do {
    const result = await trackerClient.searchIssues(
      {
        filter: {
          assignee
        },
        order: '-updatedAt'
      },
      {
        fields,
        perPage,
        page
      }
    );

    for (const issue of result.issues) {
      issuesById.set(issue.id, issue);
    }

    totalPages = Math.max(result.pagination.totalPages || 1, 1);
    page += 1;
  } while (page <= totalPages);

  return Array.from(issuesById.values());
}

export class WorkdayService {
  private statusesCache: { expiresAt: number; value: TrackerStatus[] } | null = null;

  constructor(private readonly trackerClient: TrackerApiClient) {}

  private async getStatuses(): Promise<TrackerStatus[]> {
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

  async getMyDayByLogin(login: string): Promise<UserDaySummary> {
    const fields = [
      'summary',
      'status',
      'statusType',
      'priority',
      'assignee',
      'updatedAt',
      'deadline',
      'pendingReplyFrom',
      'queue'
    ];

    const [statuses, assigneeCandidates] = await Promise.all([
      this.getStatuses(),
      Promise.resolve(buildAssigneeCandidates(login))
    ]);

    const terminalStatuses = statuses.filter((status) => status.type === 'done' || status.type === 'cancelled');
    const doneStatusIds = new Set(terminalStatuses.map((status) => String(status.id)));
    const doneStatusKeys = new Set(
      terminalStatuses.filter((status) => status.key).map((status) => String(status.key))
    );

    let matchedAssigneeCandidate: string | undefined;
    let assignedIssues: TrackerIssue[] = [];
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
    const waitingForReplyCount = tasks.filter((task) => task.waitingForUser).length;
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
      waitingForReplyCount,
      recentlyUpdatedCount,
      topTasks
    };
  }
}
