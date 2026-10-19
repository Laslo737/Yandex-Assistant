import assert from 'node:assert/strict';
import test from 'node:test';
import { CacheBusyError, ExpiringCache } from './expiring-cache';

test('cache TTL, LRU bounds, single flight and no error cache', async () => {
  let now = 0; let calls = 0;
  const cache = new ExpiringCache<number>(60, 2, 2, () => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all(Array.from({ length: 50 }, () => cache.get('a', load))), Array(50).fill(1));
  assert.equal(await cache.get('a', load), 1);
  now = 60; assert.equal(await cache.get('a', load), 2);
  await cache.get('b', load); await cache.get('a', load); await cache.get('c', load);
  assert.equal(await cache.get('b', load), 5); // b was LRU, not a
  let failed = 0;
  const fail = () => cache.get('fail', async () => { failed++; throw new Error('failed'); });
  await Promise.all([assert.rejects(fail()), assert.rejects(fail())]);
  assert.equal(failed, 1);
  await assert.rejects(fail()); assert.equal(failed, 2);
});

test('cache bounds distinct pending keys, but permits followers of an existing key', async () => {
  const cache = new ExpiringCache<number>(0, 1, 1);
  let release!: (value: number) => void;
  const one = cache.get('a', () => new Promise((r) => { release = r; }));
  const follower = cache.get('a', async () => 99);
  await assert.rejects(cache.get('b', async () => 2), CacheBusyError);
  await Promise.resolve(); release(1);
  assert.deepEqual(await Promise.all([one, follower]), [1, 1]);
  assert.equal(await cache.get('a', async () => 3), 3); // ttl=0 disables stored results
});
