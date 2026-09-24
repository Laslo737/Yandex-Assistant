"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
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
    app.use(express_1.default.json({ limit: '1mb' }));
    const trackerApiClient = new tracker_client_1.TrackerApiClient();
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
        if (!env_1.env.yandexMessenger.webhookSecret) {
            throw new Error('YANDEX_WEBHOOK_SECRET is required when Yandex Messenger is enabled.');
        }
        const dedupeStore = new dedupe_store_1.DedupeStore();
        const messengerClient = new yandex_messenger_client_1.YandexMessengerClient();
        const messengerSender = new yandex_messenger_sender_1.YandexMessengerSender(messengerClient);
        const assistantService = new assistant_service_1.AssistantService({
            sender: messengerSender,
            authorization,
            queryService,
            digestService,
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
