"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerSyncService = void 0;
const env_1 = require("../../../config/env");
const tracker_normalizer_1 = require("./tracker-normalizer");
async function fetchAllIssueComments(trackerClient, issueIdOrKey) {
    const perPage = 100;
    const commentsById = new Map();
    let page = 1;
    let totalPages = 1;
    do {
        const result = await trackerClient.getIssueComments(issueIdOrKey, {
            perPage,
            page,
            expand: ['html']
        });
        for (const comment of result.comments) {
            commentsById.set(String(comment.id), comment);
        }
        totalPages = Math.max(result.pagination.totalPages || 1, 1);
        page += 1;
    } while (page <= totalPages);
    return Array.from(commentsById.values());
}
async function fetchAllIssueChangelog(trackerClient, issueIdOrKey) {
    const perPage = 100;
    const entriesById = new Map();
    let page = 1;
    let totalPages = 1;
    do {
        const result = await trackerClient.getIssueChangelog(issueIdOrKey, {
            perPage,
            page
        });
        for (const entry of result.entries) {
            entriesById.set(String(entry.id), entry);
        }
        totalPages = Math.max(result.pagination.totalPages || 1, 1);
        page += 1;
    } while (page <= totalPages);
    return Array.from(entriesById.values());
}
class TrackerSyncService {
    trackerClient;
    constructor(trackerClient) {
        this.trackerClient = trackerClient;
    }
    getStatus() {
        return {
            enabled: env_1.env.tracker.enabled,
            configured: this.trackerClient.isConfigured(),
            apiBaseUrl: env_1.env.tracker.apiBaseUrl,
            organizationConfigured: Boolean(env_1.env.tracker.orgId || env_1.env.tracker.cloudOrgId)
        };
    }
    getSetupChecklist() {
        return [
            'Добавить YANDEX_TRACKER_OAUTH_TOKEN в .env',
            'Добавить YANDEX_TRACKER_ORG_ID или YANDEX_TRACKER_CLOUD_ORG_ID',
            'Подтвердить endpoint списка задач и его пагинацию',
            'Подтвердить endpoint комментариев и истории задач',
            'Дать 2-3 примера реальных API ответов для issues/comments/history',
            'Определить минимальный набор сущностей для sync MVP',
            'Зафиксировать raw/normalized storage model и incremental sync cursor strategy'
        ];
    }
    getSyncModelDraft() {
        return {
            scope: [
                {
                    entity: 'issues',
                    requiredForMvp: true,
                    source: 'tracker-api',
                    syncStrategy: 'incremental',
                    notes: [
                        'Основная сущность для digest, health и chat use cases',
                        'Нужно поддержать стандартные и custom fields'
                    ]
                },
                {
                    entity: 'comments',
                    requiredForMvp: true,
                    source: 'tracker-api',
                    syncStrategy: 'per-issue-followup',
                    notes: [
                        'Нужны для AI search, risk explanation и digest context',
                        'Пока логично дочитывать по issue после выборки измененных задач'
                    ]
                },
                {
                    entity: 'changelog',
                    requiredForMvp: true,
                    source: 'tracker-api',
                    syncStrategy: 'per-issue-followup',
                    notes: [
                        'Нужен для explainability и анализа причин изменений',
                        'Используется для статусов, followers, custom field transitions'
                    ]
                },
                {
                    entity: 'users',
                    requiredForMvp: true,
                    source: 'tracker-api',
                    syncStrategy: 'incremental',
                    notes: ['Пока можно собирать косвенно из issue/comment/changelog payloads']
                },
                {
                    entity: 'queues',
                    requiredForMvp: true,
                    source: 'tracker-api',
                    syncStrategy: 'full',
                    notes: ['Нужны для onboarding scope и фильтрации sync']
                },
                {
                    entity: 'projects',
                    requiredForMvp: false,
                    source: 'tracker-api',
                    syncStrategy: 'incremental',
                    notes: ['Можно добавить после стабилизации issue/comment/history sync']
                }
            ],
            storage: [
                {
                    layer: 'raw',
                    entities: ['tracker_issue_raw', 'tracker_comment_raw', 'tracker_changelog_raw'],
                    rationale: 'Сохраняем исходные payloads для повторного парсинга и безопасной эволюции схемы'
                },
                {
                    layer: 'normalized',
                    entities: ['tracker_issues', 'tracker_comments', 'tracker_issue_history_events', 'tracker_users'],
                    rationale: 'Даем стабильную модель для analytics, digest и query layer'
                },
                {
                    layer: 'derived',
                    entities: ['issue_risk_snapshots', 'team_health_snapshots', 'digest_snapshots'],
                    rationale: 'Кэшируем рассчитанные выводы и сводки для быстрых ответов'
                }
            ],
            incrementalCursorDraft: [
                'Для issues базовый кандидат курсора: updatedAt + last seen issue id/key as tiebreaker',
                'Для comments/changelog на старте можно идти per issue и дочитывать все записи страницы за страницей',
                'Позже можно хранить last synced comment id / changelog id per issue'
            ]
        };
    }
    async getConnectionPreview() {
        if (!env_1.env.tracker.enabled) {
            return {
                ok: false,
                reason: 'Tracker integration is disabled via ENABLE_YANDEX_TRACKER'
            };
        }
        if (!this.trackerClient.isConfigured()) {
            return {
                ok: false,
                reason: 'Tracker credentials are not fully configured'
            };
        }
        const queues = await this.trackerClient.getQueues();
        return {
            ok: true,
            queueCount: queues.length,
            sampleQueues: queues.slice(0, 5).map((queue) => ({
                id: queue.id,
                key: queue.key,
                name: queue.name
            }))
        };
    }
    async fetchIssueBundle(issueIdOrKey) {
        if (!env_1.env.tracker.enabled) {
            throw new Error('Tracker integration is disabled via ENABLE_YANDEX_TRACKER');
        }
        if (!this.trackerClient.isConfigured()) {
            throw new Error('Tracker credentials are not fully configured');
        }
        const [issue, comments, changelog] = await Promise.all([
            this.trackerClient.getIssue(issueIdOrKey),
            fetchAllIssueComments(this.trackerClient, issueIdOrKey),
            fetchAllIssueChangelog(this.trackerClient, issueIdOrKey)
        ]);
        return {
            issue,
            comments,
            changelog,
            fetchedAt: new Date().toISOString(),
            meta: {
                issueIdOrKey,
                commentsCount: comments.length,
                changelogCount: changelog.length
            }
        };
    }
    async getIssueBundlePreview(issueIdOrKey) {
        const bundle = await this.fetchIssueBundle(issueIdOrKey);
        const normalized = (0, tracker_normalizer_1.normalizeTrackerIssueBundle)(bundle);
        return {
            key: bundle.issue.key,
            summary: bundle.issue.summary,
            status: bundle.issue.status?.display,
            queue: bundle.issue.queue?.display,
            assignee: bundle.issue.assignee?.display,
            commentsCount: bundle.comments.length,
            changelogCount: bundle.changelog.length,
            usersDiscovered: normalized.users.length,
            customFieldCount: Object.keys(normalized.issue.rawCustomFields).length,
            latestCommentAt: bundle.issue.lastCommentUpdatedAt,
            latestIssueUpdateAt: bundle.issue.updatedAt
        };
    }
    async getIssueBundleDebug(issueIdOrKey) {
        const bundle = await this.fetchIssueBundle(issueIdOrKey);
        const comments = bundle.comments
            .slice()
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
            .slice(0, 10)
            .map((comment) => ({
            id: comment.id,
            longId: comment.longId,
            updatedAt: comment.updatedAt,
            createdAt: comment.createdAt,
            author: comment.updatedBy?.display || comment.createdBy?.display,
            type: comment.type,
            transport: comment.transport,
            text: (comment.text || '').replace(/\s+/g, ' ').trim().slice(0, 300)
        }));
        const changelog = bundle.changelog
            .slice()
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .slice(0, 10)
            .map((entry) => ({
            id: entry.id,
            updatedAt: entry.updatedAt,
            updatedBy: entry.updatedBy?.display,
            type: entry.type,
            changes: (entry.fields || []).slice(0, 5).map((field) => field.field?.display || field.field?.key || String(field.field?.id || 'field'))
        }));
        return {
            issueKey: bundle.issue.key,
            commentsCount: bundle.comments.length,
            changelogCount: bundle.changelog.length,
            latestCommentAt: bundle.issue.lastCommentUpdatedAt,
            latestIssueUpdateAt: bundle.issue.updatedAt,
            comments,
            changelog
        };
    }
}
exports.TrackerSyncService = TrackerSyncService;
