import { env } from '../../../config/env';
import {
  YandexMessengerEvent,
  YandexMessengerReplyMessage
} from '../../../interfaces/yandex-messenger/yandex-messenger.types';
import { YandexMessengerSender } from '../../../interfaces/yandex-messenger/yandex-messenger.sender';
import { ChangesService } from '../../changes/application/changes.service';
import { DigestService } from '../../digest/application/digest.service';
import { IssueExplainAiService } from '../../explain/application/issue-explain-ai.service';
import { IssueExplainService } from '../../explain/application/issue-explain.service';
import { HealthService } from '../../health/application/health.service';
import { IssueHelpService } from '../../issue-help/application/issue-help.service';
import { ManagerSummaryService } from '../../manager/application/manager-summary.service';
import { QueryService } from '../../query/application/query.service';
import { ProcessAnalysisService } from '../../process-analysis/application/process-analysis.service';
import { TrackerSyncService } from '../../tracker/application/tracker-sync.service';
import { WorkdayService } from '../../workday/application/workday.service';
import { extractTrackerIssueKey } from '../../../shared/utils/tracker-links';
import {
  formatRoadmapMessage,
  formatVisionMessage,
  formatWelcomeMessage
} from '../presentation/assistant.formatters';
import {
  formatChangesEntryPoint,
  formatChangesPeriodPicker,
  formatChangesSummary
} from '../presentation/changes.formatters';
import {
  formatCombinedDigest,
  formatEmployeeDigest,
  formatManagerDigest
} from '../presentation/digest.formatters';
import { formatIssueAnalysis } from '../presentation/explain.formatters';
import { formatIssueHelpResult } from '../presentation/issue-help.formatters';
import { formatHealthCheck } from '../presentation/health.formatters';
import { formatManagerSummary } from '../presentation/manager.formatters';
import { formatProcessAnalysis } from '../presentation/process-analysis.formatters';
import {
  formatIssueBundlePreview,
  formatMyDaySummary,
  formatTrackerConnectionPreview
} from '../presentation/tracker.formatters';

const DEBUG_BUTTONS = [
  [{ text: 'status' }, { text: 'tracker' }],
  [{ text: 'tracker preview' }]
];

const MENU_ROW = [{ text: '📋 Меню' }];
const CHANGES_ROW = [{ text: '🕒 Изменения' }];
const MANAGER_BRIEFING_ROW = [{ text: '🧭 Сводка руководителя' }];
const PROCESS_ANALYSIS_ROW = [{ text: '📈 Риски по очередям' }];
const ISSUE_HELP_ROW = [{ text: '🆘 Помощь с задачей' }];
const ASK_AI_ROW = [{ text: '🤖 Спросить AI' }];

function pairButtons(buttons: Array<{ text: string }>): Array<Array<{ text: string }>> {
  const rows: Array<Array<{ text: string }>> = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

function limitButtonRows(rows: Array<Array<{ text: string }>>, maxButtons = 12): Array<Array<{ text: string }>> {
  const result: Array<Array<{ text: string }>> = [];
  let count = 0;

  for (const row of rows) {
    if (count >= maxButtons) break;
    const nextRow = row.slice(0, Math.max(0, maxButtons - count));
    if (!nextRow.length) continue;
    result.push(nextRow);
    count += nextRow.length;
  }

  return result;
}

function withMenuAtBottom(rows: Array<Array<{ text: string }>>, maxButtons = 12): Array<Array<{ text: string }>> {
  const contentRows = rows.filter((row) => !(row.length === 1 && row[0]?.text === 'Меню'));
  const limitedContent = limitButtonRows(contentRows, Math.max(0, maxButtons - 1));
  return [...limitedContent, MENU_ROW];
}

function buildChangesEntryRows(isManager: boolean): Array<Array<{ text: string }>> {
  return withMenuAtBottom([
    [{ text: '🕒 Изменения: мои задачи' }],
    ...(isManager ? [[{ text: '🕒 Изменения: команда' }]] : [])
  ]);
}

function buildChangesPeriodRows(scope: 'my' | 'team'): Array<Array<{ text: string }>> {
  return withMenuAtBottom([
    [
      { text: scope === 'my' ? '🕒 Мои 24ч' : '🕒 Команда 24ч' },
      { text: scope === 'my' ? '🕒 Мои 7д' : '🕒 Команда 7д' }
    ],
    [CHANGES_ROW[0]]
  ]);
}

function buildChangesSummaryRows(
  issueKeys: string[],
  scope: 'my' | 'team',
  isManager: boolean
): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    [
      { text: scope === 'my' ? '🕒 Мои 24ч' : '🕒 Команда 24ч' },
      { text: scope === 'my' ? '🕒 Мои 7д' : '🕒 Команда 7д' }
    ],
    [CHANGES_ROW[0]],
    ...(isManager ? [MANAGER_BRIEFING_ROW, PROCESS_ANALYSIS_ROW] : []),
    ASK_AI_ROW
  ]);
}

function buildMyDayRows(issueKeys: string[]): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    ASK_AI_ROW,
    [CHANGES_ROW[0]],
    [{ text: '🗓 Мой день' }]
  ]);
}

function buildManagerSummaryRows(issueKeys: string[]): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    PROCESS_ANALYSIS_ROW,
    [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
  ]);
}

function buildDigestRows(issueKeys: string[], _isManager: boolean): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    ASK_AI_ROW,
    MANAGER_BRIEFING_ROW
  ]);
}

function buildHealthRows(issueKeys: string[]): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    PROCESS_ANALYSIS_ROW,
    [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
  ]);
}

function buildProcessAnalysisRows(issueKeys: string[]): Array<Array<{ text: string }>> {
  const analysisRows = pairButtons(
    Array.from(new Set(issueKeys.filter(Boolean)))
      .slice(0, 6)
      .map((key) => ({ text: `🔎 Анализ ${key}` }))
  );

  return withMenuAtBottom([
    ...analysisRows,
    MANAGER_BRIEFING_ROW,
    [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
  ]);
}

function buildIssueAnalysisRows(issueKey: string): Array<Array<{ text: string }>> {
  return withMenuAtBottom([
    [{ text: `Анализ ${issueKey}` }],
    ISSUE_HELP_ROW,
    ASK_AI_ROW,
    MANAGER_BRIEFING_ROW
  ]);
}

function buildMainMenuRows(isManager: boolean, includeDebug: boolean): Array<Array<{ text: string }>> {
  const rows: Array<Array<{ text: string }>> = [
    [{ text: '🗓 Мой день' }],
    ...(isManager ? [MANAGER_BRIEFING_ROW, PROCESS_ANALYSIS_ROW] : []),
    ISSUE_HELP_ROW,
    ASK_AI_ROW
  ];

  if (includeDebug) {
    rows.push(...DEBUG_BUTTONS);
  }

  return withMenuAtBottom(rows);
}

function formatFriendlyError(title: string, error: unknown): string {
  const typed = error as { message?: string };

  return [
    title,
    typed?.message ? `Причина: ${typed.message}` : 'Попробуйте еще раз чуть позже.'
  ].join('\n');
}

function formatLoginRequired(): string {
  return 'Не удалось определить ваш login в Yandex Messenger. Нужен login текущей учетной записи Yandex 360.';
}

function normalizeIncomingText(text: string): string {
  return text
    .trim()
    .replace(/^\//, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .toLowerCase();
}

export class AssistantService {
  constructor(
    private readonly deps: {
      sender: YandexMessengerSender;
      queryService: QueryService;
      digestService: DigestService;
      healthService: HealthService;
      trackerSyncService: TrackerSyncService;
      workdayService: WorkdayService;
      managerSummaryService: ManagerSummaryService;
      issueExplainService: IssueExplainService;
      issueExplainAiService?: IssueExplainAiService;
      issueHelpService: IssueHelpService;
      changesService: ChangesService;
      processAnalysisService: ProcessAnalysisService;
    }
  ) {}

  async handleEvent(event: YandexMessengerEvent) {
    if (event.type === 'system') return;

    const buttons = await this.getMainButtons(event);
    const login = event.from?.login?.trim();

    if (!event.text?.trim()) {
      return this.reply(event, {
        text: 'Пока поддерживаются только текстовые сообщения. Напишите: помощь',
        buttons
      });
    }

    const text = normalizeIncomingText(event.text);

    if (['start', 'help', 'menu', 'меню', 'помощь', '📋 меню'].includes(text)) {
      const isManager = login ? await this.deps.managerSummaryService.isManagerLogin(login).catch(() => false) : false;
      return this.reply(event, { text: formatWelcomeMessage(isManager), buttons });
    }

    if (['vision', 'идея', 'видение'].includes(text)) {
      return this.reply(event, { text: formatVisionMessage(), buttons });
    }

    if (['roadmap', 'план'].includes(text)) {
      return this.reply(event, { text: formatRoadmapMessage(), buttons });
    }

    if (['мой день', '🗓 мой день', 'что у меня сегодня', 'мои задачи', 'my day'].includes(text)) {
      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const summary = await this.deps.workdayService.getMyDayByLogin(login);
        return this.reply(event, {
          text: formatMyDaySummary(summary),
          buttons: buildMyDayRows(summary.topTasks.map((task) => task.key))
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать модуль "Мой день".', error),
          buttons
        });
      }
    }

    if (['моя команда', '👥 моя команда', '👥 команда', 'мои отделы', 'команда'].includes(text)) {
      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const summary = await this.deps.managerSummaryService.getSummaryByLogin(login);
        return this.reply(event, {
          text: formatManagerSummary(summary),
          buttons: buildManagerSummaryRows(summary.topTasks.map((task) => task.key))
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать модуль "Моя команда".', error),
          buttons
        });
      }
    }

    if (['что изменилось', 'изменения', '🕒 изменения'].includes(text)) {
      const isManager = login ? await this.deps.managerSummaryService.isManagerLogin(login, true).catch(() => false) : false;

      return this.reply(event, {
        text: formatChangesEntryPoint(isManager),
        buttons: buildChangesEntryRows(isManager)
      });
    }

    if (['изменения: мои задачи', 'изменения мои задачи', '🕒 изменения: мои задачи'].includes(text)) {
      return this.reply(event, {
        text: formatChangesPeriodPicker('my'),
        buttons: buildChangesPeriodRows('my')
      });
    }

    if (['изменения: моя команда', 'изменения моя команда', 'изменения: команда', '🕒 изменения: команда'].includes(text)) {
      return this.reply(event, {
        text: formatChangesPeriodPicker('team'),
        buttons: buildChangesPeriodRows('team')
      });
    }

    if (['изменения мои 24ч', 'изменения мои 24 часа', '🕒 мои 24ч'].includes(text) || ['изменения мои 7д', 'изменения мои 7 дней', '🕒 мои 7д'].includes(text)) {
      const periodHours = text.includes('7') ? 24 * 7 : 24;

      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const summary = await this.deps.changesService.getMyChangesByLogin(login, periodHours);
        return this.reply(event, {
          text: formatChangesSummary(summary),
          buttons: buildChangesSummaryRows(summary.topTasks.map((task) => task.key), 'my', false)
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать изменения по вашим задачам.', error),
          buttons
        });
      }
    }

    if (['изменения команда 24ч', 'изменения команда 24 часа', '🕒 команда 24ч'].includes(text) || ['изменения команда 7д', 'изменения команда 7 дней', '🕒 команда 7д'].includes(text)) {
      const periodHours = text.includes('7') ? 24 * 7 : 24;

      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const summary = await this.deps.changesService.getTeamChangesByLogin(login, periodHours);
        return this.reply(event, {
          text: formatChangesSummary(summary),
          buttons: buildChangesSummaryRows(summary.topTasks.map((task) => task.key), 'team', true)
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать изменения по команде.', error),
          buttons
        });
      }
    }

    if (['digest', 'дайджест', '📰 дайджест'].includes(text)) {
      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const digest = await this.deps.digestService.getOnDemandDigestByLogin(login);
        return this.reply(event, {
          text: formatCombinedDigest({
            employee: formatEmployeeDigest({ ...digest.employee, login }),
            manager: digest.manager ? formatManagerDigest(digest.manager) : undefined
          }),
          buttons: buildDigestRows([
            ...digest.employee.topTasks.map((task) => task.key),
            ...(digest.manager?.topTasks.map((task) => task.key) || [])
          ], Boolean(digest.manager))
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать дайджест.', error),
          buttons
        });
      }
    }

    if (['анализ задачи', '🔍 анализ задачи', '🆘 помощь с задачей', 'помощь с задачей'].includes(text)) {
      return this.reply(event, {
        text: this.deps.issueHelpService.getEntryPrompt(),
        buttons
      });
    }

    if (this.deps.issueHelpService.canHandleMessage(event.text.trim())) {
      try {
        const result = await this.deps.issueHelpService.handleMessage(event.text.trim());
        return this.reply(event, {
          text: formatIssueHelpResult(result),
          buttons: buildIssueAnalysisRows(result.issueKey)
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось помочь с задачей.', error),
          buttons
        });
      }
    }

    if (['риски по очередям', '📈 риски по очередям', 'анализ процессов', '📈 анализ процессов', 'процессы', 'process analysis'].includes(text)) {
      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const analysis = await this.deps.processAnalysisService.getProcessAnalysisByLogin(login);
        return this.reply(event, {
          text: formatProcessAnalysis(analysis),
          buttons: buildProcessAnalysisRows(analysis.topTasks.map((task) => task.key))
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать риски по очередям.', error),
          buttons
        });
      }
    }

    if (['сводка руководителя', '🧭 сводка руководителя', 'что важно сегодня', '🧭 что важно сегодня', 'сводка команды', '📊 сводка команды', '📊 сводка', 'состояние команды', 'риски команды', 'health', 'health check', 'здоровье'].includes(text)) {
      if (!login) {
        return this.reply(event, {
          text: formatLoginRequired(),
          buttons
        });
      }

      try {
        const health = await this.deps.healthService.getHealthByLogin(login);
        return this.reply(event, {
          text: formatHealthCheck(health),
          buttons: buildHealthRows(health.topTasks.map((task) => task.key))
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError('Не удалось собрать состояние команды.', error),
          buttons
        });
      }
    }

    if (
      text.startsWith('анализ ') ||
      text.startsWith('analyze ') ||
      text.startsWith('analysis ') ||
      text.startsWith('анализ задачи ') ||
      text.startsWith('помощь с задачей ')
    ) {
      const explicitIssueKey = extractTrackerIssueKey(event.text);
      let issueIdOrKey = explicitIssueKey || event.text.trim().split(/\s+/).slice(1).join(' ').trim();

      if (!explicitIssueKey && text.startsWith('анализ задачи ')) {
        issueIdOrKey = event.text.trim().split(/\s+/).slice(2).join(' ').trim();
      }

      if (!explicitIssueKey && text.startsWith('помощь с задачей ')) {
        issueIdOrKey = event.text.trim().split(/\s+/).slice(3).join(' ').trim();
      }

      if (!issueIdOrKey) {
        return this.reply(event, {
          text: 'Укажи ключ задачи. Пример: анализ PRILOZHENIE-71',
          buttons
        });
      }

      try {
        const result = await this.deps.issueExplainService.analyzeIssue(issueIdOrKey);
        let aiSummary: string | undefined;

        if (this.deps.issueExplainAiService?.isEnabled()) {
          try {
            aiSummary = await this.deps.issueExplainAiService.generateSummary(result);
          } catch {
            aiSummary = undefined;
          }
        }

        return this.reply(event, {
          text: formatIssueAnalysis({ ...result, aiSummary }),
          buttons: buildIssueAnalysisRows(result.issueKey)
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError(`Не удалось выполнить анализ задачи ${issueIdOrKey}.`, error),
          buttons
        });
      }
    }

    if (['status', 'статус'].includes(text)) {
      const trackerStatus = this.deps.trackerSyncService.getStatus();
      return this.reply(event, {
        text: [
          'Статус платформы:',
          `- Tracker integration enabled: ${trackerStatus.enabled ? 'yes' : 'no'}`,
          `- Tracker token configured: ${trackerStatus.configured ? 'yes' : 'no'}`,
          `- Tracker org configured: ${trackerStatus.organizationConfigured ? 'yes' : 'no'}`,
          `- Tracker API: ${trackerStatus.apiBaseUrl}`
        ].join('\n'),
        buttons
      });
    }

    if (['tracker', 'трекер'].includes(text)) {
      return this.reply(event, {
        text: [
          'Чтобы начать интеграцию с Tracker, нужны:',
          ...this.deps.trackerSyncService.getSetupChecklist().map((item) => `- ${item}`)
        ].join('\n'),
        buttons
      });
    }

    if (['tracker preview', 'tracker status', 'трекер статус'].includes(text)) {
      const preview = await this.deps.trackerSyncService.getConnectionPreview();
      return this.reply(event, {
        text: formatTrackerConnectionPreview(preview),
        buttons
      });
    }

    if (text.startsWith('comments debug ') || text.startsWith('issue debug ') || text.startsWith('bundle debug ')) {
      const issueIdOrKey = event.text.trim().split(/\s+/).slice(2).join(' ').trim();

      if (!issueIdOrKey) {
        return this.reply(event, {
          text: 'Укажи ключ задачи. Пример: comments debug IT-6911',
          buttons
        });
      }

      try {
        const debug = await this.deps.trackerSyncService.getIssueBundleDebug(issueIdOrKey);
        return this.reply(event, {
          text: [
            `Debug bundle — ${debug.issueKey}`,
            `comments: ${debug.commentsCount}`,
            `changelog: ${debug.changelogCount}`,
            `issue.lastCommentUpdatedAt: ${debug.latestCommentAt || '—'}`,
            `issue.updatedAt: ${debug.latestIssueUpdateAt || '—'}`,
            '',
            'Latest comments:',
            ...debug.comments.map((comment) => `- id=${comment.id} at=${comment.updatedAt || comment.createdAt || '—'} by=${comment.author || '—'} type=${comment.type || '—'} transport=${comment.transport || '—'} text=${comment.text || '—'}`),
            '',
            'Latest changelog:',
            ...debug.changelog.map((entry) => `- id=${entry.id} at=${entry.updatedAt || '—'} by=${entry.updatedBy || '—'} type=${entry.type || '—'} changes=${entry.changes.join(', ') || '—'}`)
          ].join('\n'),
          buttons
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError(`Не удалось получить debug bundle по задаче ${issueIdOrKey}.`, error),
          buttons
        });
      }
    }

    if (text.startsWith('issue ') || text.startsWith('bundle ') || text.startsWith('задача ')) {
      const issueIdOrKey = event.text.trim().split(/\s+/).slice(1).join(' ').trim();

      if (!issueIdOrKey) {
        return this.reply(event, {
          text: 'Укажи ключ задачи. Пример: issue CLIENTSERVICE-877',
          buttons
        });
      }

      try {
        const preview = await this.deps.trackerSyncService.getIssueBundlePreview(issueIdOrKey);
        return this.reply(event, {
          text: formatIssueBundlePreview(preview),
          buttons
        });
      } catch (error) {
        return this.reply(event, {
          text: formatFriendlyError(`Не удалось получить preview по задаче ${issueIdOrKey}.`, error),
          buttons
        });
      }
    }

    if (['спросить ai', '🤖 спросить ai', 'ai', 'assistant', 'ассистент'].includes(text)) {
      return this.reply(event, {
        text: this.deps.queryService.getMvpAnswerStub(),
        buttons
      });
    }

    return this.reply(event, {
      text: this.deps.queryService.getMvpAnswerStub(),
      buttons
    });
  }

  private async getMainButtons(event: YandexMessengerEvent): Promise<Array<Array<{ text: string }>>> {
    const login = event.from?.login?.trim();
    const includeDebug = env.app.debugCommands;

    if (!login) return buildMainMenuRows(false, includeDebug);

    try {
      const isManager = await this.deps.managerSummaryService.isManagerLogin(login, true);
      return buildMainMenuRows(isManager, includeDebug);
    } catch {
      return buildMainMenuRows(false, includeDebug);
    }
  }

  private withAnalysisButtons(
    baseButtons: Array<Array<{ text: string }>>,
    issueKeys: string[]
  ): Array<Array<{ text: string }>> {
    const analysisRows = pairButtons(
      Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` }))
    );

    return withMenuAtBottom([...analysisRows, ...baseButtons]);
  }

  private async reply(event: YandexMessengerEvent, message: YandexMessengerReplyMessage) {
    return this.deps.sender.reply(event, message);
  }
}
