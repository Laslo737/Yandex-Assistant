import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { WorkdayService } from './workday.service';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { TrackerLoadError } from '../../../integrations/yandex-tracker/tracker-load';
import { newRequestMetrics, requestMetrics } from '../../analytics/request-metrics';

const options = { cacheTtlMs: 60000, cacheMaxEntries: 512, maxPending: 100, loadTimeoutMs: 1000 };
const interactive = (assigneeLogin: string) => ({ skipIssueAuthorization: true, assigneeLogin });
function setup(extra = {}) {
  let searches = 0, statuses = 0, acl = 0;
  const tracker = {
    getStatuses: async () => { statuses++; await sleep(1); return []; },
    searchIssues: async (payload: { filter: { assignee: string } }) => {
      searches++; await sleep(3);
      const login = payload.filter.assignee;
      return { issues: [{ id: login, key: `TEST-${login}`, assignee: { id: login }, summary: login }], pagination: { totalPages: 1 } };
    }
  };
  const authorization = { filterReadableIssues: async () => { acl++; return []; } };
  const service = new WorkdayService(tracker as unknown as TrackerApiClient,
    authorization as unknown as IssueAuthorizationService, { ...options, ...extra });
  return { service, tracker, counts: () => ({ searches, statuses, acl }) };
}

test('50 simultaneous clicks by one user share a load, then use cache; copies cannot mutate another response', async () => {
  const { service, counts } = setup();
  const metrics = Array.from({ length: 50 }, () => newRequestMetrics());
  const results = await Promise.all(metrics.map((m) => requestMetrics.run(m,
    () => service.getMyDayByLogin('one', 'one', interactive('one')))));
  assert.deepEqual(counts(), { searches: 1, statuses: 1, acl: 0 });
  assert.equal(metrics.filter((m) => m.dataSource === 'fresh').length, 1);
  assert.equal(metrics.filter((m) => m.dataSource === 'shared').length, 49);
  results[0].topTasks[0].summary = 'mutated';
  assert.equal(results[1].topTasks[0].summary, 'one');
  const cached = newRequestMetrics();
  const next = await requestMetrics.run(cached, () => service.getMyDayByLogin('one', 'one', interactive('one')));
  assert.equal(next.topTasks[0].summary, 'one'); assert.equal(cached.dataSource, 'cache');
  assert.equal(next.dataLoadedAt, results[1].dataLoadedAt);
  assert.equal(counts().searches, 1);
});

test('50 different users are isolated, statuses coalesce, and ACL-aware digest bypasses interactive cache', async () => {
  const { service, counts } = setup();
  const result = await Promise.all(Array.from({ length: 50 }, (_, index) => {
    const login = `user${index}`; return service.getMyDayByLogin(login, login, interactive(login));
  }));
  assert.equal(counts().searches, 50); assert.equal(counts().statuses, 1);
  result.forEach((row, index) => assert.equal(row.topTasks[0].summary, `user${index}`));
  const authorized = await service.getMyDayByLogin('user0', 'user0', { assigneeLogin: 'user0' });
  assert.equal(authorized.totalAssigned, 0); assert.equal(counts().acl, 1); assert.equal(counts().searches, 51);
  // Even the same login cannot reuse data belonging to another stable Tracker ID.
  const other = await service.getMyDayByLogin('user0', 'another-id', interactive('user0'));
  assert.equal(other.totalAssigned, 0); assert.equal(counts().searches, 52);
});

test('failed and timed out loads are not cached; pending users are bounded', async () => {
  const { service, tracker } = setup({ maxPending: 1, loadTimeoutMs: 20 });
  let calls = 0;
  tracker.searchIssues = async () => { calls++; throw new Error('failed'); };
  const request = () => service.getMyDayByLogin('one', 'one', interactive('one'));
  await assert.rejects(request()); await assert.rejects(request()); assert.equal(calls, 2);
  const original = tracker.searchIssues;
  tracker.searchIssues = () => new Promise(() => {});
  const first = request();
  const checkFirst = assert.rejects(first, (e: TrackerLoadError) => e.code === 'MY_DAY_TIMEOUT');
  await assert.rejects(service.getMyDayByLogin('two', 'two', interactive('two')),
    (e: TrackerLoadError) => e.code === 'MY_DAY_BUSY');
  await checkFirst;
  tracker.searchIssues = original;
  await assert.rejects(request(), /failed/);
});
