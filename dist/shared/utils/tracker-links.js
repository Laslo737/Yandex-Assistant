"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackerIssueUrl = buildTrackerIssueUrl;
exports.formatTrackerIssueLabel = formatTrackerIssueLabel;
exports.extractTrackerIssueKey = extractTrackerIssueKey;
const env_1 = require("../../config/env");
const TRACKER_ISSUE_KEY_REGEX = /\b([A-Z][A-Z0-9_]+-\d+)\b/i;
function buildTrackerIssueUrl(issueKey) {
    const normalizedBase = env_1.env.tracker.webBaseUrl.replace(/\/+$/, '');
    return `${normalizedBase}/${encodeURIComponent(issueKey)}`;
}
function formatTrackerIssueLabel(issueKey) {
    return `[${issueKey}](${buildTrackerIssueUrl(issueKey)})`;
}
function extractTrackerIssueKey(value) {
    const match = value.match(TRACKER_ISSUE_KEY_REGEX);
    if (!match)
        return undefined;
    return match[1]?.toUpperCase();
}
