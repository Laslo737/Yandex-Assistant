import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { env } from '../../config/env';
import { ScheduledSendError, YandexMessengerClient } from './yandex-messenger.client';

test('scheduled Messenger POST: one attempt, no typing, definite 429 preserved, success does not require JSON', async () => {
  let requests = 0; let status = 429; let received: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    requests++; assert.equal(req.url, '/bot/v1/messages/sendText/');
    let body = ''; for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.writeHead(status, { 'Retry-After': '2' }); res.end('not json');
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  env.yandexMessenger.apiBaseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  env.yandexMessenger.key = 'fixture-only';
  const client = new YandexMessengerClient();
  try {
    await assert.rejects(client.sendTextOnce({ login: 'pilot', payload_id: 'stable', text: 'Report' }, AbortSignal.timeout(1000)),
      (error: ScheduledSendError) => error.status === 429 && error.retryAfterMs === 2000);
    assert.equal(requests, 1);
    assert.deepEqual(received, { login: 'pilot', payload_id: 'stable', text: 'Report' });
    status = 200;
    await client.sendTextOnce({ login: 'pilot', payload_id: 'stable', text: 'Report' }, AbortSignal.timeout(1000));
    assert.equal(requests, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
