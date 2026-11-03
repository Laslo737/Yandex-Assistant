import { env } from '../../../config/env';
import { CacheBusyError, ExpiringCache, CacheSource } from '../../../shared/utils/expiring-cache';
import { dataSource } from '../../analytics/request-metrics';
import { TrackerLoadError, withTrackerDeadline } from '../../../integrations/yandex-tracker/tracker-load';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { fetchActiveIssuesByAssignee, ISSUE_AUTH_FIELDS } from '../../../integrations/yandex-tracker/active-issues';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { TrackerIssue, TrackerStatus } from '../../../integrations/yandex-tracker/tracker.types';

export interface UserDayTaskItem {
  key: string;
  summary?: string;
  status?: string;
  queue?: string;
  priority?: string;
  updatedAt?: string;
  deadline?: string;
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
  recentlyUpdatedCount: number;
  topTasks: UserDayTaskItem[];
  dataLoadedAt?: string;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDone(issue: TrackerIssue, doneStatusIds: Set<string>, doneStatusKeys: Set<string>): boolean {
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
    overdue: isOverdue(issue, doneStatusIds, doneStatusKeys)
  };
}

function scoreTask(task: UserDayTaskItem): number {
  let score = 0;
  if (task.overdue) score += 100;
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

export class WorkdayService {
  private statusesCache: { expiresAt: number; value: TrackerStatus[] } | null = null;
  private statusesInFlight?: Promise<TrackerStatus[]>;
  private readonly cache: ExpiringCache<UserDaySummary>;

  constructor(private readonly trackerClient: TrackerApiClient, private readonly authorization: IssueAuthorizationService,
    private readonly loadOptions = env.workday) {
    if (!Number.isInteger(loadOptions.loadTimeoutMs) || loadOptions.loadTimeoutMs < 1 || loadOptions.loadTimeoutMs > 120000) {
      throw new Error('Invalid My day timeout');
    }
    this.cache = new ExpiringCache(loadOptions.cacheTtlMs, loadOptions.cacheMaxEntries, loadOptions.maxPending);
  }

  async getStatuses(): Promise<TrackerStatus[]> {
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

  async getMyDayByLogin(
    login: string,
    userId: string,
    options: { skipIssueAuthorization?: boolean; assigneeLogin?: string } = {}
  ): Promise<UserDaySummary> {
    // Only the explicitly simplified interactive mode is cached. Never serve it to ACL-aware callers.
    if (!options.skipIssueAuthorization || !options.assigneeLogin || !userId) {
      return this.loadMyDayByLogin(login, userId, options);
    }
    const key = JSON.stringify([userId, login.trim().toLowerCase(), options.assigneeLogin]);
    const observed = { source: 'fresh' as CacheSource };
    const startedAt = performance.now();
    try {
      const summary = await this.cache.get(key, () => withTrackerDeadline(this.loadOptions.loadTimeoutMs,
        () => this.loadMyDayByLogin(login, userId, options)), (value) => { observed.source = value; dataSource(value); });
      // Keep cache and concurrent callers isolated from downstream mutation.
      return structuredClone(summary);
    } catch (error) {
      if (error instanceof CacheBusyError) throw new TrackerLoadError('MY_DAY_BUSY');
      throw error;
    } finally {
      if (observed.source === 'shared') dataSource(observed.source, performance.now() - startedAt);
    }
  }

  private async loadMyDayByLogin(
    login: string,
    userId: string,
    options: { skipIssueAuthorization?: boolean; assigneeLogin?: string }
  ): Promise<UserDaySummary> {
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
    const terminalStatusNames = terminalStatuses.map((status) => status.name || status.key || String(status.id)).filter(Boolean);
    if (!options.skipIssueAuthorization) fields.push(...ISSUE_AUTH_FIELDS);
    const doneStatusIds = new Set(terminalStatuses.map((status) => String(status.id)));
    const doneStatusKeys = new Set(
      terminalStatuses.filter((status) => status.key).map((status) => String(status.key))
    );

    let matchedAssigneeCandidate: string | undefined;
    let assignedIssues: TrackerIssue[] = [];
    let bestScore = -1;

    for (const candidate of assigneeCandidates) {
      const assignedToUser = (await fetchActiveIssuesByAssignee(this.trackerClient, candidate, terminalStatusNames, fields))
        .filter((issue) => issue.assignee?.id === userId && !isDone(issue, doneStatusIds, doneStatusKeys));
      // MVP demo: the interactive "My day" skips per-issue ACL checks, but never the
      // exact assignee ID check. Digest and other callers retain authorization.
      const issues = options.skipIssueAuthorization
        ? assignedToUser
        : await this.authorization.filterReadableSearchIssues(userId, assignedToUser);
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
      terminalStatusNames,
      // Legacy field retained for internal callers; operational reports contain active tasks only.
      totalAssigned: activeIssues.length,
      activeAssigned: activeIssues.length,
      overdueCount,
      recentlyUpdatedCount,
      dataLoadedAt: new Date().toISOString(),
      topTasks
    };
  }
}
