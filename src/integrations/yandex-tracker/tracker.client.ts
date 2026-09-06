import { env } from '../../config/env';
import { fetchJson, fetchJsonWithMeta } from '../../shared/utils/http';
import {
  TrackerBoard,
  TrackerComment,
  TrackerCountIssuesPayload,
  TrackerCreateReportPayload,
  TrackerGetIssueChangelogOptions,
  TrackerGetIssueChangelogResult,
  TrackerGetIssueCommentsOptions,
  TrackerGetIssueCommentsResult,
  TrackerIssue,
  TrackerIssueCountResponse,
  TrackerQueue,
  TrackerReportResponse,
  TrackerStatus,
  TrackerTransition,
  TrackerSearchIssuesOptions,
  TrackerSearchIssuesPayload,
  TrackerSearchIssuesResult,
  TrackerChangelogEntry,
  TrackerDetailedUser,
  TrackerPaginationMeta
} from './tracker.types';

export class TrackerApiClient {
  private readonly config = env.tracker;

  isConfigured(): boolean {
    return Boolean(this.config.oauthToken && (this.config.orgId || this.config.cloudOrgId));
  }

  private headers(includeJson = false): Record<string, string> {
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

  private buildUrl(path: string, query?: URLSearchParams): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`/v3${normalizedPath}`, this.config.apiBaseUrl);
    if (query) url.search = query.toString();
    return url.toString();
  }

  async getQueues(): Promise<TrackerQueue[]> {
    return fetchJson<TrackerQueue[]>(this.buildUrl('/queues/'), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getBoards(): Promise<TrackerBoard[]> {
    return fetchJson<TrackerBoard[]>(this.buildUrl('/boards'), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getUser(loginOrId: string, expand?: string[]): Promise<TrackerDetailedUser> {
    const normalized = /^\d+$/.test(loginOrId) ? `login:${loginOrId}` : loginOrId;
    const query = new URLSearchParams();
    if (expand?.length) query.set('expand', expand.join(','));

    return fetchJson<TrackerDetailedUser>(this.buildUrl(`/users/${encodeURIComponent(normalized)}`, query), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getStatuses(): Promise<TrackerStatus[]> {
    const perPage = 100;
    const statusesById = new Map<string, TrackerStatus>();
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        perPage: String(perPage),
        page: String(page)
      });

      const response = await fetchJsonWithMeta<TrackerStatus[]>(this.buildUrl('/statuses', query), {
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

  async getBoardsPaginated(perPage = 20, id?: string | number): Promise<TrackerBoard[]> {
    const query = new URLSearchParams({ perPage: String(perPage) });
    if (id !== undefined) query.set('id', String(id));

    return fetchJson<TrackerBoard[]>(this.buildUrl('/boards/_paginate', query), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getIssue(issueIdOrKey: string, fields?: string[], expand?: string[]): Promise<TrackerIssue> {
    const query = new URLSearchParams();
    if (fields?.length) query.set('fields', fields.join(','));
    if (expand?.length) query.set('expand', expand.join(','));

    return fetchJson<TrackerIssue>(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}`, query), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getIssueTransitions(issueIdOrKey: string): Promise<TrackerTransition[]> {
    return fetchJson<TrackerTransition[]>(this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/transitions`), {
      method: 'GET',
      headers: this.headers()
    });
  }

  async getIssueComments(
    issueIdOrKey: string,
    options: TrackerGetIssueCommentsOptions = {}
  ): Promise<TrackerGetIssueCommentsResult> {
    const query = new URLSearchParams();
    if (options.expand?.length) query.set('expand', options.expand.join(','));
    if (options.perPage !== undefined) query.set('perPage', String(options.perPage));
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.id !== undefined) query.set('id', String(options.id));

    const response = await fetchJsonWithMeta<TrackerComment[]>(
      this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/comments`, query),
      {
        method: 'GET',
        headers: this.headers()
      }
    );

    return {
      comments: response.data,
      pagination: this.extractPaginationMeta(response.headers)
    };
  }

  async getIssueCommentsByUrl(nextUrl: string): Promise<TrackerGetIssueCommentsResult> {
    const response = await fetchJsonWithMeta<TrackerComment[]>(nextUrl, {
      method: 'GET',
      headers: this.headers()
    });

    return {
      comments: response.data,
      pagination: this.extractPaginationMeta(response.headers)
    };
  }

  async getIssueChangelog(
    issueIdOrKey: string,
    options: TrackerGetIssueChangelogOptions = {}
  ): Promise<TrackerGetIssueChangelogResult> {
    const query = new URLSearchParams();
    if (options.perPage !== undefined) query.set('perPage', String(options.perPage));
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.id) query.set('id', options.id);
    if (options.field) query.set('field', options.field);
    if (options.type) query.set('type', options.type);

    const response = await fetchJsonWithMeta<TrackerChangelogEntry[]>(
      this.buildUrl(`/issues/${encodeURIComponent(issueIdOrKey)}/changelog`, query),
      {
        method: 'GET',
        headers: this.headers()
      }
    );

    return {
      entries: response.data,
      pagination: this.extractPaginationMeta(response.headers)
    };
  }

  async getIssueChangelogByUrl(nextUrl: string): Promise<TrackerGetIssueChangelogResult> {
    const response = await fetchJsonWithMeta<TrackerChangelogEntry[]>(nextUrl, {
      method: 'GET',
      headers: this.headers()
    });

    return {
      entries: response.data,
      pagination: this.extractPaginationMeta(response.headers)
    };
  }

  async searchIssues(
    payload: TrackerSearchIssuesPayload,
    options: TrackerSearchIssuesOptions = {}
  ): Promise<TrackerSearchIssuesResult> {
    const query = new URLSearchParams();

    if (options.fields?.length) query.set('fields', options.fields.join(','));
    if (options.expand?.length) query.set('expand', options.expand.join(','));
    if (options.perPage !== undefined) query.set('perPage', String(options.perPage));
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.id !== undefined) query.set('id', String(options.id));
    if (options.scrollType) query.set('scrollType', options.scrollType);
    if (options.perScroll !== undefined) query.set('perScroll', String(options.perScroll));
    if (options.scrollTTLMillis !== undefined) query.set('scrollTTLMillis', String(options.scrollTTLMillis));
    if (options.scrollId) query.set('scrollId', options.scrollId);

    const response = await fetchJsonWithMeta<TrackerIssue[]>(this.buildUrl('/issues/_search', query), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(payload)
    });

    return {
      issues: response.data,
      pagination: this.extractPaginationMeta(response.headers)
    };
  }

  private extractPaginationMeta(headers: Headers): TrackerPaginationMeta {
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

  async countIssues(payload: TrackerCountIssuesPayload): Promise<TrackerIssueCountResponse> {
    return fetchJson<TrackerIssueCountResponse>(this.buildUrl('/issues/_count'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(payload)
    });
  }

  async createIssueReport(payload: TrackerCreateReportPayload): Promise<TrackerReportResponse> {
    return fetchJson<TrackerReportResponse>(this.buildUrl('/entities/report/'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(payload)
    });
  }
}
