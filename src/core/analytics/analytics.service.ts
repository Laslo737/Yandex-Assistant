import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { YandexMessengerEvent } from '../../interfaces/yandex-messenger/yandex-messenger.types';
import { Activity, Outcome, Scenario } from './analytics.types';
import { AnalyticsStore } from './analytics.store';
import { newRequestMetrics, requestMetrics } from './request-metrics';
import { TrackerLoadError } from '../../integrations/yandex-tracker/tracker-load';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeErrorCode(error: unknown, fallback: string): string {
  if (error instanceof TrackerLoadError) return error.code;
  const typed = error as { status?: unknown; name?: unknown; code?: unknown } | null;
  if (typeof typed?.status === 'number' && Number.isInteger(typed.status) && typed.status >= 400 && typed.status <= 599) {
    return `HTTP_${typed.status}`;
  }
  if (typed?.name === 'AbortError' || typed?.name === 'TimeoutError') return 'REQUEST_TIMEOUT_OR_ABORT';
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(String(typed?.code))) return String(typed?.code);
  return fallback;
}

/** Context is request-local; parallel handlers never share scenario/outcome state. */
export class AnalyticsService {
  private readonly context = new AsyncLocalStorage<Activity>();
  private lastWarning = 0;
  constructor(private readonly store: AnalyticsStore) {}

  private safe(action: () => void) {
    try { action(); } catch {
      if (Date.now() - this.lastWarning > 60_000) {
        console.error('analytics.storage_failed'); this.lastWarning = Date.now();
      }
    }
  }
  scenario(scenario: Scenario) { const activity = this.context.getStore(); if (activity) activity.scenario = scenario; }
  outcome(outcome: Outcome, errorCode = '') {
    const activity = this.context.getStore();
    if (activity) { activity.outcome = outcome; activity.errorCode = errorCode; }
  }
  replied() {
    if (this.context.getStore()?.outcome === 'processing') this.outcome('replied');
  }

  async track<T>(event: YandexMessengerEvent, handler: () => Promise<T>): Promise<T> {
    if (event.type === 'system') return handler();
    const login = (event.from?.login || '').trim().slice(0, 254);
    const subject = event.from?.id ? `id:${event.from.id}` : login ? `login:${login.toLowerCase()}` : `unknown:${event.eventId}`;
    const activity: Activity = {
      requestId: randomUUID(), eventHash: hash(JSON.stringify(['yandex', event.eventId, subject, event.chat?.id ?? ''])), userKey: hash(subject),
      login: login || 'Неизвестный отправитель', startedAt: new Date().toISOString(),
      scenario: 'other', outcome: 'processing', durationMs: 0, errorCode: '', metrics: newRequestMetrics()
    };
    let recorded = false;
    this.safe(() => { recorded = this.store.begin(activity); });
    const start = performance.now();
    return this.context.run(activity, () => requestMetrics.run(activity.metrics!, async () => {
      try {
        return await handler();
      } catch (error) {
        if (activity.outcome !== 'delivery_error') this.outcome('internal_error', safeErrorCode(error, 'UNHANDLED_ERROR'));
        throw error;
      } finally {
        if (activity.outcome === 'processing') activity.outcome = 'no_reply';
        activity.durationMs = Math.max(0, Math.round(performance.now() - start));
        if (recorded) {
          this.safe(() => this.store.finish(activity));
          // Only safe structured metadata; never serialize error objects, messages or task content.
          console.info('bot.activity', JSON.stringify({ requestId: activity.requestId, scenario: activity.scenario,
            outcome: activity.outcome, durationMs: activity.durationMs, errorCode: activity.errorCode, ...activity.metrics }));
        }
      }
    }));
  }
}
