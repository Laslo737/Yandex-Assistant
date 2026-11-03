import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../config/env';
import { privateContactsFromAnalytics } from '../core/digest/contact-import';
import { DigestStore } from '../core/digest/digest.store';
import { IssueAuthorizationService } from '../core/authorization/application/issue-authorization.service';
import { TrackerApiClient } from '../integrations/yandex-tracker/tracker.client';
import { trackerBackground } from '../integrations/yandex-tracker/tracker-dispatcher';
import { withTrackerDeadline } from '../integrations/yandex-tracker/tracker-load';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) throw new Error('Usage: digest-import-contacts.js [--apply]');
  // Never import/subscribe recipients while scheduled sending is enabled.
  if (env.digest.enabled) throw new Error('DISABLE_DAILY_DIGEST_BEFORE_IMPORT');
  const contacts = privateContactsFromAnalytics(env.admin.databasePath);
  console.info(`DIGEST_IMPORT_CANDIDATES: ${contacts.length}`);
  if (!args.includes('--apply')) { console.info('DRY_RUN: no writes or API calls'); return; }
  const tracker = new TrackerApiClient();
  if (!env.tracker.enabled || !tracker.isConfigured()) throw new Error('TRACKER_NOT_CONFIGURED');
  const authorization = new IssueAuthorizationService(tracker);
  const store = new DigestStore(env.digest.databasePath);
  let imported = 0; let unresolved = 0;
  try {
    for (const login of contacts) {
      const identity = await trackerBackground.run(true, () => withTrackerDeadline(30_000, () => authorization.resolveIdentity(login)));
      if (identity) { store.recordContact(login, identity.id); imported++; } else unresolved++;
      await sleep(1000);
    }
    console.info(`DIGEST_IMPORT_DONE: verified=${imported}; unresolved=${unresolved}`);
  } finally { store.close(); }
}
void main().catch(() => { console.error('DIGEST_IMPORT_FAILED: check config/schema; no recipient names or secrets logged'); process.exitCode = 1; });
