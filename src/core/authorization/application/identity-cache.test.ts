import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../../../config/env';
import { IssueAuthorizationService } from './issue-authorization.service';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { TrackerLoadError } from '../../../integrations/yandex-tracker/tracker-load';

test('identity lookup coalesces concurrent calls but never caches an unresolved account or hides overload', async () => {
  const oldDomain = env.yandexMessenger.loginDomain;
  env.yandexMessenger.loginDomain = 'example.test';
  try {
    let calls = 0;
    const tracker = { getUser: async () => {
      calls++; await sleep(2);
      return { uid: '123', login: 'test.user', email: 'test.user@example.test' };
    } };
    const service = new IssueAuthorizationService(tracker as unknown as TrackerApiClient);
    const result = await Promise.all(Array.from({ length: 50 }, () => service.resolveIdentity('test.user@example.test')));
    assert.equal(calls, 1); assert.ok(result.every((r) => r?.id === '123'));
    await service.resolveIdentity('test.user@example.test'); assert.equal(calls, 1);
    tracker.getUser = async () => { calls++; throw new TrackerLoadError('TRACKER_QUEUE_FULL'); };
    await assert.rejects(service.resolveIdentity('other@example.test'), TrackerLoadError);
    await assert.rejects(service.resolveIdentity('other@example.test'), TrackerLoadError);
    assert.equal(calls, 3);
  } finally { env.yandexMessenger.loginDomain = oldDomain; }
});
