import express from 'express';
import { resolve } from 'node:path';
import { AnalyticsStore } from './core/analytics/analytics.store';
import { AnalyticsService } from './core/analytics/analytics.service';
import { createAdminRouter } from './interfaces/admin/admin.router';
import { env } from './config/env';
import { createHealthRouter } from './interfaces/http/health.router';
import { createShortLinkRouter } from './interfaces/http/short-link.router';
import { createYandexMessengerRouter } from './interfaces/yandex-messenger/yandex-messenger.router';
import { DedupeStore } from './shared/utils/dedupe-store';
import { YandexMessengerClient } from './interfaces/yandex-messenger/yandex-messenger.client';
import { mapButtons, YandexMessengerSender } from './interfaces/yandex-messenger/yandex-messenger.sender';
import { AssistantService } from './core/assistant/application/assistant.service';
import { OpenRouterAiService } from './core/ai/application/openrouter-ai.service';
import { QueryService } from './core/query/application/query.service';
import { DigestService } from './core/digest/application/digest.service';
import { DigestStore } from './core/digest/digest.store';
import { DigestSubscriptions } from './core/digest/digest-subscriptions';
import { DailyDigestService } from './core/digest/daily-digest.service';
import { DigestScheduler } from './core/digest/digest.scheduler';
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
import { IssueAuthorizationService } from './core/authorization/application/issue-authorization.service';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  if (env.digest.enabled && (!env.yandexMessenger.enabled || !env.tracker.enabled ||
      !env.yandexMessenger.key || !env.app.publicBaseUrl?.startsWith('https://'))) {
    throw new Error('DAILY_DIGEST_REQUIRES_MESSENGER_TRACKER_AND_HTTPS');
  }
  if (env.digest.enabled && !env.digest.allowlist.length) throw new Error('DIGEST_ALLOWLIST_REQUIRED');
  if (env.digest.enabled) {
    const paths = [env.admin.databasePath, env.digest.databasePath, env.app.shortLinksDatabasePath]
      .filter((path) => path !== ':memory:').map((path) => resolve(path).toLowerCase());
    if (new Set(paths).size !== paths.length) throw new Error('DAILY_DIGEST_REQUIRES_SEPARATE_DATABASE_FILES');
  }
  let analytics: AnalyticsService | undefined;
  if (env.admin.enabled) {
    if (!env.admin.username || env.admin.username.includes(':') || env.admin.password.length < 5) {
      throw new Error('Configure ADMIN_USERNAME and an ADMIN_PASSWORD of at least 5 characters');
    }
    if (env.app.nodeEnv === 'production' && !env.app.publicBaseUrl?.startsWith('https://')) {
      throw new Error('Admin production deployment requires HTTPS APP_PUBLIC_BASE_URL through nginx');
    }
    try {
      const store = new AnalyticsStore(env.admin.databasePath, env.admin.retentionDays);
      analytics = new AnalyticsService(store);
      app.use('/admin', createAdminRouter(store, env.admin));
    } catch {
      // Telemetry must never prevent the bot from starting when its database is unavailable.
      console.error('analytics.initialization_failed');
      app.use('/admin', (_req, res) => { res.status(503).send('Аналитика временно недоступна.'); });
    }
  }

  const trackerApiClient = new TrackerApiClient();
  if (env.digest.enabled && !trackerApiClient.isConfigured()) throw new Error('DAILY_DIGEST_REQUIRES_TRACKER_CREDENTIALS');
  const authorization = new IssueAuthorizationService(trackerApiClient);
  const trackerSyncService = new TrackerSyncService(trackerApiClient);
  const queryService = new QueryService();
  const openRouterAiService = new OpenRouterAiService();
  const platformStatusService = new PlatformStatusService(trackerSyncService);
  const workdayService = new WorkdayService(trackerApiClient, authorization);
  const managerSummaryService = new ManagerSummaryService(trackerApiClient, authorization);
  const digestService = new DigestService({
    workdayService,
    managerSummaryService
  });
  const processAnalysisService = new ProcessAnalysisService({
    trackerClient: trackerApiClient,
    managerSummaryService,
    authorization
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
    managerSummaryService,
    authorization
  });
  app.use(createHealthRouter({ platformStatusService }));
  app.use(createShortLinkRouter());

  if (env.yandexMessenger.enabled) {
    const dedupeStore = new DedupeStore();
    const messengerClient = new YandexMessengerClient();
    const messengerSender = new YandexMessengerSender(messengerClient);
    let digestSubscriptions: DigestSubscriptions | undefined;
    let dailyDigestService: DailyDigestService | undefined;
    try {
      const store = new DigestStore(env.digest.databasePath);
      digestSubscriptions = new DigestSubscriptions(store, env.digest.enabled, env.digest.allowlist);
      const daily = new DailyDigestService(trackerApiClient, authorization, workdayService);
      dailyDigestService = daily;
      app.locals.digestScheduler = new DigestScheduler(store, env.digest,
        (job) => daily.build(job.login, job.trackerId, job.date),
        (job, message, signal) => messengerClient.sendTextOnce({ login: job.login,
          payload_id: message.payloadId!, text: message.text,
          suggest_buttons: message.buttons?.length ? mapButtons(message.buttons) : undefined }, signal));
    } catch (error) {
      console.error('digest.initialization_failed');
      if (env.digest.enabled) throw new Error('DAILY_DIGEST_STORAGE_OR_CONFIG_UNAVAILABLE');
    }
    const assistantService = new AssistantService({
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

    app.use(createYandexMessengerRouter({
      assistantService,
      dedupeStore,
      webhookSecret: env.yandexMessenger.webhookSecret
    }));
  }

  return app;
}
