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
        return { id: 'tracker-id', login: 'worker', email: 'worker@example.com' };
      }
    } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
    const service = new IssueAuthorizationService(tracker);
    assert.equal(await service.resolveUserId('worker@example.com'), 'tracker-id');
    assert.deepEqual(calls, ['worker@example.com', 'worker']);
    calls.length = 0;
    assert.equal(await service.resolveUserId('worker@other.com'), undefined);
    assert.deepEqual(calls, ['worker@other.com']);
  } finally {
    env.yandexMessenger.loginDomain = previous;
  }
});

test('API failure and forbidden service-account fetch fail closed', async () => {
  const tracker = {
    getIssueAuthFields: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); }
  } as unknown as ConstructorParameters<typeof IssueAuthorizationService>[0];
  const service = new IssueAuthorizationService(tracker);
  assert.equal((await service.canReadIssue('user', 'IT-1')).allowed, false);
});
