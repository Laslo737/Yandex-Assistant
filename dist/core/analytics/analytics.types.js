"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_OUTCOMES = exports.OUTCOMES = exports.SCENARIOS = void 0;
exports.SCENARIOS = {
    menu: 'Меню и помощь', my_day: 'Мой день', team: 'Моя команда', changes: 'Изменения',
    digest: 'Дайджест', issue_help: 'Помощь с задачей', issue_analysis: 'Анализ задачи',
    risks: 'Риски по очередям', health: 'Сводка руководителя', preview: 'Просмотр задачи',
    ai_stub: 'Спросить AI (заглушка)', diagnostics: 'Диагностика', other: 'Другое'
};
exports.OUTCOMES = {
    processing: 'Обрабатывается', replied: 'Ответ отправлен', access_denied: 'Нет доступа',
    identity_failed: 'Аккаунт не подтверждён', group_rejected: 'Групповой чат',
    service_error: 'Ошибка сервиса', delivery_error: 'Ошибка доставки',
    internal_error: 'Внутренняя ошибка', interrupted: 'Прервано рестартом', no_reply: 'Без ответа'
};
exports.ERROR_OUTCOMES = ['service_error', 'delivery_error', 'internal_error', 'interrupted'];
