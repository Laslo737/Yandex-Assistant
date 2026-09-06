import {
  TrackerChangelogEntry,
  TrackerComment,
  TrackerFlexibleReference,
  TrackerIssue,
  TrackerUser
} from '../../../integrations/yandex-tracker/tracker.types';
import { TrackerIssueSyncBundle } from '../domain/tracker-sync.types';
import {
  NormalizedTrackerComment,
  NormalizedTrackerHistoryEvent,
  NormalizedTrackerIssue,
  NormalizedTrackerIssueBundle,
  NormalizedTrackerUser
} from '../domain/tracker-normalized.types';

function collectUser(map: Map<string, NormalizedTrackerUser>, user?: TrackerUser | null) {
  if (!user?.id) return;

  map.set(user.id, {
    trackerUserId: user.id,
    display: user.display,
    cloudUid: user.cloudUid,
    passportUid: user.passportUid
  });
}

function toReferenceKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const typed = value as TrackerFlexibleReference;
  return typed.key;
}

function extractCustomFields(issue: TrackerIssue): Record<string, unknown> {
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

  return Object.fromEntries(
    Object.entries(issue).filter(([key]) => !knownKeys.has(key))
  );
}

export function normalizeTrackerIssueBundle(bundle: TrackerIssueSyncBundle): NormalizedTrackerIssueBundle {
  const users = new Map<string, NormalizedTrackerUser>();
  const issue = bundle.issue;

  collectUser(users, issue.assignee);
  collectUser(users, issue.createdBy);
  collectUser(users, issue.updatedBy);
  collectUser(users, issue.previousStatusLastAssignee);
  issue.followers?.forEach((user) => collectUser(users, user));

  const normalizedIssue: NormalizedTrackerIssue = {
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

  const comments: NormalizedTrackerComment[] = bundle.comments.map((comment: TrackerComment) => {
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

  const history: NormalizedTrackerHistoryEvent[] = bundle.changelog.map((entry: TrackerChangelogEntry) => {
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
