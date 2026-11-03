import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AnalyticsStore } from '../../core/analytics/analytics.store';
import { newRequestMetrics } from '../../core/analytics/request-metrics';
import { createAdminRouter, validCredentials } from './admin.router';
import { escapeHtml, input, select } from './admin.components';

const credentials = { username: 'admin', password: 'random-test-password-at-least-20' };
const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;

test('admin password minimum is five characters', () => {
  const store = new AnalyticsStore(':memory:');
  try {
    for (const password of ['', '1234']) {
      assert.throws(() => createAdminRouter(store, { username: 'admin', password }), /at least 5/);
    }
    assert.doesNotThrow(() => createAdminRouter(store, { username: 'admin', password: '12345' }));
    const header = `Basic ${Buffer.from('admin:12345').toString('base64')}`;
    assert.equal(validCredentials(header, { username: 'admin', password: '12345' }), true);
  } finally { store.close(); }
});

test('shared filter controls keep labels, select affordance and escaped placeholders', () => {
  const field = input('search', 'Логин', '<unsafe>', 'Введите "логин"');
  assert.match(field, /<label>Логин<input type="search"/);
  assert.match(field, /value="&lt;unsafe&gt;"/);
  assert.match(field, /placeholder="Введите &quot;логин&quot;"/);
  const dropdown = select('days', 'Период', { '7': '7 дней' }, '7');
  assert.match(dropdown, /<span class="select-control"><select/);
  assert.match(dropdown, /value="7" selected/);
  assert.match(dropdown, /<\/select><\/span><\/label>/);
});

test('credentials and HTML escaping', () => {
  assert.equal(validCredentials(authorization, credentials), true);
  assert.equal(validCredentials('Basic !!!!', credentials), false);
  assert.equal(validCredentials('Bearer secret', credentials), false);
  assert.equal(validCredentials(undefined, credentials), false);
  assert.equal(validCredentials(`Basic ${Buffer.from('other:random-test-password-at-least-20').toString('base64')}`, credentials), false);
  assert.equal(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
});

test('users defaults to all saved identities; period filters still show only active users', async () => {
  const store = new AnalyticsStore(':memory:', 2);
  const oldDate = new Date(Date.now() - 4 * 86400_000).toISOString();
  for (let i = 0; i < 31; i++) {
    const row = { requestId: `expired-${i}`, eventHash: `expired-${i}`, userKey: `expired-${i}`, login: `expired-${i}@example.test`,
      startedAt: oldDate, scenario: 'my_day' as const, outcome: 'replied' as const, durationMs: 100, errorCode: '' };
    store.begin(row); store.finish(row);
  }
  store.cleanup(Date.now() + 3600_000);
  const app = express(); app.use('/admin', createAdminRouter(store, credentials));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const html = async (path: string) => {
    const response = await fetch(base + path, { headers: { authorization } });
    assert.equal(response.status, 200);
    return response.text();
  };
  try {
    for (const path of ['/admin/users', '/admin/users?days=all', '/admin/users?days=invalid']) {
      const page = await html(path);
      assert.match(page, /value="all" selected>Все пользователи/);
      assert.match(page, /expired-0@example.test/);
      assert.match(page, /Сохранённые действия/);
      assert.match(page, /days=all&amp;search=&amp;page=2/);
      assert.match(page, /days=30">История за 30 дней/);
    }
    assert.match(await html('/admin/users?days=all&page=2'), /expired-9@example.test/);
    const search = await html('/admin/users?days=all&search=EXPIRED-30');
    assert.match(search, /expired-30@example.test/);
    assert.doesNotMatch(search, /expired-0@example.test/);
    for (const days of ['1', '7', '30']) {
      const page = await html(`/admin/users?days=${days}`);
      assert.match(page, new RegExp(`value="${days}" selected`));
      assert.doesNotMatch(page, /expired-\d+@example.test/);
    }
    for (const path of ['/admin?days=all', '/admin/activity?days=all']) {
      assert.match(await html(path), /value="7" selected/);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  }
});

test('admin protects every route, renders safe pages, validates filters and rate-limits failures', async () => {
  const store = new AnalyticsStore(':memory:');
  const row = { requestId: 'req-1', eventHash: 'event-1', userKey: 'user', login: '<script>alert(1)</script>@company',
    startedAt: new Date().toISOString(), scenario: 'my_day' as const, outcome: 'replied' as const, durationMs: 320, errorCode: '', metrics: { ...newRequestMetrics(), dataSource: 'cache' as const, trackerRequests: 2, queueWaitMs: 100 } };
  store.begin(row); store.finish(row);
  const app = express(); app.use('/admin', createAdminRouter(store, credentials));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    for (const path of ['/admin', '/admin/users', '/admin/activity', '/admin/theme.css', '/admin/nonexistent']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(response.headers.get('www-authenticate'));
    }
    for (const path of ['/admin', '/admin/users', '/admin/activity?scenario=__proto__&outcome=constructor&page=-4&days=999']) {
      const response = await fetch(base + path, { headers: { authorization } });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /viewport/);
      assert.match(html, /aria-label="Фильтры"/);
      assert.match(html, /class="filter-actions"/);
      assert.match(html, /class="button button-secondary"/);
      assert.match(html, /class="select-control"/);
      assert.doesNotMatch(html, /<script>/);
      assert.ok(response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
      if (!path.endsWith('/admin')) assert.match(html, /&lt;script&gt;/);
      if (path.includes('/activity')) { assert.match(html, /<details class="load-details">/); assert.match(html, /Из кеша/); }
      if (path === '/admin') assert.match(html, /Нагрузка и кеш/);
    }
    const css = await fetch(base + '/admin/theme.css', { headers: { authorization } });
    assert.equal(css.status, 200); assert.match(await css.text(), /@media/);
    for (let i = 0; i < 26; i++) await fetch(base + '/admin');
    assert.equal((await fetch(base + '/admin')).status, 429);
    assert.equal((await fetch(base + '/admin', { headers: { authorization } })).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  }
});
