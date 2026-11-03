import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../config/env';
import { buildMyAllIssuesUrl, buildMyDueTodayIssuesUrl, buildMyOverdueIssuesUrl } from './tracker-query-links';

env.tracker.webBaseUrl = 'https://tracker.example.test';
const query = (url: string) => new URL(url).searchParams.get('_q');
test('metric links preserve exact login marker, escaped terminal names and fixed report date', () => {
  assert.equal(query(buildMyAllIssuesUrl('@user.name')), 'Assignee: user.name@');
  assert.equal(query(buildMyAllIssuesUrl('user.name@')), 'Assignee: user.name@');
  assert.equal(query(buildMyAllIssuesUrl('user@example.test')), 'Assignee: user@example.test@');
  assert.equal(query(buildMyDueTodayIssuesUrl('user', [' Done ', 'Done', 'Closed "yes"'], '2026-11-03')),
    'Assignee: user@ Status: !"Done" Status: !"Closed \\"yes\\"" Deadline: 2026-11-03');
  assert.match(query(buildMyOverdueIssuesUrl('user', ['Done']))!, /Deadline: < today\(\)/);
  assert.match(query(buildMyOverdueIssuesUrl('user', ['Done'], '2026-11-03'))!, /Deadline: < 2026-11-03/);
  assert.throws(() => buildMyDueTodayIssuesUrl('user', [], '2026-02-30'));
  assert.throws(() => buildMyOverdueIssuesUrl('user', [], 'today() OR Queue: SECRET'));
  assert.throws(() => buildMyAllIssuesUrl('user Queue: SECRET'));
});
