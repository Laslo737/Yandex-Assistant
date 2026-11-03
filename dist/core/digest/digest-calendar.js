"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIGEST_TIME_ZONE = void 0;
exports.moscowDate = moscowDate;
exports.nextDate = nextDate;
exports.morningWindow = morningWindow;
exports.deliverySlot = deliverySlot;
exports.priorityRank = priorityRank;
exports.dateOnly = dateOnly;
const node_crypto_1 = require("node:crypto");
exports.DIGEST_TIME_ZONE = 'Europe/Moscow';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: exports.DIGEST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
function moscowDate(now) {
    // Moscow is UTC+03:00 without DST. Use the named zone rather than the server's timezone.
    const parts = dateFormatter.formatToParts(now);
    const part = (type) => parts.find((value) => value.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
function nextDate(date) {
    return new Date(Date.parse(`${date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
}
function morningWindow(now) {
    const date = moscowDate(now);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return { date, weekday: weekday !== 0 && weekday !== 6,
        start: Date.parse(`${date}T09:00:00+03:00`), end: Date.parse(`${date}T10:30:00+03:00`) };
}
function deliverySlot(login, date, start, end) {
    const fraction = (0, node_crypto_1.createHash)('sha256').update(`${date}:${login}`).digest().readUInt32BE(0) / 0x1_0000_0000;
    // Spread recipients across the first 60 minutes, leaving 30 minutes for slow loads/retries.
    return Math.floor(start + fraction * (end - start) * 2 / 3);
}
function priorityRank(priority, priorityKey) {
    const value = (priority || '').toLowerCase();
    if (priorityKey === 'blocker' || value.includes('блокир') || value.includes('blocker'))
        return 3;
    if (priorityKey === 'critical' || value.includes('крит') || value.includes('critical'))
        return 2;
    if (priorityKey === 'high' || value.includes('выс') || value.includes('high'))
        return 1;
    return 0;
}
function dateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return undefined;
    const parsed = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : undefined;
}
