import { env } from '../../config/env';

const TRACKER_ISSUE_KEY_REGEX = /\b([A-Z][A-Z0-9_]+-\d+)\b/i;

export function buildTrackerIssueUrl(issueKey: string): string {
  const normalizedBase = env.tracker.webBaseUrl.replace(/\/+$/, '');
  return `${normalizedBase}/${encodeURIComponent(issueKey)}`;
}

export function formatTrackerIssueLabel(issueKey: string): string {
  return `[${issueKey}](${buildTrackerIssueUrl(issueKey)})`;
}

export function extractTrackerIssueKey(value: string): string | undefined {
  const match = value.match(TRACKER_ISSUE_KEY_REGEX);
  if (!match) return undefined;
  return match[1]?.toUpperCase();
}
