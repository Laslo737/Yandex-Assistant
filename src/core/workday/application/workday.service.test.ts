import assert from 'node:assert/strict';
import test from 'node:test';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { WorkdayService } from './workday.service';

test('Digest/default workday counts only authorized issues assigned to the resolved Tracker ID', async () => {
  const tracker = {
    getStatuses: async () => [],
    searchIssues: async () => ({ issues: [
      { id: '1', key: 'IT-1', assignee: { id: 'my-id' }, summary: 'Mine' },
      { id: '2', key: 'IT-2', assignee: { id: 'other-id' }, summary: 'Someone else' },
      { id: '3', key: 'IT-3', assignee: { id: 'my-id' }, summary: 'Private' }
    ], pagination: { totalPages: 1 } })
  } as unknown as TrackerApiClient;
  const authorization = {
    filterReadableIssues: async (_id: string, issues: Array<{ key: string }>) =>
      issues.filter((issue) => issue.key !== 'IT-3')
  } as unknown as IssueAuthorizationService;
  const result = await new WorkdayService(tracker, authorization).getMyDayByLogin('test.user', 'my-id');
  assert.equal(result.totalAssigned, 1);
  assert.equal(result.activeAssigned, 1);
  assert.deepEqual(result.topTasks.map((task) => task.key), ['IT-1']);
});

test('interactive My day uses one verified Tracker login and excludes another assignee', async () => {
  const searches: string[] = [];
  const tracker = {
    getStatuses: async () => [],
    searchIssues: async (payload: { filter: { assignee: string } }) => {
      searches.push(payload.filter.assignee);
      return { issues: [
      { id: '1', key: 'IT-1', assignee: { id: 'my-id' } },
      { id: '2', key: 'IT-2', assignee: { id: 'other-id' } },
      { id: '3', key: 'IT-3', assignee: { id: 'my-id' } }
    ], pagination: { totalPages: 1 } };
    }
  } as unknown as TrackerApiClient;
  const authorization = {
    filterReadableIssues: async () => { throw new Error('ACL must not run for interactive My day'); }
  } as unknown as IssueAuthorizationService;
  const result = await new WorkdayService(tracker, authorization).getMyDayByLogin(
    'test.user', 'my-id', { skipIssueAuthorization: true, assigneeLogin: 'verified.login' }
  );
  assert.deepEqual(searches, ['verified.login']);
  assert.equal(result.activeAssigned, 2);
  assert.deepEqual(result.topTasks.map((task) => task.key), ['IT-1', 'IT-3']);
});
