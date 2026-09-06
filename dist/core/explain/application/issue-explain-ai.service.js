"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueExplainAiService = void 0;
function buildSystemPrompt() {
    return [
        'Ты AI-copilot по Yandex Tracker.',
        'Твоя задача: сделать очень короткую управленческую выжимку по одной задаче.',
        'Отвечай только по-русски.',
        'Не выдумывай факты и не добавляй ничего сверх предоставленного контекста.',
        'Не цитируй длинные комментарии дословно, а кратко пересказывай их человеческим языком.',
        'Верни ровно 3 буллета, каждый с новой строки и начиная с "- ".',
        'Буллет 1: главный риск / текущее состояние.',
        'Буллет 2: последний содержательный апдейт простым человеческим языком.',
        'Для второго буллета не используй как главный апдейт чисто административные комментарии про временную смену исполнителя, routing или возврат ownership, если в более раннем содержательном комментарии лучше раскрыт реальный смысл задачи, блокер, правки или ожидаемая ОС.',
        'Буллет 3: следующий практический шаг.',
        'Каждый буллет делай коротким: примерно 1 предложение.',
        'Не используй заголовки, вступления, markdown кроме трех буллетов.',
        'Пиши уверенно и по-деловому. Не добавляй лишнюю осторожность вроде "не хватает деталей", если по контексту уже видна правдоподобная рабочая версия происходящего.',
        'Если в комментарии видна проблема с вариантом решения, формулируй это как суть проблемы: например "текущий вариант выглядит некорректным", а не как сырую цитату.',
        'В третьем буллете формулируй именно управленческое действие: "получить решение", "согласовать подход", "зафиксировать следующий шаг", "перепланировать срок".',
        'Не пиши расплывчато вроде "уточнить, что именно он должен ответить", если из контекста уже ясно, что нужен ответ/решение по текущему варианту.',
        'Если известны длительность зависания/отсутствия движения и вероятный владелец следующего шага, по возможности упоминай это уже в первом или третьем буллете.',
        'Если данных действительно мало, лучше коротко сказать "точный блокер не виден", но только когда это правда нельзя вывести из фактов.'
    ].join('\n');
}
function buildUserPrompt(result) {
    return [
        'Собранные факты по задаче:',
        `- Ключ: ${result.issueKey}`,
        result.summary ? `- Название: ${result.summary}` : null,
        result.assignee ? `- Исполнитель: ${result.assignee}` : null,
        result.status ? `- Статус: ${result.status}` : null,
        result.statusSilenceDays !== undefined ? `- Статус без смены: ${result.statusSilenceDays} дн` : null,
        result.overdue ? `- Просрочка: да${result.overdueDays !== undefined ? `, на ${result.overdueDays} дн` : ''}` : '- Просрочка: нет',
        result.waitingForReply ? '- Ожидание ответа: да' : '- Ожидание ответа: нет',
        result.nextActionOwner ? `- Вероятный следующий шаг у: ${result.nextActionOwner}` : null,
        result.nextActionReason ? `- Почему следующий шаг у него: ${result.nextActionReason}` : null,
        result.lastCommentIntent ? `- Intent последнего содержательного комментария: ${result.lastCommentIntent}` : null,
        result.authorWaitingForExternalReply ? '- Автор последнего содержательного комментария сам ждет внешнюю реакцию: да' : null,
        result.needsApproval ? '- Нужна внешняя проверка/согласование: да' : null,
        result.waitingSubject ? `- Предмет ожидания: ${result.waitingSubject}` : null,
        result.waitingQuestion ? `- Открытый вопрос / запрос: ${result.waitingQuestion}` : null,
        result.blockingReasonHumanized ? `- Человеческое объяснение блокера: ${result.blockingReasonHumanized}` : null,
        result.requestedActionHumanized ? `- Какого действия сейчас ждут: ${result.requestedActionHumanized}` : null,
        result.lastCommentAuthor ? `- Автор последнего содержательного комментария: ${result.lastCommentAuthor}` : null,
        result.lastCommentAt ? `- Последний комментарий: ${result.lastCommentAt}` : null,
        result.lastCommentSnippet ? `- Суть последнего комментария: ${result.lastCommentSnippet}` : null,
        result.lastStatusChangedBy ? `- Последний статус двигал: ${result.lastStatusChangedBy}` : null,
        result.lastStatusChangeAt ? `- Последняя смена статуса: ${result.lastStatusChangeAt}` : null,
        result.recentActivity.length ? `- Последние события: ${result.recentActivity.slice(0, 3).join(' | ')}` : null,
        result.recommendations.length ? `- Rule-based рекомендации: ${result.recommendations.join(' | ')}` : null,
        '',
        'Дополнительные требования к выжимке:',
        '- не повторяй факты дословно из комментария, а коротко перескажи смысл;',
        '- для буллета про последний апдейт приоритетно бери последний содержательный комментарий по сути задачи, а не административный комментарий про назначение исполнителя;',
        '- если видно, что комментарий ставит под сомнение текущий вариант, так и напиши;',
        '- если следующий шаг у конкретного человека уже известен, в третьем буллете пиши действие через него;',
        '- если автор последнего комментария сам ждет внешнюю реакцию, не делай вид, что следующий шаг автоматически у автора;',
        '- если известна длительность зависания или сколько статус не менялся, старайся упоминать это в первом буллете;',
        '- если известен вероятный владелец следующего шага, не прячь это: назови его явно;',
        '- третий буллет должен звучать как конкретное решение/действие, а не как абстрактное уточнение;',
        '',
        'Сделай краткую выжимку ровно в 3 буллетах.'
    ].filter(Boolean).join('\n');
}
class IssueExplainAiService {
    openRouterAiService;
    cache = new Map();
    constructor(openRouterAiService) {
        this.openRouterAiService = openRouterAiService;
    }
    isEnabled() {
        return this.openRouterAiService.isEnabled();
    }
    async generateSummary(result) {
        const cacheKey = `${result.issueKey}::${result.updatedAt || 'no-updated-at'}`;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }
        const text = await this.openRouterAiService.generateText({
            system: buildSystemPrompt(),
            temperature: 0.2,
            messages: [
                {
                    role: 'user',
                    text: buildUserPrompt(result)
                }
            ]
        });
        this.cache.set(cacheKey, {
            expiresAt: now + 15 * 60 * 1000,
            value: text.trim()
        });
        return text.trim();
    }
}
exports.IssueExplainAiService = IssueExplainAiService;
