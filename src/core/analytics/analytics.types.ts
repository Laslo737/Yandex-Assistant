import type { RequestMetrics } from './request-metrics';

export const SCENARIOS = {
  menu: 'Меню и помощь', my_day: 'Мой день', team: 'Моя команда', changes: 'Изменения',
  digest: 'Дайджест', issue_help: 'Помощь с задачей', issue_analysis: 'Анализ задачи',
  risks: 'Риски по очередям', health: 'Сводка руководителя', preview: 'Просмотр задачи',
  ai_stub: 'Спросить AI (заглушка)', diagnostics: 'Диагностика', other: 'Другое'
} as const;
export const OUTCOMES = {
  processing: 'Обрабатывается', replied: 'Ответ отправлен', access_denied: 'Нет доступа',
  identity_failed: 'Аккаунт не подтверждён', group_rejected: 'Групповой чат',
  service_error: 'Ошибка сервиса', delivery_error: 'Ошибка доставки',
  internal_error: 'Внутренняя ошибка', interrupted: 'Прервано рестартом', no_reply: 'Без ответа'
} as const;
export type Scenario = keyof typeof SCENARIOS;
export type Outcome = keyof typeof OUTCOMES;
export const ERROR_OUTCOMES: Outcome[] = ['service_error', 'delivery_error', 'internal_error', 'interrupted'];
export interface Activity {
  requestId: string; eventHash: string; userKey: string; login: string;
  startedAt: string; scenario: Scenario; outcome: Outcome; durationMs: number; errorCode: string;
  metrics?: RequestMetrics;
}
export interface ActivityFilter {
  since: string; user?: string; scenario?: Scenario; outcome?: Outcome; requestId?: string; page?: number;
}
