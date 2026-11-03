import { DigestStore, DigestJob } from './digest.store';
import { morningWindow } from './digest-calendar';
import { trackerBackground } from '../../integrations/yandex-tracker/tracker-dispatcher';
import { withTrackerDeadline } from '../../integrations/yandex-tracker/tracker-load';
import { ScheduledSendError } from '../../interfaces/yandex-messenger/yandex-messenger.client';
import { YandexMessengerReplyMessage } from '../../interfaces/yandex-messenger/yandex-messenger.types';
import { safeErrorCode } from '../analytics/analytics.service';
import { newRequestMetrics, requestMetrics } from '../analytics/request-metrics';

export interface DigestSchedulerOptions { enabled: boolean; intervalMs: number; loadTimeoutMs: number; allowlist: string[]; }
export class DigestScheduler {
  private busy = false;
  private stopped = false;
  private timer?: ReturnType<typeof setInterval>;
  private cooldownUntil = 0;
  private seededAt = 0;
  private recoveredAt = 0;
  constructor(private readonly store: DigestStore, private readonly options: DigestSchedulerOptions,
    private readonly build: (job: DigestJob) => Promise<YandexMessengerReplyMessage>,
    private readonly send: (job: DigestJob, message: YandexMessengerReplyMessage, signal: AbortSignal) => Promise<void>,
    private readonly clock = Date.now) {
    if (!Number.isInteger(options.intervalMs) || options.intervalMs < 1000 || options.intervalMs > 300_000 ||
        !Number.isInteger(options.loadTimeoutMs) || options.loadTimeoutMs < 1000 || options.loadTimeoutMs > 120_000) {
      throw new Error('INVALID_DIGEST_SCHEDULER_SETTINGS');
    }
  }
  start() {
    if (!this.options.enabled || this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.tick().catch(() => console.error('digest.scheduler_failed')); }, 1000);
    this.timer.unref();
    void this.tick().catch(() => console.error('digest.scheduler_failed'));
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async tick() {
    if (!this.options.enabled || this.stopped || this.busy) return;
    this.busy = true;
    try {
      const now = this.clock();
      if (now < this.recoveredAt || now - this.recoveredAt >= 60_000) {
        this.store.recover(now);
        this.recoveredAt = now;
      }
      const window = morningWindow(now);
      if (!window.weekday || now < window.start || now >= window.end || now < this.cooldownUntil) return;
      if (now < this.seededAt || now - this.seededAt >= 60_000) {
        this.store.seed(window.date, window.start, window.end, this.options.allowlist, now);
        this.seededAt = now;
      }
      const job = this.store.claim(now, this.options.intervalMs, this.options.allowlist);
      if (job) await this.deliver(job);
    } finally { this.busy = false; }
  }
  private async deliver(job: DigestJob) {
    let message: YandexMessengerReplyMessage;
    const metrics = newRequestMetrics();
    const started = performance.now();
    try {
      message = await trackerBackground.run(true, () => requestMetrics.run(metrics, () => withTrackerDeadline(
        Math.min(this.options.loadTimeoutMs, Math.max(1, job.expiresAt - this.clock())), () => this.build(job))));
    } catch (error) {
      const known = error instanceof Error && ['DIGEST_IDENTITY_NOT_CONFIRMED', 'DIGEST_STATUSES_UNAVAILABLE'].includes(error.message);
      const code = known ? (error as Error).message : safeErrorCode(error, 'DIGEST_BUILD_FAILED');
      this.retry(job, code, 60_000 * 2 ** Math.min(job.attempts - 1, 3));
      return;
    } finally {
      console.info('digest.build', JSON.stringify({ jobId: job.id, durationMs: Math.round(performance.now() - started),
        trackerRequests: metrics.trackerRequests, tracker429: metrics.tracker429, queueWaitMs: metrics.queueWaitMs }));
    }
    // Re-check opt-out, identity binding and end of the morning window AFTER the potentially slow build.
    if (this.stopped || this.clock() >= job.expiresAt) {
      this.store.finish(job, this.stopped ? 'pending' : 'expired', this.clock()); return;
    }
    if (!this.store.startSending(job, this.clock())) return;
    try {
      const remaining = Math.min(12_000, job.expiresAt - this.clock());
      if (remaining <= 0) { this.store.finish(job, 'expired', this.clock()); return; }
      await this.send(job, { ...message, payloadId: `daily-${job.id}` }, AbortSignal.timeout(remaining));
      this.store.finish(job, 'sent', this.clock());
      console.info('digest.delivery', JSON.stringify({ jobId: job.id, state: 'sent' }));
    } catch (error) {
      if (error instanceof ScheduledSendError && error.status === 429) {
        // A received 429 is a definite rejection, unlike an HTTP/network timeout after a POST.
        this.cooldownUntil = this.clock() + error.retryAfterMs;
        this.store.pauseUntil(this.cooldownUntil);
        this.retry(job, 'MESSENGER_HTTP_429', error.retryAfterMs);
      } else {
        const definiteRejection = error instanceof ScheduledSendError && error.status >= 400 && error.status < 500;
        const state = definiteRejection ? 'failed' : 'uncertain';
        const code = error instanceof ScheduledSendError ? `MESSENGER_HTTP_${error.status}` : 'MESSENGER_SEND_UNCERTAIN';
        this.store.finish(job, state, this.clock(), code);
        if (error instanceof ScheduledSendError && error.status === 401) {
          this.cooldownUntil = this.clock() + 300_000;
          this.store.pauseUntil(this.cooldownUntil);
        }
        console.warn('digest.delivery', JSON.stringify({ jobId: job.id, state, code }));
      }
    }
  }
  private retry(job: DigestJob, code: string, delay: number) {
    const now = this.clock();
    const next = now + Math.max(1000, delay);
    const state = next >= job.expiresAt ? 'expired' : job.attempts >= 3 ? 'failed' : 'pending';
    this.store.finish(job, state, now, code, next);
    console.warn('digest.delivery', JSON.stringify({ jobId: job.id, state, code }));
  }
}
