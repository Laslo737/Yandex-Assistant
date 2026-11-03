import assert from 'node:assert/strict';
import test from 'node:test';
import { TrackerIssue, TrackerQueueUserPermissions, TrackerQueuePermissions } from '../../../integrations/yandex-tracker/tracker.types';
import { evaluateIssueAccess, IssueAuthorizationService } from './issue-authorization.service';
import { env } from '../../../config/env';

const issue: TrackerIssue = {
  id: 'issue-1', key: 'IT-1', queue: { id: 'IT', key: 'IT' }, components: [],
  createdBy: { id: 'author' }, assignee: { id: 'assignee' },
  followers: [{ id: 'follower' }], access: [{ id: 'access', self: 'https://api.tracker.yandex.net/v3/users/access' }]
};
const permission = (permissions: TrackerQueueUserPermissions['permissions'], id = 'user'): TrackerQueueUserPermissions =>
  ({ user: { id }, permissions });
const acl: TrackerQueuePermissions = {
  read: { roles: [{ id: 'follower' }] },
  write: { roles: ['author', 'assignee', 'access'].map((id) => ({ id })) }
};

test('DENY overrides direct, group and role access', () => {
  for (const denied of ['users', 'groups', 'roles'] as const) {
    const response = permission({
      WRITE: { users: [{ id: 'user' }] },
      DENY: { [denied]: [{ id: 'x' }] }
    });
    assert.equal(evaluateIssueAccess(issue, 'user', response, acl).reason, 'QUEUE_DENY');
  }
});

test('direct READ and WRITE via users or groups allow, CREATE and GRANT do not', () => {
  for (const right of ['READ', 'WRITE'] as const) {
    for (const origin of ['users', 'groups'] as const) {
      assert.equal(evaluateIssueAccess(issue, 'user', permission({ [right]: { [origin]: [{ id: 'x' }] } })).allowed, true);
    }
  }
  assert.equal(evaluateIssueAccess(issue, 'user', permission({ GRANT: { users: [{ id: 'user' }] }, CREATE: { groups: [{ id: '4' }] } })).allowed, false);
});

test('all issue roles require matching queue ACL', () => {
  for (const id of ['author', 'assignee', 'follower', 'access']) {
    assert.equal(evaluateIssueAccess(issue, id, permission({}, id), acl).allowed, true);
    assert.equal(evaluateIssueAccess(issue, id, permission({}, id), { read: { roles: [] }, write: { roles: [] } }).allowed, false);
  }
  assert.equal(evaluateIssueAccess(issue, 'unrelated', permission({}), acl).allowed, false);
  // A group in the Access field must not be mistaken for a user with the same ID.
  assert.equal(evaluateIssueAccess({ ...issue, access: [{ id: 'access', self: 'https://api.tracker.yandex.net/v3/groups/access' }] },
    'access', permission({}, 'access'), acl).allowed, false);
});

test('components and unknown response shapes never allow', () => {
  const read = permission({ READ: { groups: [{ id: '4' }] } });
  assert.equal(evaluateIssueAccess({ ...issue, components: [{ id: '41' }] }, 'user', read).reason, 'COMPONENT_UNSUPPORTED');
  assert.equal(evaluateIssueAccess({ ...issue, components: undefined }, 'user', read).allowed, false);
  assert.equal(evaluateIssueAccess(issue, 'user', { ...read, user: { id: 'someone-else' } }).allowed, false);
  assert.equal(evaluateIssueAccess(issue, 'user', permission({ READ: { groups: 'bad' as never } })).allowed, false);
  assert.equal(evaluateIssueAccess(issue, 'user', permission({ DENY: null as never, READ: { users: [{ id: 'user' }] } })).allowed, false);
  assert.equal(evaluateIssueAccess(issue, 'user', permission({}), undefined).allowed, false);
});

test('no full content or queue ACL is fetched before eligibility is established', async () => {
  const calls: string[] = [];
  const tracker = {
    getIssueAuthFields: async () => { calls.push('minimal'); return issue; },
    getQueueUserPermissions: async () => { calls.push('user'); return permission({}, 'follower'); },
    getQueuePermissions: async () => { calls.push('acl'); return acl; }
  } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  const service = new IssueAuthorizationService(tracker);
  assert.equal((await service.canReadIssue('follower', 'IT-1')).allowed, true);
  assert.deepEqual(calls, ['minimal', 'user', 'acl']);
});

test('Messenger email maps to short Tracker login only for the configured organization domain', async () => {
  const previous = env.yandexMessenger.loginDomain;
  env.yandexMessenger.loginDomain = 'example.com';
  try {
    const calls: string[] = [];
    const tracker = {
      getUser: async (candidate: string) => {
        calls.push(candidate);
        if (candidate !== 'worker') throw new Error('Not found');
        return { uid: 8000000000000217, trackerUid: 8000000000000217,
          self: 'https://api.tracker.yandex.net/v3/users/8000000000000217',
          login: 'worker', email: 'worker@example.com' };
      }
    } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
    const service = new IssueAuthorizationService(tracker);
    assert.equal(await service.resolveUserId('worker@example.com'), '8000000000000217');
    assert.deepEqual(calls, ['worker']);
    assert.deepEqual(await service.resolveIdentity('worker@example.com'), { id: '8000000000000217', trackerLogin: 'worker' });
    assert.deepEqual(calls, ['worker']);
    calls.length = 0;
    assert.equal(await service.resolveUserId('worker@other.com'), undefined);
    assert.deepEqual(calls, ['worker@other.com']);
  } finally {
    env.yandexMessenger.loginDomain = previous;
  }
});

test('conflicting Tracker user IDs are rejected', async () => {
  const tracker = { getUser: async () => ({
    id: '8000000000000217', trackerUid: 8000000000000218, login: 'worker'
  }) } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  assert.equal(await new IssueAuthorizationService(tracker).resolveUserId('worker'), undefined);
});

test('fresh search auth projection checks 728 issues with one user/queue ACL lookup, no per-issue GETs', async () => {
  let minimal = 0; let users = 0; let queues = 0;
  const tracker = {
    getIssueAuthFields: async () => { minimal++; throw new Error('must reuse complete projection'); },
    getQueueUserPermissions: async () => { users++; return permission({}, 'assignee'); },
    getQueuePermissions: async () => { queues++; return acl; }
  } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  const service = new IssueAuthorizationService(tracker);
  const complete = { ...issue, access: issue.access!, followers: issue.followers! };
  const batch = Array.from({ length: 728 }, (_, i) => ({ ...complete, id: String(i), key: `IT-${i + 1}` }));
  assert.equal((await service.filterReadableSearchIssues('assignee', batch)).length, 728);
  assert.deepEqual({ minimal, users, queues }, { minimal: 0, users: 1, queues: 1 });
  await service.filterReadableSearchIssues('assignee', batch.slice(0, 1));
  assert.deepEqual({ minimal, users, queues }, { minimal: 0, users: 2, queues: 2 }, 'permissions are fresh per report');
});

test('batch auth retains DENY precedence, component rejection and fail-closed malformed ACL', async () => {
  const complete = { ...issue, access: issue.access!, followers: issue.followers! };
  let rights = permission({ READ: { users: [{ id: 'assignee' }] }, DENY: { groups: [{ id: 'denied' }] } }, 'assignee');
  let calls = 0;
  const tracker = {
    getIssueAuthFields: async () => { throw new Error('must not GET'); },
    getQueueUserPermissions: async () => { calls++; return rights; },
    getQueuePermissions: async () => acl
  } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  const service = new IssueAuthorizationService(tracker);
  assert.equal((await service.filterReadableSearchIssues('assignee', [complete])).length, 0);
  const before = calls;
  assert.equal((await service.filterReadableSearchIssues('assignee', [{ ...complete, components: [{ id: '41' }] }])).length, 0);
  assert.equal(calls, before, 'unsupported components never trigger an allow');
  rights = permission({ READ: { groups: 'bad' as never } }, 'assignee');
  await assert.rejects(service.filterReadableSearchIssues('assignee', [complete]), /Не удалось проверить доступ/);
});

test('incomplete search auth fields always fall back to canonical GET, including missing empty arrays', async () => {
  const complete = { ...issue, access: issue.access!, followers: issue.followers! };
  for (const field of ['components', 'followers', 'access', 'createdBy', 'assignee', 'queue'] as const) {
    let gets = 0;
    const tracker = {
      getIssueAuthFields: async () => { gets++; return { ...complete, components: [{ id: 'restricted' }] }; },
      getQueueUserPermissions: async () => { throw new Error('must not allow restricted canonical issue'); }
    } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
    const incomplete = { ...complete, [field]: undefined };
    assert.equal((await new IssueAuthorizationService(tracker).filterReadableSearchIssues('assignee', [incomplete])).length, 0);
    assert.equal(gets, 1, field);
  }
  const missing = { ...complete, components: undefined };
  const failed = { getIssueAuthFields: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  await assert.rejects(new IssueAuthorizationService(failed).filterReadableSearchIssues('assignee', [missing]), /Не удалось проверить доступ/);
});

test('API failure and forbidden service-account fetch fail closed', async () => {
  const tracker = {
    getIssueAuthFields: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }
  } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  const service = new IssueAuthorizationService(tracker);
  assert.equal((await service.canReadIssue('user', 'IT-1')).allowed, false);
  await assert.rejects(service.filterReadableIssues('user', [issue], true), /Не удалось проверить доступ/);
});
