import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { ManagerSummaryService } from './manager-summary.service';
import { IssueAuthorizationService } from '../../authorization/application/issue-authorization.service';
import { TrackerApiClient } from '../../../integrations/yandex-tracker/tracker.client';

test('simultaneous manager-context loads coalesce queue/status catalogs, failures remain retryable', async () => {
  let queues = 0, statuses = 0;
  const tracker = {
    getUser: async () => ({ id: '123', login: 'lead' }),
    getQueues: async () => { queues++; await sleep(2); return [{ key: 'TEST', lead: { id: '123' } }]; },
    getStatuses: async () => { statuses++; await sleep(2); return []; }
  };
  const service = new ManagerSummaryService(tracker as unknown as TrackerApiClient, {} as IssueAuthorizationService);
  await Promise.all(Array.from({ length: 50 }, () => service.getManagerContextByLogin('lead')));
  assert.equal(queues, 1); assert.equal(statuses, 1);
  const broken = { ...tracker, getQueues: async () => { queues++; throw new Error('failed'); } };
  const failing = new ManagerSummaryService(broken as unknown as TrackerApiClient, {} as IssueAuthorizationService);
  await failing.isManagerLogin('lead'); await failing.isManagerLogin('lead');
  assert.equal(queues, 3);
});
