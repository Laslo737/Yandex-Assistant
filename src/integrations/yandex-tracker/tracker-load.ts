import { AsyncLocalStorage } from 'node:async_hooks';

export type TrackerLoadCode = 'TRACKER_QUEUE_FULL' | 'TRACKER_QUEUE_TIMEOUT' | 'TRACKER_REQUEST_TIMEOUT'
  | 'TRACKER_OPERATION_TIMEOUT' | 'MY_DAY_TIMEOUT' | 'MY_DAY_BUSY';
export class TrackerLoadError extends Error {
  constructor(readonly code: TrackerLoadCode) { super(code); this.name = 'TrackerLoadError'; }
}

export class TrackerHttpError extends Error {
  constructor(readonly status: number) { super(`Tracker API HTTP ${status}`); this.name = 'TrackerHttpError'; }
}

export function trackerLoadMessage(error: unknown): string | undefined {
  if (error instanceof TrackerLoadError) {
    if (error.code === 'TRACKER_QUEUE_FULL' || error.code === 'MY_DAY_BUSY') {
      return 'Сейчас много обращений к боту. Попробуйте ещё раз через минуту.';
    }
    if (error.code === 'TRACKER_QUEUE_TIMEOUT') return 'Не удалось дождаться свободного места в очереди Tracker. Попробуйте чуть позже.';
    return 'Загрузка данных Tracker заняла слишком много времени. Попробуйте ещё раз чуть позже.';
  }
  if (error instanceof TrackerHttpError && error.status === 429) return 'Tracker временно ограничил частоту запросов. Попробуйте через минуту.';
  return undefined;
}

export const trackerExecution = new AsyncLocalStorage<AbortSignal>();
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new TrackerLoadError('TRACKER_OPERATION_TIMEOUT');
}
export async function abortable<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw abortReason(signal);
  let listener: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    listener = () => reject(abortReason(signal));
    signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(() => { if (signal.aborted) throw abortReason(signal); return action(); }), cancelled]); }
  finally { signal.removeEventListener('abort', listener); }
}
export async function withTrackerDeadline<T>(milliseconds: number, action: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TrackerLoadError('MY_DAY_TIMEOUT')), milliseconds);
  try { return await trackerExecution.run(controller.signal, () => abortable(controller.signal, action)); }
  finally {
    clearTimeout(timer);
    // Allow cancelled queue/HTTP promises to record their counters before the enclosing activity finishes.
    if (controller.signal.aborted) await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
