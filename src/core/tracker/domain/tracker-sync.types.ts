import {
  TrackerChangelogEntry,
  TrackerComment,
  TrackerIssue
} from '../../../integrations/yandex-tracker/tracker.types';

export interface TrackerIssueSyncBundle {
  issue: TrackerIssue;
  comments: TrackerComment[];
  changelog: TrackerChangelogEntry[];
  fetchedAt: string;
  meta: {
    issueIdOrKey: string;
    commentsCount: number;
    changelogCount: number;
    commentsNextLink?: string;
    changelogNextLink?: string;
  };
}

export interface TrackerSyncEntityScope {
  entity: 'issues' | 'comments' | 'changelog' | 'users' | 'queues' | 'projects';
  requiredForMvp: boolean;
  source: 'tracker-api';
  syncStrategy: 'full' | 'incremental' | 'per-issue-followup';
  notes: string[];
}

export interface TrackerSyncStorageDraft {
  layer: 'raw' | 'normalized' | 'derived';
  entities: string[];
  rationale: string;
}

export interface TrackerSyncModelDraft {
  scope: TrackerSyncEntityScope[];
  storage: TrackerSyncStorageDraft[];
  incrementalCursorDraft: string[];
}
