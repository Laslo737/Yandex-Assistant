"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantService = void 0;
const env_1 = require("../../../config/env");
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const assistant_formatters_1 = require("../presentation/assistant.formatters");
const changes_formatters_1 = require("../presentation/changes.formatters");
const digest_formatters_1 = require("../presentation/digest.formatters");
const explain_formatters_1 = require("../presentation/explain.formatters");
const issue_help_formatters_1 = require("../presentation/issue-help.formatters");
const health_formatters_1 = require("../presentation/health.formatters");
const manager_formatters_1 = require("../presentation/manager.formatters");
const process_analysis_formatters_1 = require("../presentation/process-analysis.formatters");
const tracker_formatters_1 = require("../presentation/tracker.formatters");
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
function pairButtons(buttons) {
    const rows = [];
    for (let index = 0; index < buttons.length; index += 2) {
        rows.push(buttons.slice(index, index + 2));
    }
    return rows;
}
function limitButtonRows(rows, maxButtons = 12) {
    const result = [];
    let count = 0;
    for (const row of rows) {
        if (count >= maxButtons)
            break;
        const nextRow = row.slice(0, Math.max(0, maxButtons - count));
        if (!nextRow.length)
            continue;
        result.push(nextRow);
        count += nextRow.length;
    }
    return result;
}
function withMenuAtBottom(rows, maxButtons = 12) {
    const contentRows = rows.filter((row) => !(row.length === 1 && row[0]?.text === 'Меню'));
    const limitedContent = limitButtonRows(contentRows, Math.max(0, maxButtons - 1));
    return [...limitedContent, MENU_ROW];
}
function buildChangesEntryRows(isManager) {
    return withMenuAtBottom([
        [{ text: '🕒 Изменения: мои задачи' }],
        ...(isManager ? [[{ text: '🕒 Изменения: команда' }]] : [])
    ]);
}
function buildChangesPeriodRows(scope) {
    return withMenuAtBottom([
        [
            { text: scope === 'my' ? '🕒 Мои 24ч' : '🕒 Команда 24ч' },
            { text: scope === 'my' ? '🕒 Мои 7д' : '🕒 Команда 7д' }
        ],
        [CHANGES_ROW[0]]
    ]);
}
function buildChangesSummaryRows(issueKeys, scope, isManager) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
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
function buildMyDayRows(issueKeys) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
    return withMenuAtBottom([
        ...analysisRows,
        ASK_AI_ROW,
        [CHANGES_ROW[0]],
        [{ text: '🗓 Мой день' }]
    ]);
}
function buildManagerSummaryRows(issueKeys) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
    return withMenuAtBottom([
        ...analysisRows,
        PROCESS_ANALYSIS_ROW,
        [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
    ]);
}
function buildDigestRows(issueKeys, _isManager) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
    return withMenuAtBottom([
        ...analysisRows,
        ASK_AI_ROW,
        MANAGER_BRIEFING_ROW
    ]);
}
function buildHealthRows(issueKeys) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
    return withMenuAtBottom([
        ...analysisRows,
        PROCESS_ANALYSIS_ROW,
        [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
    ]);
}
function buildProcessAnalysisRows(issueKeys) {
    const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
        .slice(0, 6)
        .map((key) => ({ text: `🔎 Анализ ${key}` })));
    return withMenuAtBottom([
        ...analysisRows,
        MANAGER_BRIEFING_ROW,
        [{ text: '👥 Моя команда' }, { text: '🕒 Изменения: команда' }]
    ]);
}
function buildIssueAnalysisRows(issueKey) {
    return withMenuAtBottom([
        [{ text: `Анализ ${issueKey}` }],
        ISSUE_HELP_ROW,
        ASK_AI_ROW,
        MANAGER_BRIEFING_ROW
    ]);
}
function buildMainMenuRows(isManager, includeDebug) {
    const rows = [
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
function formatFriendlyError(title, error) {
    const typed = error;
    return [
        title,
        typed?.message ? `Причина: ${typed.message}` : 'Попробуйте еще раз чуть позже.'
    ].join('\n');
}
function formatLoginRequired() {
    return 'Не удалось определить ваш login в Yandex Messenger. Нужен login текущей учетной записи Yandex 360.';
}
function normalizeIncomingText(text) {
    return text
        .trim()
        .replace(/^\//, '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .trim()
        .toLowerCase();
}
class AssistantService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async handleEvent(event) {
        if (event.type === 'system')
            return;
        if (event.chat?.type !== 'private') {
            return this.reply(event, { text: 'Данные Tracker доступны только в личном чате с ботом.' });
        }
        const login = event.from?.login?.trim();
        if (!event.text?.trim()) {
            return this.reply(event, {
                text: 'Пока поддерживаются только текстовые сообщения. Напишите: помощь',
                buttons: await this.getMainButtons(event)
            });
        }
        const text = normalizeIncomingText(event.text);
        // Self-diagnostic: reveal only the login supplied by the verified Messenger webhook,
        // only to the sender in their private chat. Does not accept a login from message text.
        if (text === 'whoami' || text === 'мой логин') {
            return this.reply(event, { text: login
                    ? `Ваш login из события Yandex Messenger: ${login}`
                    : 'Yandex Messenger не передал login в этом событии.' });
        }
        // Resolve identity for every data request; never infer it from message text.
        const identity = login ? await this.deps.authorization.resolveIdentity(login) : undefined;
        if (!identity) {
            return this.reply(event, { text: 'Не удалось подтвердить вашу учетную запись в Tracker. Попробуйте позже.' });
        }
        const userId = identity.id;
        const buttons = await this.getMainButtons(event);
        if (['start', 'help', 'menu', 'меню', 'помощь', '📋 меню'].includes(text)) {
            const isManager = login ? await this.deps.managerSummaryService.isManagerLogin(login).catch(() => false) : false;
            return this.reply(event, { text: (0, assistant_formatters_1.formatWelcomeMessage)(isManager), buttons });
        }
        if (['vision', 'идея', 'видение'].includes(text)) {
            return this.reply(event, { text: (0, assistant_formatters_1.formatVisionMessage)(), buttons });
        }
        if (['roadmap', 'план'].includes(text)) {
            return this.reply(event, { text: (0, assistant_formatters_1.formatRoadmapMessage)(), buttons });
        }
        if (['мой день', '🗓 мой день', 'что у меня сегодня', 'мои задачи', 'my day'].includes(text)) {
            if (!login) {
                return this.reply(event, {
                    text: formatLoginRequired(),
                    buttons
                });
            }
            try {
                const summary = await this.deps.workdayService.getMyDayByLogin(login, userId, {
                    skipIssueAuthorization: true,
                    assigneeLogin: identity.trackerLogin
                });
                return this.reply(event, {
                    text: (0, tracker_formatters_1.formatMyDaySummary)(summary),
                    buttons: buildMyDayRows(summary.topTasks.map((task) => task.key))
                });
            }
            catch (error) {
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
                const summary = await this.deps.managerSummaryService.getSummaryByLogin(login, userId);
                return this.reply(event, {
                    text: (0, manager_formatters_1.formatManagerSummary)(summary),
                    buttons: buildManagerSummaryRows(summary.topTasks.map((task) => task.key))
                });
            }
            catch (error) {
                return this.reply(event, {
                    text: formatFriendlyError('Не удалось собрать модуль "Моя команда".', error),
                    buttons
                });
            }
        }
        if (['что изменилось', 'изменения', '🕒 изменения'].includes(text)) {
            const isManager = login ? await this.deps.managerSummaryService.isManagerLogin(login).catch(() => false) : false;
            return this.reply(event, {
                text: (0, changes_formatters_1.formatChangesEntryPoint)(isManager),
                buttons: buildChangesEntryRows(isManager)
            });
        }
        if (['изменения: мои задачи', 'изменения мои задачи', '🕒 изменения: мои задачи'].includes(text)) {
            return this.reply(event, {
                text: (0, changes_formatters_1.formatChangesPeriodPicker)('my'),
                buttons: buildChangesPeriodRows('my')
            });
        }
        if (['изменения: моя команда', 'изменения моя команда', 'изменения: команда', '🕒 изменения: команда'].includes(text)) {
            return this.reply(event, {
                text: (0, changes_formatters_1.formatChangesPeriodPicker)('team'),
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
                const summary = await this.deps.changesService.getMyChangesByLogin(login, periodHours, userId, identity.trackerLogin);
                return this.reply(event, {
                    text: (0, changes_formatters_1.formatChangesSummary)(summary),
                    buttons: buildChangesSummaryRows(summary.topTasks.map((task) => task.key), 'my', false)
                });
            }
            catch (error) {
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
                const summary = await this.deps.changesService.getTeamChangesByLogin(login, periodHours, userId);
                return this.reply(event, {
                    text: (0, changes_formatters_1.formatChangesSummary)(summary),
                    buttons: buildChangesSummaryRows(summary.topTasks.map((task) => task.key), 'team', true)
                });
            }
            catch (error) {
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
                const digest = await this.deps.digestService.getOnDemandDigestByLogin(login, userId, identity.trackerLogin);
                return this.reply(event, {
                    text: (0, digest_formatters_1.formatCombinedDigest)({
                        employee: (0, digest_formatters_1.formatEmployeeDigest)({ ...digest.employee, login }),
                        manager: digest.manager ? (0, digest_formatters_1.formatManagerDigest)(digest.manager) : undefined
                    }),
                    buttons: buildDigestRows([
                        ...digest.employee.topTasks.map((task) => task.key),
                        ...(digest.manager?.topTasks.map((task) => task.key) || [])
                    ], Boolean(digest.manager))
                });
            }
            catch (error) {
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
            const issueKey = (0, tracker_links_1.extractTrackerIssueKey)(event.text);
            if (!issueKey || !(await this.checkIssueAccess(event, userId, issueKey)))
                return;
            try {
                const result = await this.deps.issueHelpService.handleMessage(event.text.trim());
                return this.reply(event, {
                    text: (0, issue_help_formatters_1.formatIssueHelpResult)(result),
                    buttons: buildIssueAnalysisRows(result.issueKey)
                });
            }
            catch (error) {
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
                const analysis = await this.deps.processAnalysisService.getProcessAnalysisByLogin(login, userId);
                return this.reply(event, {
                    text: (0, process_analysis_formatters_1.formatProcessAnalysis)(analysis),
                    buttons: buildProcessAnalysisRows(analysis.topTasks.map((task) => task.key))
                });
            }
            catch (error) {
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
                const health = await this.deps.healthService.getHealthByLogin(login, userId);
                return this.reply(event, {
                    text: (0, health_formatters_1.formatHealthCheck)(health),
                    buttons: buildHealthRows(health.topTasks.map((task) => task.key))
                });
            }
            catch (error) {
                return this.reply(event, {
                    text: formatFriendlyError('Не удалось собрать состояние команды.', error),
                    buttons
                });
            }
        }
        if (text.startsWith('анализ ') ||
            text.startsWith('analyze ') ||
            text.startsWith('analysis ') ||
            text.startsWith('анализ задачи ') ||
            text.startsWith('помощь с задачей ')) {
            const explicitIssueKey = (0, tracker_links_1.extractTrackerIssueKey)(event.text);
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
            if (!(await this.checkIssueAccess(event, userId, issueIdOrKey)))
                return;
            try {
                const result = await this.deps.issueExplainService.analyzeIssue(issueIdOrKey);
                let aiSummary;
                if (this.deps.issueExplainAiService?.isEnabled()) {
                    try {
                        aiSummary = await this.deps.issueExplainAiService.generateSummary(result);
                    }
                    catch {
                        aiSummary = undefined;
                    }
                }
                return this.reply(event, {
                    text: (0, explain_formatters_1.formatIssueAnalysis)({ ...result, aiSummary }),
                    buttons: buildIssueAnalysisRows(result.issueKey)
                });
            }
            catch (error) {
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
                text: (0, tracker_formatters_1.formatTrackerConnectionPreview)(preview),
                buttons
            });
        }
        if (text.startsWith('comments debug ') || text.startsWith('issue debug ') || text.startsWith('bundle debug ')) {
            return this.reply(event, { text: 'Отладочные команды недоступны.' });
        }
        if (text.startsWith('issue ') || text.startsWith('bundle ') || text.startsWith('задача ')) {
            const issueIdOrKey = event.text.trim().split(/\s+/).slice(1).join(' ').trim();
            if (!issueIdOrKey) {
                return this.reply(event, {
                    text: 'Укажи ключ задачи. Пример: issue CLIENTSERVICE-877',
                    buttons
                });
            }
            if (!(await this.checkIssueAccess(event, userId, issueIdOrKey)))
                return;
            try {
                const preview = await this.deps.trackerSyncService.getIssueBundlePreview(issueIdOrKey);
                return this.reply(event, {
                    text: (0, tracker_formatters_1.formatIssueBundlePreview)(preview),
                    buttons
                });
            }
            catch (error) {
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
    async checkIssueAccess(event, userId, issueKey) {
        const decision = await this.deps.authorization.canReadIssue(userId, issueKey);
        if (!decision.allowed) {
            await this.reply(event, {
                text: decision.reason === 'AUTH_CHECK_FAILED'
                    ? 'Не удалось проверить доступ к задаче. Попробуйте позже.'
                    : 'Нет доступа к задаче или задача не найдена.'
            });
        }
        return decision.allowed;
    }
    async getMainButtons(event) {
        const login = event.from?.login?.trim();
        const includeDebug = env_1.env.app.debugCommands;
        if (!login)
            return buildMainMenuRows(false, includeDebug);
        try {
            const isManager = await this.deps.managerSummaryService.isManagerLogin(login);
            return buildMainMenuRows(isManager, includeDebug);
        }
        catch {
            return buildMainMenuRows(false, includeDebug);
        }
    }
    withAnalysisButtons(baseButtons, issueKeys) {
        const analysisRows = pairButtons(Array.from(new Set(issueKeys.filter(Boolean)))
            .slice(0, 6)
            .map((key) => ({ text: `🔎 Анализ ${key}` })));
        return withMenuAtBottom([...analysisRows, ...baseButtons]);
    }
    async reply(event, message) {
        return this.deps.sender.reply(event, message);
    }
}
exports.AssistantService = AssistantService;
