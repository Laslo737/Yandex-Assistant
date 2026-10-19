"use strict";
// Offline smoke: force integrations/admin OFF before loading app/env, even if a production .env exists.
async function main() {
    for (const name of ['ENABLE_YANDEX', 'ENABLE_YANDEX_MESSENGER', 'ENABLE_YANDEX_TRACKER', 'ENABLE_ADMIN']) {
        process.env[name] = 'false';
    }
    process.env.LLM_PROVIDER = 'mock';
    const { createApp } = require('../app');
    const server = createApp().listen(0, '127.0.0.1');
    try {
        await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
        const port = server.address().port;
        const base = `http://127.0.0.1:${port}`;
        const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
        const health = await response.json();
        if (!response.ok || !health.ok || health.interfaces?.yandexMessenger !== false || health.integrations?.tracker?.enabled !== false) {
            throw new Error('OFFLINE_HEALTH_FAILED');
        }
        for (const [path, method] of [['/admin', 'GET'], ['/api/interfaces/yandex-messenger/webhook', 'POST']]) {
            const result = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(5000) });
            await result.text();
            if (result.status !== 404)
                throw new Error('OFFLINE_ROUTES_NOT_DISABLED');
        }
        console.info('RELEASE_SMOKE_OK: health works; Messenger, Tracker and admin disabled; ephemeral loopback port');
    }
    finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(() => resolve()));
    }
}
void main().catch(() => { console.error('RELEASE_SMOKE_FAILED'); process.exitCode = 1; });
