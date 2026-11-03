import { createHash } from 'node:crypto';

export const DIGEST_TIME_ZONE = 'Europe/Moscow';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DIGEST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
export function moscowDate(now: number): string {
  // Moscow is UTC+03:00 without DST. Use the named zone rather than the server's timezone.
  const parts = dateFormatter.formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
}
export function morningWindow(now: number) {
  const date = moscowDate(now);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, weekday: weekday !== 0 && weekday !== 6,
    start: Date.parse(`${date}T09:00:00+03:00`), end: Date.parse(`${date}T10:30:00+03:00`) };
}
export function deliverySlot(login: string, date: string, start: number, end: number): number {
  const fraction = createHash('sha256').update(`${date}:${login}`).digest().readUInt32BE(0) / 0x1_0000_0000;
  // Spread recipients across the first 60 minutes, leaving 30 minutes for slow loads/retries.
  return Math.floor(start + fraction * (end - start) * 2 / 3);
}
export function priorityRank(priority?: string, priorityKey?: string): number {
  const value = (priority || '').toLowerCase();
  if (priorityKey === 'blocker' || value.includes('блокир') || value.includes('blocker')) return 3;
  if (priorityKey === 'critical' || value.includes('крит') || value.includes('critical')) return 2;
  if (priorityKey === 'high' || value.includes('выс') || value.includes('high')) return 1;
  return 0;
}
export function dateOnly(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : undefined;
}
