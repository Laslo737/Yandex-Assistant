export interface TrackerUser {
  self?: string;
  id: string;
  display?: string;
  cloudUid?: string;
  passportUid?: number;
}

export interface TrackerDetailedUser {
  self?: string;
  uid?: number;
  id?: string;
  login?: string;
  trackerUid?: number;
  passportUid?: number;
  cloudUid?: string;
  firstName?: string;
  lastName?: string;
  display?: string;
  email?: string;
  external?: boolean;
  hasLicense?: boolean;
  dismissed?: boolean;
  useNewFilters?: boolean;
  disableNotifications?: boolean;
  firstLoginDate?: string;
  lastLoginDate?: string;
  welcomeMailSent?: boolean;
  groups?: Array<{
    self?: string;
    id: string;
    display?: string;
  }>;
}

export interface TrackerReference {
  self?: string;
  id: string | number;
  key?: string;
  display?: string;
}

export interface TrackerFlexibleReference {
  self?: string;
  id?: string | number;
  key?: string;
  display?: string;
  [key: string]: unknown;
}

export interface TrackerProjectInfo {
  primary?: TrackerReference;
  secondary?: TrackerReference[];
}

export interface TrackerIssue {
  self?: string;
  id: string;
  key: string;
  version?: number;
  summary?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  lastCommentUpdatedAt?: string;
  statusStartTime?: string;
  start?: string;
  unique?: string;
  messengerId?: string;
  questionForPartner?: string | boolean;
  commentWithExternalMessageCount?: number;
  commentWithoutExternalMessageCount?: number;
  aliases?: string[];
  tags?: string[];
  favorite?: boolean;
  votes?: number;
  boards?: Array<{ id: string | number }>;
  parent?: TrackerReference;
  updatedBy?: TrackerUser;
  createdBy?: TrackerUser;
  assignee?: TrackerUser;
  previousStatusLastAssignee?: TrackerUser;
  followers?: TrackerUser[];
  sprint?: TrackerReference[];
  type?: TrackerReference;
  priority?: TrackerReference;
  queue?: TrackerReference;
  status?: TrackerReference;
  previousStatus?: TrackerReference;
  statusType?: TrackerReference;
  project?: TrackerProjectInfo;
  sla?: TrackerIssueSla[];
  [key: string]: unknown;
}

export interface TrackerIssueSla {
  id: string;
  settingsId?: number;
  clockStatus?: string;
  violationStatus?: string;
  warnThreshold?: number | null;
  failedThreshold?: number | null;
  warnAt?: string | null;
  failAt?: string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  stoppedAt?: string | null;
  pausedDuration?: number;
  toFailTimeWorkDuration?: number | null;
  spent?: number | null;
  previousSLAs?: TrackerIssueSla[];
  startShiftedByPause?: string | null;
  failIn?: number | null;
}

export interface TrackerTransition {
  id: string;
  self?: string;
  display?: string;
  to?: TrackerReference;
}

export interface TrackerQueue {
  self?: string;
  id: string;
  key: string;
  version?: number;
  name?: string;
  description?: string;
  lead?: TrackerUser;
  assignAuto?: boolean;
  defaultType?: TrackerReference;
  defaultPriority?: TrackerReference;
  teamUsers?: TrackerUser[];
  issueTypes?: TrackerReference[];
  versions?: TrackerReference[];
}

export interface TrackerStatus {
  self?: string;
  id: string | number;
  version?: number;
  key?: string;
  name?: string;
  description?: string;
  order?: number;
  type?: string;
}

export interface TrackerBoardColumn {
  self?: string;
  id: string | number;
  display?: string;
}

export interface TrackerBoard {
  self?: string;
  id: string | number;
  version?: number;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: TrackerUser;
  columns?: TrackerBoardColumn[];
}

export interface TrackerIssueCountResponse {
  count?: number;
}

export interface TrackerReportResponse {
  self?: string;
  id: string;
  version?: number;
  shortId?: number;
  entityType?: 'report';
  createdBy?: TrackerUser;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrackerCountIssuesPayload {
  filter?: Record<string, unknown>;
  query?: string;
}

export interface TrackerSearchIssuesPayload {
  queue?: string;
  keys?: string | string[];
  filter?: Record<string, unknown>;
  filterId?: number;
  query?: string;
  order?: string;
}

export interface TrackerSearchIssuesOptions {
  fields?: string[];
  expand?: Array<'transitions' | 'attachments' | 'comments'>;
  perPage?: number;
  page?: number;
  id?: string | number;
  scrollType?: 'sorted' | 'unsorted';
  perScroll?: number;
  scrollTTLMillis?: number;
  scrollId?: string;
}

export interface TrackerPaginationMeta {
  totalPages?: number;
  totalCount?: number;
  nextLink?: string;
  scrollId?: string;
  scrollToken?: string;
}

export interface TrackerSearchIssuesResult {
  issues: TrackerIssue[];
  pagination: TrackerPaginationMeta;
}

export interface TrackerCommentAttachment {
  self?: string;
  id: string | number;
  display?: string;
}

export interface TrackerComment {
  self?: string;
  id: number;
  longId?: string;
  text?: string;
  textHtml?: string;
  attachments?: TrackerCommentAttachment[];
  createdBy?: TrackerUser;
  updatedBy?: TrackerUser;
  summonees?: TrackerUser[];
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  type?: 'standard' | 'incoming' | 'outcoming' | string;
  transport?: 'internal' | 'email' | string;
}

export type TrackerChangelogFieldValue =
  | null
  | string
  | number
  | boolean
  | TrackerFlexibleReference
  | TrackerFlexibleReference[];

export interface TrackerChangelogFieldChange {
  field: TrackerReference;
  from: TrackerChangelogFieldValue;
  to: TrackerChangelogFieldValue;
}

export interface TrackerChangelogCommentRef {
  self?: string;
  id: string | number;
  objectId?: string;
  display?: string;
}

export interface TrackerChangelogComments {
  added?: TrackerChangelogCommentRef[];
}

export interface TrackerChangelogTriggerExecution {
  trigger: TrackerReference;
  success?: boolean;
  message?: string;
}

export interface TrackerChangelogEntry {
  id: string;
  self?: string;
  issue?: TrackerReference;
  updatedAt?: string;
  updatedBy?: TrackerUser;
  type?: string;
  transport?: 'front' | 'back' | 'apiV2' | 'service-api' | string;
  fields?: TrackerChangelogFieldChange[];
  comments?: TrackerChangelogComments;
  executedTriggers?: TrackerChangelogTriggerExecution[];
}

export interface TrackerGetIssueCommentsOptions {
  expand?: Array<'attachments' | 'html' | 'all'>;
  perPage?: number;
  page?: number;
  id?: string | number;
}

export interface TrackerGetIssueCommentsResult {
  comments: TrackerComment[];
  pagination: TrackerPaginationMeta;
}

export interface TrackerGetIssueChangelogOptions {
  perPage?: number;
  page?: number;
  id?: string;
  field?: string;
  type?: string;
}

export interface TrackerGetIssueChangelogResult {
  entries: TrackerChangelogEntry[];
  pagination: TrackerPaginationMeta;
}

export interface TrackerCreateReportPayload {
  fields: {
    summary: string;
    parameters: {
      type: 'issueFilterExport';
      format: 'xlsx' | 'csv';
      filter: {
        query?: string;
        filterId?: number;
        filter?: Record<string, unknown>;
        sorts?: Array<{
          orderBy: string;
          orderAsc: boolean;
        }>;
      };
      fields: string[];
    };
  };
}
