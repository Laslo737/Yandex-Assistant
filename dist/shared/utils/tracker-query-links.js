"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMyAllIssuesUrl = buildMyAllIssuesUrl;
exports.buildMyActiveIssuesUrl = buildMyActiveIssuesUrl;
exports.buildMyClosedIssuesUrl = buildMyClosedIssuesUrl;
exports.buildMyOverdueIssuesUrl = buildMyOverdueIssuesUrl;
exports.buildMyWaitingForReplyUrl = buildMyWaitingForReplyUrl;
exports.buildMyRecentlyUpdatedIssuesUrl = buildMyRecentlyUpdatedIssuesUrl;
exports.buildTeamAllIssuesUrl = buildTeamAllIssuesUrl;
exports.buildTeamActiveIssuesUrl = buildTeamActiveIssuesUrl;
exports.buildTeamOverdueIssuesUrl = buildTeamOverdueIssuesUrl;
exports.buildTeamStaleIssuesUrl = buildTeamStaleIssuesUrl;
exports.buildTeamWaitingForReplyUrl = buildTeamWaitingForReplyUrl;
exports.buildTeamLongInProgressIssuesUrl = buildTeamLongInProgressIssuesUrl;
exports.buildTeamOldBacklogIssuesUrl = buildTeamOldBacklogIssuesUrl;
exports.formatMetricLink = formatMetricLink;
const env_1 = require("../../config/env");
const short_link_store_1 = require("./short-link-store");
function normalizeLogin(login) {
    return login.trim().replace(/^@/, '');
}
function exactLogin(login) {
    const normalized = normalizeLogin(login);
    return normalized.endsWith('@') ? normalized : `${normalized}@`;
}
function escapeQueryValue(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function uniqueStatusNames(statuses) {
    return Array.from(new Set(statuses.map((item) => item.trim()).filter(Boolean)));
}
function excludeStatusesClause(statuses) {
    return uniqueStatusNames(statuses)
        .map((status) => `Status: !"${escapeQueryValue(status)}"`)
        .join(' ');
}
function includeStatusesClause(statuses) {
    const items = uniqueStatusNames(statuses);
    if (!items.length)
        return '';
    return `Status: ${items.map((status) => `"${escapeQueryValue(status)}"`).join(', ')}`;
}
function joinClauses(parts) {
    return parts.filter(Boolean).join(' ');
}
function strictEncode(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
function buildIssuesUrl(query, order = 'updated DESC') {
    const baseUrl = env_1.env.tracker.webBaseUrl.replace(/\/+$/, '');
    const encodedOrder = strictEncode(order.replace(/\s+/g, '+'));
    const encodedQuery = strictEncode(query);
    return `${baseUrl}/issues?_newUi=1&_o=${encodedOrder}&_q=${encodedQuery}`;
}
function buildMyAllIssuesUrl(login) {
    return buildIssuesUrl(`Assignee: ${exactLogin(login)}`);
}
function buildMyActiveIssuesUrl(login, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        `Assignee: ${exactLogin(login)}`,
        excludeStatusesClause(terminalStatuses)
    ]));
}
function buildMyClosedIssuesUrl(login, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        `Assignee: ${exactLogin(login)}`,
        includeStatusesClause(terminalStatuses)
    ]));
}
function buildMyOverdueIssuesUrl(login, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        `Assignee: ${exactLogin(login)}`,
        excludeStatusesClause(terminalStatuses),
        'Deadline: < today()'
    ]));
}
function buildMyWaitingForReplyUrl(login, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        `Assignee: ${exactLogin(login)}`,
        excludeStatusesClause(terminalStatuses),
        '"Pending Reply From": notEmpty()'
    ]));
}
function buildMyRecentlyUpdatedIssuesUrl(login, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        `Assignee: ${exactLogin(login)}`,
        excludeStatusesClause(terminalStatuses),
        'Updated: > now()-24h'
    ]));
}
function queueClause(queueKeys) {
    const unique = Array.from(new Set(queueKeys.map((item) => item.trim()).filter(Boolean)));
    return unique.length === 1
        ? `Queue: ${escapeQueryValue(unique[0])}`
        : `Queue: ${unique.map((item) => `"${escapeQueryValue(item)}"`).join(', ')}`;
}
function buildTeamAllIssuesUrl(queueKeys) {
    return buildIssuesUrl(`${queueClause(queueKeys)}`);
}
function buildTeamActiveIssuesUrl(queueKeys, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses)
    ]));
}
function buildTeamOverdueIssuesUrl(queueKeys, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses),
        'Deadline: < today()'
    ]));
}
function buildTeamStaleIssuesUrl(queueKeys, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses),
        'Updated: < now()-7d'
    ]));
}
function buildTeamWaitingForReplyUrl(queueKeys, terminalStatuses) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses),
        '"Pending Reply From": notEmpty()'
    ]));
}
function buildTeamLongInProgressIssuesUrl(queueKeys, terminalStatuses, days) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses),
        `Updated: < now()-${days}d`
    ]));
}
function buildTeamOldBacklogIssuesUrl(queueKeys, terminalStatuses, days) {
    return buildIssuesUrl(joinClauses([
        queueClause(queueKeys),
        excludeStatusesClause(terminalStatuses),
        `Updated: < now()-${days}d`
    ]));
}
function formatMetricLink(label, url) {
    return `[${label}](${(0, short_link_store_1.buildShortRedirectUrl)(url)})`;
}
