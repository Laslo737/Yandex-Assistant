"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const node_path_1 = require("node:path");
const analytics_store_1 = require("./core/analytics/analytics.store");
const analytics_service_1 = require("./core/analytics/analytics.service");
const admin_router_1 = require("./interfaces/admin/admin.router");
const env_1 = require("./config/env");
const health_router_1 = require("./interfaces/http/health.router");
const short_link_router_1 = require("./interfaces/http/short-link.router");
const yandex_messenger_router_1 = require("./interfaces/yandex-messenger/yandex-messenger.router");
const dedupe_store_1 = require("./shared/utils/dedupe-store");
const yandex_messenger_client_1 = require("./interfaces/yandex-messenger/yandex-messenger.client");
const yandex_messenger_sender_1 = require("./interfaces/yandex-messenger/yandex-messenger.sender");
const assistant_service_1 = require("./core/assistant/application/assistant.service");
const openrouter_ai_service_1 = require("./core/ai/application/openrouter-ai.service");
const query_service_1 = require("./core/query/application/query.service");
const digest_service_1 = require("./core/digest/application/digest.service");
const digest_store_1 = require("./core/digest/digest.store");
const digest_subscriptions_1 = require("./core/digest/digest-subscriptions");
const daily_digest_service_1 = require("./core/digest/daily-digest.service");
const digest_scheduler_1 = require("./core/digest/digest.scheduler");
const health_service_1 = require("./core/health/application/health.service");
const tracker_sync_service_1 = require("./core/tracker/application/tracker-sync.service");
const platform_status_service_1 = require("./core/platform/application/platform-status.service");
const tracker_client_1 = require("./integrations/yandex-tracker/tracker.client");
const workday_service_1 = require("./core/workday/application/workday.service");
const manager_summary_service_1 = require("./core/manager/application/manager-summary.service");
const issue_explain_ai_service_1 = require("./core/explain/application/issue-explain-ai.service");
const issue_explain_service_1 = require("./core/explain/application/issue-explain.service");
const changes_service_1 = require("./core/changes/application/changes.service");
const process_analysis_service_1 = require("./core/process-analysis/application/process-analysis.service");
const issue_help_ai_service_1 = require("./core/issue-help/application/issue-help-ai.service");
const issue_help_service_1 = require("./core/issue-help/application/issue-help.service");
const issue_authorization_service_1 = require("./core/authorization/application/issue-authorization.service");
function createApp() {
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.use(express_1.default.json({ limit: '1mb' }));
    if (env_1.env.digest.enabled && (!env_1.env.yandexMessenger.enabled || !env_1.env.tracker.enabled ||
        !env_1.env.yandexMessenger.key || !env_1.env.app.publicBaseUrl?.startsWith('https://'))) {
        throw new Error('DAILY_DIGEST_REQUIRES_MESSENGER_TRACKER_AND_HTTPS');
    }
    if (env_1.env.digest.enabled && !env_1.env.digest.allowlist.length)
        throw new Error('DIGEST_ALLOWLIST_REQUIRED');
    if (env_1.env.digest.enabled) {
        const paths = [env_1.env.admin.databasePath, env_1.env.digest.databasePath, env_1.env.app.shortLinksDatabasePath]
            .filter((path) => path !== ':memory:').map((path) => (0, node_path_1.resolve)(path).toLowerCase());
        if (new Set(paths).size !== paths.length)
            throw new Error('DAILY_DIGEST_REQUIRES_SEPARATE_DATABASE_FILES');
    }
    let analytics;
    if (env_1.env.admin.enabled) {
        if (!env_1.env.admin.username || env_1.env.admin.username.includes(':') || env_1.env.admin.password.length < 5) {
            throw new Error('Configure ADMIN_USERNAME and an ADMIN_PASSWORD of at least 5 characters');
        }
        if (env_1.env.app.nodeEnv === 'production' && !env_1.env.app.publicBaseUrl?.startsWith('https://')) {
            throw new Error('Admin production deployment requires HTTPS APP_PUBLIC_BASE_URL through nginx');
        }
        try {
            const store = new analytics_store_1.AnalyticsStore(env_1.env.admin.databasePath, env_1.env.admin.retentionDays);
            analytics = new analytics_service_1.AnalyticsService(store);
            app.use('/admin', (0, admin_router_1.createAdminRouter)(store, env_1.env.admin));
        }
        catch {
            // Telemetry must never prevent the bot from starting when its database is unavailable.
            console.error('analytics.initialization_failed');
            app.use('/admin', (_req, res) => { res.status(503).send('Аналитика временно недоступна.'); });
        }
    }
    const trackerApiClient = new tracker_client_1.TrackerApiClient();
    if (env_1.env.digest.enabled && !trackerApiClient.isConfigured())
        throw new Error('DAILY_DIGEST_REQUIRES_TRACKER_CREDENTIALS');
    const authorization = new issue_authorization_service_1.IssueAuthorizationService(trackerApiClient);
    const trackerSyncService = new tracker_sync_service_1.TrackerSyncService(trackerApiClient);
    const queryService = new query_service_1.QueryService();
    const openRouterAiService = new openrouter_ai_service_1.OpenRouterAiService();
    const platformStatusService = new platform_status_service_1.PlatformStatusService(trackerSyncService);
    const workdayService = new workday_service_1.WorkdayService(trackerApiClient, authorization);
    const managerSummaryService = new manager_summary_service_1.ManagerSummaryService(trackerApiClient, authorization);
    const digestService = new digest_service_1.DigestService({
        workdayService,
        managerSummaryService
    });
    const processAnalysisService = new process_analysis_service_1.ProcessAnalysisService({
        trackerClient: trackerApiClient,
        managerSummaryService,
        authorization
    });
    const healthService = new health_service_1.HealthService({
        managerSummaryService,
        processAnalysisService
    });
    const issueExplainService = new issue_explain_service_1.IssueExplainService(trackerSyncService);
    const issueExplainAiService = new issue_explain_ai_service_1.IssueExplainAiService(openRouterAiService);
    const issueHelpAiService = new issue_help_ai_service_1.IssueHelpAiService(openRouterAiService);
    const issueHelpService = new issue_help_service_1.IssueHelpService({
        trackerSyncService,
        issueExplainService,
        issueHelpAiService
    });
    const changesService = new changes_service_1.ChangesService({
        trackerClient: trackerApiClient,
        managerSummaryService,
        authorization
    });
    app.use((0, health_router_1.createHealthRouter)({ platformStatusService }));
    app.use((0, short_link_router_1.createShortLinkRouter)());
    if (env_1.env.yandexMessenger.enabled) {
        const dedupeStore = new dedupe_store_1.DedupeStore();
        const messengerClient = new yandex_messenger_client_1.YandexMessengerClient();
        const messengerSender = new yandex_messenger_sender_1.YandexMessengerSender(messengerClient);
        let digestSubscriptions;
        let dailyDigestService;
        try {
            const store = new digest_store_1.DigestStore(env_1.env.digest.databasePath);
            digestSubscriptions = new digest_subscriptions_1.DigestSubscriptions(store, env_1.env.digest.enabled, env_1.env.digest.allowlist);
            const daily = new daily_digest_service_1.DailyDigestService(trackerApiClient, authorization, workdayService);
            dailyDigestService = daily;
            app.locals.digestScheduler = new digest_scheduler_1.DigestScheduler(store, env_1.env.digest, (job) => daily.build(job.login, job.trackerId, job.date), (job, message, signal) => messengerClient.sendTextOnce({ login: job.login,
                payload_id: message.payloadId, text: message.text,
                suggest_buttons: message.buttons?.length ? (0, yandex_messenger_sender_1.mapButtons)(message.buttons) : undefined }, signal));
        }
        catch (error) {
            console.error('digest.initialization_failed');
            if (env_1.env.digest.enabled)
                throw new Error('DAILY_DIGEST_STORAGE_OR_CONFIG_UNAVAILABLE');
        }
        const assistantService = new assistant_service_1.AssistantService({
            sender: messengerSender,
            analytics,
            authorization,
            queryService,
            digestService,
            digestSubscriptions,
            dailyDigestService,
            healthService,
            trackerSyncService,
            workdayService,
            managerSummaryService,
            issueExplainService,
            issueExplainAiService,
            issueHelpService,
            changesService,
            processAnalysisService
        });
        app.use((0, yandex_messenger_router_1.createYandexMessengerRouter)({
            assistantService,
            dedupeStore,
            webhookSecret: env_1.env.yandexMessenger.webhookSecret
        }));
    }
    return app;
}
