"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueAuthorizationService = void 0;
exports.evaluateIssueAccess = evaluateIssueAccess;
const env_1 = require("../../../config/env");
function subjects(value, field) {
    if (!value)
        return false;
    const items = value[field];
    if (items === undefined)
        return false;
    if (!Array.isArray(items) || items.some((item) => !item || typeof item.id !== 'string')) {
        throw new Error('Invalid Tracker permissions response');
    }
    return items.length > 0;
}
function hasSubject(value, fields) {
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error('Invalid Tracker permissions response');
    }
    // Validate every field, even when the first one already grants access.
    return fields.map((field) => subjects(value, field)).some(Boolean);
}
function userIds(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((item) => !item || typeof item.id !== 'string' ||
        (typeof item.self === 'string' && !item.self.includes('/users/')))) {
        throw new Error('Invalid Tracker issue participants');
    }
    return value.map((item) => item.id);
}
function evaluateIssueAccess(issue, userId, userPermissions, queuePermissions) {
    if (!issue || !issue.key || !issue.queue?.key || !Array.isArray(issue.components)) {
        return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
    }
    if (issue.components.length)
        return { allowed: false, reason: 'COMPONENT_UNSUPPORTED' };
    if (!userPermissions || userPermissions.user?.id !== userId || !userPermissions.permissions ||
        typeof userPermissions.permissions !== 'object' || Array.isArray(userPermissions.permissions)) {
        return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
    }
    try {
        const permissions = userPermissions.permissions;
        if (hasSubject(permissions.DENY, ['users', 'groups', 'roles'])) {
            return { allowed: false, reason: 'QUEUE_DENY' };
        }
        // Validate all rights before granting: malformed API response must not become ALLOW.
        const read = hasSubject(permissions.READ, ['users', 'groups']);
        const write = hasSubject(permissions.WRITE, ['users', 'groups']);
        if (read)
            return { allowed: true, reason: 'QUEUE_READ' };
        if (write)
            return { allowed: true, reason: 'QUEUE_WRITE' };
        const issueRoles = new Set();
        if (issue.createdBy !== undefined && userIds([issue.createdBy]).includes(userId))
            issueRoles.add('author');
        if (issue.assignee !== undefined && userIds([issue.assignee]).includes(userId))
            issueRoles.add('assignee');
        if (userIds(issue.followers).includes(userId))
            issueRoles.add('follower');
        if (issue.access !== undefined && userIds(issue.access).includes(userId) &&
            issue.access.some((entry) => entry.id === userId && entry.self?.includes('/users/'))) {
            issueRoles.add('access');
        }
        if (!issueRoles.size)
            return { allowed: false, reason: 'NO_PERMISSION' };
        if (!queuePermissions || typeof queuePermissions !== 'object')
            return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
        if (queuePermissions.read !== undefined && (!queuePermissions.read || typeof queuePermissions.read !== 'object') ||
            queuePermissions.write !== undefined && (!queuePermissions.write || typeof queuePermissions.write !== 'object')) {
            return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
        }
        const roles = [...(queuePermissions.read?.roles ?? []), ...(queuePermissions.write?.roles ?? [])];
        if (!Array.isArray(queuePermissions.read?.roles ?? []) || !Array.isArray(queuePermissions.write?.roles ?? []) ||
            roles.some((role) => !role || typeof role.id !== 'string')) {
            return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
        }
        return roles.some((role) => issueRoles.has(role.id))
            ? { allowed: true, reason: 'ISSUE_ROLE' }
            : { allowed: false, reason: 'NO_PERMISSION' };
    }
    catch {
        return { allowed: false, reason: 'AUTH_CHECK_FAILED' };
    }
}
class IssueAuthorizationService {
    tracker;
    constructor(tracker) {
        this.tracker = tracker;
    }
    async filterReadableIssues(userId, issues) {
        const result = [];
        const permissionCache = {
            users: new Map(),
            queues: new Map()
        };
        // Bound concurrency: large queues must not start hundreds of simultaneous API calls.
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(5, issues.length) }, async () => {
            while (cursor < issues.length) {
                const index = cursor++;
                const issue = issues[index];
                const decision = await this.canReadIssue(userId, issue.key, permissionCache);
                if (decision.reason === 'AUTH_CHECK_FAILED')
                    throw new Error('Не удалось проверить доступ ко всем задачам. Попробуйте позже.');
                if (decision.allowed)
                    result[index] = issue;
            }
        }));
        return issues.filter((_, index) => Boolean(result[index]));
    }
    async resolveUserId(login) {
        const messengerLogin = login?.trim().toLowerCase();
        if (!messengerLogin)
            return undefined;
        const domain = env_1.env.yandexMessenger.loginDomain?.trim().toLowerCase().replace(/^@/, '');
        const suffix = domain ? `@${domain}` : '';
        // Never strip an arbitrary email domain: only the explicitly configured organization domain.
        const localLogin = suffix && messengerLogin.endsWith(suffix)
            ? messengerLogin.slice(0, -suffix.length)
            : undefined;
        const candidates = [messengerLogin, ...(localLogin ? [localLogin] : [])];
        for (const candidate of candidates) {
            try {
                const user = await this.tracker.getUser(candidate);
                if (!user.id)
                    continue;
                if (user.email && user.email.trim().toLowerCase() !== messengerLogin)
                    continue;
                const trackerLogin = user.login?.trim().toLowerCase();
                if (trackerLogin && trackerLogin !== messengerLogin && trackerLogin !== localLogin)
                    continue;
                return String(user.id);
            }
            catch {
                // The Tracker API may accept only the short login. Try it only for the configured domain.
            }
        }
        return undefined;
    }
    async canReadIssue(userId, issueKey, cache) {
        const result = (decision, queue) => {
            const access = { ...decision, issueKey, userId, queue };
            console.info('tracker.issue_access', JSON.stringify(access));
            return access;
        };
        if (!userId || !issueKey)
            return result({ allowed: false, reason: 'AUTH_CHECK_FAILED' });
        let issue;
        try {
            issue = await this.tracker.getIssueAuthFields(issueKey);
        }
        catch (error) {
            const status = error.status;
            return result({ allowed: false, reason: status === 401 || status === 403 || status === 404 ? 'SERVICE_UNAVAILABLE' : 'AUTH_CHECK_FAILED' });
        }
        if (!issue?.queue?.key || !Array.isArray(issue.components) || !issue.key || issue.key.toUpperCase() !== issueKey.toUpperCase()) {
            return result({ allowed: false, reason: 'AUTH_CHECK_FAILED' });
        }
        const queue = issue.queue.key;
        if (issue.components.length)
            return result({ allowed: false, reason: 'COMPONENT_UNSUPPORTED' }, queue);
        try {
            if (cache && !cache.users.has(queue)) {
                cache.users.set(queue, this.tracker.getQueueUserPermissions(queue, userId));
            }
            const userPermissions = await (cache?.users.get(queue) ?? this.tracker.getQueueUserPermissions(queue, userId));
            // Only load queue ACL when a matching issue role could be relevant; a second pass after
            // the direct-rights check keeps permission checks cheap without bypassing DENY.
            const direct = evaluateIssueAccess(issue, userId, userPermissions);
            if (direct.reason !== 'AUTH_CHECK_FAILED')
                return result(direct, queue);
            // AUTH_CHECK_FAILED can mean missing role ACL or malformed response. Do not grant on malformed input.
            if (!userPermissions?.permissions || userPermissions.user?.id !== userId)
                return result(direct, queue);
            if (cache && !cache.queues.has(queue)) {
                cache.queues.set(queue, this.tracker.getQueuePermissions(queue));
            }
            const queuePermissions = await (cache?.queues.get(queue) ?? this.tracker.getQueuePermissions(queue));
            return result(evaluateIssueAccess(issue, userId, userPermissions, queuePermissions), queue);
        }
        catch {
            return result({ allowed: false, reason: 'AUTH_CHECK_FAILED' }, queue);
        }
    }
}
exports.IssueAuthorizationService = IssueAuthorizationService;
