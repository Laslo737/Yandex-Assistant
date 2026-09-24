import assert from 'node:assert/strict';
import test from 'node:test';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { ManagerSummaryService } from '../../manager/application/manager-summary.service';
import { ChangesService } from './changes.service';

test('My changes uses the verified login once and skips comments when last comment predates the period', async () => {
  const searches: string[] = [];
  let commentCalls = 0;
  const trackerClient = {
    searchIssues: async (payload: { filter: { assignee: string } }) => {
      searches.push(payload.filter.assignee);
      return { issues: [
        { id: '1', key: 'IT-1', assignee: { id: 'me' },
          updatedAt: new Date().toISOString(), lastCommentUpdatedAt: '2020-01-01T00:00:00Z' },
        { id: '2', key: 'IT-2', assignee: { id: 'me' }, updatedAt: '2020-01-01T00:00:00Z' }
      ],
        pagination: { totalPages: 1 } };
    },
    getIssueChangelog: async () => ({ entries: [] }),
    getIssueComments: async () => { commentCalls++; throw new Error('Unnecessary comments call'); }
  } as unknown as TrackerApiClient;
  const authorization = { filterReadableIssues: async (_id: string, issues: Array<{ key: string }>) => {
    assert.deepEqual(issues.map((issue) => issue.key), ['IT-1']);
    return issues;
  } } as unknown as IssueAuthorizationService;
  const service = new ChangesService({ trackerClient, authorization,
    managerSummaryService: {} as ManagerSummaryService });
  const result = await service.getMyChangesByLogin('me@example.com', 24, 'me', 'me');
  assert.deepEqual(searches, ['me']);
  assert.equal(commentCalls, 0);
  assert.equal(result.changedIssuesCount, 1);
});
