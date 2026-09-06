export interface NormalizedTrackerUser {
  trackerUserId: string;
  display?: string;
  cloudUid?: string;
  passportUid?: number;
}

export interface NormalizedTrackerIssue {
  trackerIssueId: string;
  key: string;
  summary?: string;
  description?: string;
  queueKey?: string;
  queueName?: string;
  statusKey?: string;
  statusName?: string;
  previousStatusKey?: string;
  previousStatusName?: string;
  statusTypeKey?: string;
  priorityKey?: string;
  priorityName?: string;
  assigneeId?: string;
  assigneeDisplay?: string;
  createdById?: string;
  updatedById?: string;
  createdAt?: string;
  updatedAt?: string;
  lastCommentUpdatedAt?: string;
  statusStartTime?: string;
  followerIds: string[];
  boardIds: Array<string | number>;
  tags: string[];
  rawCustomFields: Record<string, unknown>;
}

export interface NormalizedTrackerComment {
  trackerCommentId: number;
  trackerCommentLongId?: string;
  trackerIssueId: string;
  trackerIssueKey: string;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
  createdById?: string;
  updatedById?: string;
  summoneeIds: string[];
  transport?: string;
  type?: string;
}

export interface NormalizedTrackerHistoryEvent {
  trackerHistoryId: string;
  trackerIssueId: string;
  trackerIssueKey: string;
  type?: string;
  transport?: string;
  updatedAt?: string;
  updatedById?: string;
  changedFieldIds: string[];
  addedCommentIds: Array<string | number>;
  executedTriggerIds: Array<string | number>;
  statusFromKey?: string;
  statusToKey?: string;
}

export interface NormalizedTrackerIssueBundle {
  issue: NormalizedTrackerIssue;
  comments: NormalizedTrackerComment[];
  history: NormalizedTrackerHistoryEvent[];
  users: NormalizedTrackerUser[];
  meta: {
    fetchedAt: string;
    commentsCount: number;
    historyCount: number;
  };
}
