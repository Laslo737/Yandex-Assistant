"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
class QueryService {
    getSupportedQuestions() {
        return [
            'что у меня сегодня важное?',
            'какие мои задачи просрочены?',
            'какие задачи никто не трогал неделю?',
            'какая очередь сейчас перегружена?',
            'кто держит задачи слишком долго?',
            'покажи риски по очередям',
            'анализ PRILOZHENIE-71'
        ];
    }
    getMvpAnswerStub() {
        return [
            'Пока лучше всего я помогаю через готовые вопросы и сценарии.',
            'Можно написать, например:',
            '',
            ...this.getSupportedQuestions().map((question) => `- ${question}`),
            '',
            'Или вернитесь в «Меню» и откройте нужный раздел.'
        ].join('\n');
    }
}
exports.QueryService = QueryService;
