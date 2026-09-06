import express from 'express';
import { env } from './config/env';
import { createHealthRouter } from './interfaces/http/health.router';
import { createShortLinkRouter } from './interfaces/http/short-link.router';
import { createYandexMessengerRouter } from './interfaces/yandex-messenger/yandex-messenger.router';
import { DedupeStore } from './shared/utils/dedupe-store';
import { YandexMessengerClient } from './interfaces/yandex-messenger/yandex-messenger.client';
import { YandexMessengerSender } from './interfaces/yandex-messenger/yandex-messenger.sender';
import { AssistantService } from './core/assistant/application/assistant.service';
import { OpenRouterAiService } from './core/ai/application/openrouter-ai.service';
import { QueryService } from './core/query/application/query.service';
import { DigestService } from './core/digest/application/digest.service';
import { HealthService } from './core/health/application/health.service';
import { TrackerSyncService } from './core/tracker/application/tracker-sync.service';
import { PlatformStatusService } from './core/platform/application/platform-status.service';
import { TrackerApiClient } from './integrations/yandex-tracker/tracker.client';
import { WorkdayService } from './core/workday/application/workday.service';
import { ManagerSummaryService } from './core/manager/application/manager-summary.service';
import { IssueExplainAiService } from './core/explain/application/issue-explain-ai.service';
import { IssueExplainService } from './core/explain/application/issue-explain.service';
import { ChangesService } from './core/changes/application/changes.service';
import { ProcessAnalysisService } from './core/process-analysis/application/process-analysis.service';
import { IssueHelpAiService } from './core/issue-help/application/issue-help-ai.service';
import { IssueHelpService } from './core/issue-help/application/issue-help.service';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const trackerApiClient = new TrackerApiClient();
  const trackerSyncService = new TrackerSyncService(trackerApiClient);
  const queryService = new QueryService();
  const openRouterAiService = new OpenRouterAiService();
  const platformStatusService = new PlatformStatusService(trackerSyncService);
  const workdayService = new WorkdayService(trackerApiClient);
  const managerSummaryService = new ManagerSummaryService(trackerApiClient);
  const digestService = new DigestService({
    workdayService,
    managerSummaryService
  });
  const processAnalysisService = new ProcessAnalysisService({
    trackerClient: trackerApiClient,
    managerSummaryService
  });
  const healthService = new HealthService({
    managerSummaryService,
    processAnalysisService
  });
  const issueExplainService = new IssueExplainService(trackerSyncService);
  const issueExplainAiService = new IssueExplainAiService(openRouterAiService);
  const issueHelpAiService = new IssueHelpAiService(openRouterAiService);
  const issueHelpService = new IssueHelpService({
    trackerSyncService,
    issueExplainService,
    issueHelpAiService
  });
  const changesService = new ChangesService({
    trackerClient: trackerApiClient,
    managerSummaryService
  });
  app.use(createHealthRouter({ platformStatusService }));
  app.use(createShortLinkRouter());

  if (env.yandexMessenger.enabled) {
    const dedupeStore = new DedupeStore();
    const messengerClient = new YandexMessengerClient();
    const messengerSender = new YandexMessengerSender(messengerClient);
    const assistantService = new AssistantService({
      sender: messengerSender,
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

    app.use(createYandexMessengerRouter({
      assistantService,
      dedupeStore,
      webhookSecret: env.yandexMessenger.webhookSecret
    }));
  }

  return app;
}
