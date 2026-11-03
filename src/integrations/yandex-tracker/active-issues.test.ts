import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchActiveIssuesByAssignee, fetchActiveIssuesByQueue } from './active-issues';
import { TrackerApiClient } from './tracker.client';
import { buildMyActiveIssuesUrl, buildTeamActiveIssuesUrl } from '../../shared/utils/tracker-query-links';
import { env } from '../../config/env';

env.tracker.webBaseUrl = 'https://tracker.example.test';
const terminal = ['Закрыт', 'Отменён'];

test('active API query and UI links use identical scope/statuses, without queue/filter overriding query', async () => {
  const calls: string[] = [];
  const client = { searchIssues: async (payload: { query: string; filter?: unknown; queue?: unknown }) => {
    assert.equal(payload.filter, undefined); assert.equal(payload.queue, undefined);
    calls.push(payload.query); return { issues: [], pagination: { totalPages: 1 } };
  } } as unknown as TrackerApiClient;
  await fetchActiveIssuesByAssignee(client, 'worker', terminal, []);
  await fetchActiveIssuesByQueue(client, 'IT', terminal, []);
  assert.equal(calls[0], new URL(buildMyActiveIssuesUrl('worker', terminal)).searchParams.get('_q'));
  assert.equal(calls[1], new URL(buildTeamActiveIssuesUrl(['IT'], terminal)).searchParams.get('_q'));
  assert.match(calls[0], /Assignee: worker@.*Status: !"Закрыт".*Status: !"Отменён"/);
  assert.match(calls[1], /Queue: IT.*Status: !"Закрыт".*Status: !"Отменён"/);
});

test('active pagination reads all pages, deduplicates, and rejects terminal tasks before caller ACL', async () => {
  const pages: number[] = [];
  const client = { searchIssues: async (_payload: unknown, options: { page: number; fields: string[] }) => {
    pages.push(options.page);
    assert.ok(options.fields.includes('statusType')); assert.ok(options.fields.includes('status'));
    return { issues: options.page === 1 ? [
      { id: '1', key: 'IT-1', statusType: { id: 'open' } },
      { id: 'closed', key: 'IT-2', statusType: { id: 'done' } },
      { id: 'cancelled', key: 'IT-3', statusType: { key: 'cancelled' } }
    ] : [
      { id: '1', key: 'IT-1', statusType: { id: 'open' } },
      { id: '2', key: 'IT-4', statusType: { id: 'open' } },
      { id: 'named', key: 'IT-5', status: { display: 'Закрыт' } }
    ], pagination: { totalPages: 2 } };
  } } as unknown as TrackerApiClient;
  assert.deepEqual((await fetchActiveIssuesByQueue(client, 'IT', terminal, ['summary'])).map((i) => i.key), ['IT-1', 'IT-4']);
  assert.deepEqual(pages, [1, 2]);
});

test('missing terminal catalog fails before a search, never silently loads the archive', async () => {
  const client = { searchIssues: async () => { throw new Error('must not query'); } } as unknown as TrackerApiClient;
  await assert.rejects(fetchActiveIssuesByAssignee(client, 'worker', [], []), /TERMINAL_STATUSES_UNAVAILABLE/);
});
