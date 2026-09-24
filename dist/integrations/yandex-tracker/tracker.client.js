"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerApiClient = void 0;
const env_1 = require("../../config/env");
const http_1 = require("../../shared/utils/http");
class TrackerApiClient {
    config = env_1.env.tracker;
    isConfigured() {
        return Boolean(this.config.oauthToken && (this.config.orgId || this.config.cloudOrgId));
    }
    headers(includeJson = false) {
        if (!this.config.oauthToken) {
            throw new Error('YANDEX_TRACKER_OAUTH_TOKEN is not configured');
        }
        const organizationHeaderName = this.config.orgId ? 'X-Org-ID' : 'X-Cloud-Org-ID';
        const organizationHeaderValue = this.config.orgId || this.config.cloudOrgId;
        if (!organizationHeaderValue) {
            throw new Error('YANDEX_TRACKER_ORG_ID or YANDEX_TRACKER_CLOUD_ORG_ID is not configured');
        }
        return {
            ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `OAuth ${this.config.oauthToken}`,
            [organizationHeaderName]: organizationHeaderValue
        };
    }
    buildUrl(path, query) {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = new URL(`/v3${normalizedPath}`, this.config.apiBaseUrl);
        if (query)
            url.search = query.toString();
        return url.toString();
    }
    async getQueues() {
        return (0, http_1.fetchJson)(this.buildUrl('/queues/'), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getBoards() {
        return (0, http_1.fetchJson)(this.buildUrl('/boards'), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getUser(loginOrId, expand) {
        const normalized = /^\d+$/.test(loginOrId) ? `login:${loginOrId}` : loginOrId;
        const query = new URLSearchParams();
        if (expand?.length)
            query.set('expand', expand.join(','));
        return (0, http_1.fetchJson)(this.buildUrl(`/users/${encodeURIComponent(normalized)}`, query), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getStatuses() {
        const perPage = 100;
        const statusesById = new Map();
        let page = 1;
        let totalPages = 1;
        do {
            const query = new URLSearchParams({
                perPage: String(perPage),
                page: String(page)
            });
            const response = await (0, http_1.fetchJsonWithMeta)(this.buildUrl('/statuses', query), {
                method: 'GET',
                headers: this.headers()
            });
            for (const status of response.data) {
                statusesById.set(String(status.id), status);
            }
            totalPages = Math.max(response.headers.get('x-total-pages') ? Number(response.headers.get('x-total-pages')) : 1, 1);
            page += 1;
        } while (page <= totalPages);
        return Array.from(statusesById.values());
    }
    async getBoardsPaginated(perPage = 20, id) {
        const query = new URLSearchParams({ perPage: String(perPage) });
        if (id !== undefined)
            query.set('id', String(id));
        return (0, http_1.fetchJson)(this.buildUrl('/boards/_paginate', query), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getIssue(issueIdOrKey, fields, expand) {
        const query = new URLSearchParams();
        if (fields?.length)
            query.set('fields', fields.join(','));
        if (expand?.length)
            query.set('expand', expand.join(','));
        return (0, http_1.fetchJson)(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}`, query), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getIssueAuthFields(issueIdOrKey) {
        return this.getIssue(issueIdOrKey, ['key', 'queue', 'createdBy', 'assignee', 'followers', 'access', 'components']);
    }
    async getQueueUserPermissions(queueKey, userId) {
        return (0, http_1.fetchJson)(this.buildUrl(`/queues/${encodeURIComponent(queueKey)}/permissions/users/${encodeURIComponent(userId)}`), { method: 'GET', headers: this.headers() });
    }
    async getQueuePermissions(queueKey) {
        return (0, http_1.fetchJson)(this.buildUrl(`/queues/${encodeURIComponent(queueKey)}/permissions`), { method: 'GET', headers: this.headers() });
    }
    async getIssueTransitions(issueIdOrKey) {
        return (0, http_1.fetchJson)(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/transitions`), {
            method: 'GET',
            headers: this.headers()
        });
    }
    async getIssueComments(issueIdOrKey, options = {}) {
        const query = new URLSearchParams();
        if (options.expand?.length)
            query.set('expand', options.expand.join(','));
        if (options.perPage !== undefined)
            query.set('perPage', String(options.perPage));
        if (options.page !== undefined)
            query.set('page', String(options.page));
        if (options.id !== undefined)
            query.set('id', String(options.id));
        const response = await (0, http_1.fetchJsonWithMeta)(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/comments`, query), {
            method: 'GET',
            headers: this.headers()
        });
        return {
            comments: response.data,
            pagination: this.extractPaginationMeta(response.headers)
        };
    }
    async getIssueCommentsByUrl(nextUrl) {
        const response = await (0, http_1.fetchJsonWithMeta)(nextUrl, {
            method: 'GET',
            headers: this.headers()
        });
        return {
            comments: response.data,
            pagination: this.extractPaginationMeta(response.headers)
        };
    }
    async getIssueChangelog(issueIdOrKey, options = {}) {
        const query = new URLSearchParams();
        if (options.perPage !== undefined)
            query.set('perPage', String(options.perPage));
        if (options.page !== undefined)
            query.set('page', String(options.page));
        if (options.id)
            query.set('id', options.id);
        if (options.field)
            query.set('field', options.field);
        if (options.type)
            query.set('type', options.type);
        const response = await (0, http_1.fetchJsonWithMeta)(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/changelog`, query), {
            method: 'GET',
            headers: this.headers()
        });
        return {
            entries: response.data,
            pagination: this.extractPaginationMeta(response.headers)
        };
    }
    async getIssueChangelogByUrl(nextUrl) {
        const response = await (0, http_1.fetchJsonWithMeta)(nextUrl, {
            method: 'GET',
            headers: this.headers()
        });
        return {
            entries: response.data,
            pagination: this.extractPaginationMeta(response.headers)
        };
    }
    async searchIssues(payload, options = {}) {
        const query = new URLSearchParams();
        if (options.fields?.length)
            query.set('fields', options.fields.join(','));
        if (options.expand?.length)
            query.set('expand', options.expand.join(','));
        if (options.perPage !== undefined)
            query.set('perPage', String(options.perPage));
        if (options.page !== undefined)
            query.set('page', String(options.page));
        if (options.id !== undefined)
            query.set('id', String(options.id));
        if (options.scrollType)
            query.set('scrollType', options.scrollType);
        if (options.perScroll !== undefined)
            query.set('perScroll', String(options.perScroll));
        if (options.scrollTTLMillis !== undefined)
            query.set('scrollTTLMillis', String(options.scrollTTLMillis));
        if (options.scrollId)
            query.set('scrollId', options.scrollId);
        const response = await (0, http_1.fetchJsonWithMeta)(this.buildUrl('/issues/_search', query), {
            method: 'POST',
            headers: this.headers(true),
            body: JSON.stringify(payload)
        });
        return {
            issues: response.data,
            pagination: this.extractPaginationMeta(response.headers)
        };
    }
    extractPaginationMeta(headers) {
        const totalPagesHeader = headers.get('x-total-pages');
        const totalCountHeader = headers.get('x-total-count');
        return {
            totalPages: totalPagesHeader ? Number(totalPagesHeader) : undefined,
            totalCount: totalCountHeader ? Number(totalCountHeader) : undefined,
            nextLink: headers.get('link') || undefined,
            scrollId: headers.get('x-scroll-id') || undefined,
            scrollToken: headers.get('x-scroll-token') || undefined
        };
    }
    async countIssues(payload) {
        return (0, http_1.fetchJson)(this.buildUrl('/issues/_count'), {
            method: 'POST',
            headers: this.headers(true),
            body: JSON.stringify(payload)
        });
    }
    async createIssueReport(payload) {
        return (0, http_1.fetchJson)(this.buildUrl('/entities/report/'), {
            method: 'POST',
            headers: this.headers(true),
            body: JSON.stringify(payload)
        });
    }
}
exports.TrackerApiClient = TrackerApiClient;
