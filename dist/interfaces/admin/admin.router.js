"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validCredentials = validCredentials;
exports.createAdminRouter = createAdminRouter;
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const analytics_types_1 = require("../../core/analytics/analytics.types");
const admin_pages_1 = require("./admin.pages");
const admin_theme_1 = require("./admin.theme");
const digest = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest();
function validCredentials(header, credentials) {
    if (!header?.startsWith('Basic ') || header.length > 2048)
        return false;
    const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = value.indexOf(':');
    if (separator < 0)
        return false;
    // Fixed-size comparison even when username or password length differs.
    const userOk = (0, node_crypto_1.timingSafeEqual)(digest(value.slice(0, separator)), digest(credentials.username));
    const passwordOk = (0, node_crypto_1.timingSafeEqual)(digest(value.slice(separator + 1)), digest(credentials.password));
    return userOk && passwordOk;
}
function createAdminRouter(store, credentials) {
    if (!credentials.username || credentials.username.includes(':') || credentials.password.length < 5) {
        throw new Error('Admin requires a username and a password of at least 5 characters');
    }
    const router = (0, express_1.Router)();
    // Conservative global failure budget: nginx is the only peer on the production loopback.
    // Successful credentials remain usable even when the failure budget is exhausted.
    let failures = 0;
    let windowStarted = Date.now();
    router.use((_req, res, next) => {
        res.set({
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            'X-Robots-Tag': 'noindex, nofollow'
        });
        next();
    });
    router.use((req, res, next) => {
        if (validCredentials(req.headers.authorization, credentials))
            return next();
        if (Date.now() - windowStarted >= 60_000) {
            failures = 0;
            windowStarted = Date.now();
        }
        if (++failures > 30) {
            res.set('Retry-After', '60');
            res.status(429).send('Слишком много попыток входа. Повторите через минуту.');
            return;
        }
        res.set('WWW-Authenticate', 'Basic realm="Copilot Admin", charset="UTF-8"');
        res.status(401).send('Требуется авторизация администратора.');
    });
    router.get('/theme.css', (_req, res) => { res.type('css').send(admin_theme_1.adminCss); });
    router.get('/icon.svg', (_req, res) => {
        res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#5146d8"/><path d="M24 8c2 10 6 14 16 16-10 2-14 6-16 16-2-10-6-14-16-16 10-2 14-6 16-16" fill="white"/></svg>');
    });
    router.get(['/', '/users', '/activity'], (req, res) => {
        const scalar = (name) => typeof req.query[name] === 'string' ? req.query[name].slice(0, 200) : '';
        const days = ['1', '7', '30'].includes(scalar('days')) ? scalar('days') : '7';
        const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
        const page = Math.min(100_000, Math.max(1, Math.floor(Number(scalar('page'))) || 1));
        const scenario = scalar('scenario');
        const outcome = scalar('outcome');
        const query = { days };
        if (req.path === '/users') {
            query.search = scalar('search');
        }
        else if (req.path === '/activity') {
            if (Object.hasOwn(analytics_types_1.SCENARIOS, scenario))
                query.scenario = scenario;
            if (Object.hasOwn(analytics_types_1.OUTCOMES, outcome))
                query.outcome = outcome;
            if (scalar('user'))
                query.user = scalar('user');
            if (scalar('requestId'))
                query.requestId = scalar('requestId');
        }
        try {
            store.cleanup();
            const html = req.path === '/users' ? (0, admin_pages_1.usersPage)(store, since, query, page)
                : req.path === '/activity' ? (0, admin_pages_1.activityPage)(store, { since, page, user: query.user,
                    scenario: query.scenario, outcome: query.outcome,
                    requestId: query.requestId }, query, page)
                    : (0, admin_pages_1.overviewPage)(store, since, days);
            res.type('html').send(html);
        }
        catch {
            console.error('admin.read_failed');
            res.status(503).send('Аналитика временно недоступна. Попробуйте позже.');
        }
    });
    router.use((_req, res) => { res.status(404).send('Раздел не найден'); });
    return router;
}
