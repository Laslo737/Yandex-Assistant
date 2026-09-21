"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueHelpService = void 0;
const tracker_links_1 = require("../../../shared/utils/tracker-links");
const issue_context_pack_builder_1 = require("./issue-context-pack.builder");
function parseIntent(text) {
    const normalized = text.toLowerCase();
    if (normalized.includes('саммари') || normalized.includes('summary') || normalized.includes('кратко')) {
        return 'summary';
    }
    if (normalized.includes('почему') ||
        normalized.includes('не двига') ||
        normalized.includes('застр') ||
        normalized.includes('встала') ||
        normalized.includes('встал') ||
        normalized.includes('blocked') ||
        normalized.includes('чего жд') ||
        normalized.includes('кого жд') ||
        normalized.includes('ожида') ||
        normalized.includes('ждем') ||
        normalized.includes('ждём')) {
        return 'why-stuck';
    }
    if (normalized.includes('что делать') ||
        normalized.includes('дальше') ||
        normalized.includes('next step') ||
        normalized.includes('следующ')) {
        return 'next-step';
    }
    if (normalized.includes('что произошло') ||
        normalized.includes('история') ||
        normalized.includes('произошло') ||
        normalized.includes('happened')) {
        return 'what-happened';
    }
    return 'generic';
}
function intentLabel(intent) {
    switch (intent) {
        case 'summary':
            return 'сделать саммари по задаче';
        case 'why-stuck':
            return 'объяснить, почему задача не двигается';
        case 'next-step':
            return 'подсказать, что делать дальше';
        case 'what-happened':
            return 'кратко рассказать, что уже произошло по задаче';
        default:
            return 'помочь разобраться с задачей';
    }
}
class IssueHelpService {
    deps;
    aiAnswerCache = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    canHandleMessage(text) {
        // Any message containing a Tracker issue key is a valid issue-help request.
        // This also supports natural follow-up questions after opening the menu,
        // without requiring the user to repeat a predefined command phrase.
        return Boolean((0, tracker_links_1.extractTrackerIssueKey)(text));
    }
    getEntryPrompt() {
        return [
            '🆘 Помощь с задачей',
            'Опишите, что хотите узнать по задаче, и пришлите ключ или ссылку на нее.',
            '',
            'Примеры:',
            '• Сделай саммари задачи IT-7574',
            '• Почему задача IT-7574 не двигается?',
            `• Что делать дальше по задаче ${(0, tracker_links_1.buildTrackerIssueUrl)('IT-7574')}`
        ].join('\n');
    }
    async handleMessage(text) {
        const issueKey = (0, tracker_links_1.extractTrackerIssueKey)(text);
        if (!issueKey) {
            throw new Error('Не удалось распознать ключ задачи. Пришлите ключ вида IT-7574 или ссылку на задачу Tracker.');
        }
        const normalizedRequest = text.trim();
        const intent = parseIntent(text);
        const [bundle, explain] = await Promise.all([
            this.deps.trackerSyncService.fetchIssueBundle(issueKey),
            this.deps.issueExplainService.analyzeIssue(issueKey)
        ]);
        const cacheKey = `${issueKey}::${intent}`;
        const cached = this.aiAnswerCache.get(cacheKey);
        const now = Date.now();
        if (cached && cached.expiresAt > now && cached.issueUpdatedAt === bundle.issue.updatedAt) {
            return {
                ...cached.value,
                contextPack: {
                    ...cached.value.contextPack,
                    userRequest: normalizedRequest,
                    intent
                },
                request: intentLabel(intent)
            };
        }
        const contextPack = (0, issue_context_pack_builder_1.buildIssueContextPack)({
            issueKey,
            userRequest: normalizedRequest,
            intent,
            bundle,
            explain
        });
        let aiAnswer;
        let aiUsed = false;
        if (this.deps.issueHelpAiService?.isEnabled()) {
            try {
                aiAnswer = await this.deps.issueHelpAiService.generateAnswer(contextPack);
                aiUsed = true;
            }
            catch {
                aiAnswer = undefined;
                aiUsed = false;
            }
        }
        const result = {
            request: intentLabel(intent),
            issueKey,
            intent,
            contextPack,
            explain,
            llmContextPreview: (0, issue_context_pack_builder_1.formatCompactIssueContextPackForLlm)(contextPack),
            aiAnswer,
            aiUsed
        };
        if (aiUsed) {
            this.aiAnswerCache.set(cacheKey, {
                expiresAt: now + 15 * 60 * 1000,
                issueUpdatedAt: bundle.issue.updatedAt,
                value: result
            });
        }
        return result;
    }
}
exports.IssueHelpService = IssueHelpService;
