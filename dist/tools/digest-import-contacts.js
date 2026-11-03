"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:timers/promises");
const env_1 = require("../config/env");
const contact_import_1 = require("../core/digest/contact-import");
const digest_store_1 = require("../core/digest/digest.store");
const issue_authorization_service_1 = require("../core/authorization/application/issue-authorization.service");
const tracker_client_1 = require("../integrations/yandex-tracker/tracker.client");
const tracker_dispatcher_1 = require("../integrations/yandex-tracker/tracker-dispatcher");
const tracker_load_1 = require("../integrations/yandex-tracker/tracker-load");
async function main() {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--apply'))
        throw new Error('Usage: digest-import-contacts.js [--apply]');
    // Never import/subscribe recipients while scheduled sending is enabled.
    if (env_1.env.digest.enabled)
        throw new Error('DISABLE_DAILY_DIGEST_BEFORE_IMPORT');
    const contacts = (0, contact_import_1.privateContactsFromAnalytics)(env_1.env.admin.databasePath);
    console.info(`DIGEST_IMPORT_CANDIDATES: ${contacts.length}`);
    if (!args.includes('--apply')) {
        console.info('DRY_RUN: no writes or API calls');
        return;
    }
    const tracker = new tracker_client_1.TrackerApiClient();
    if (!env_1.env.tracker.enabled || !tracker.isConfigured())
        throw new Error('TRACKER_NOT_CONFIGURED');
    const authorization = new issue_authorization_service_1.IssueAuthorizationService(tracker);
    const store = new digest_store_1.DigestStore(env_1.env.digest.databasePath);
    let imported = 0;
    let unresolved = 0;
    try {
        for (const login of contacts) {
            const identity = await tracker_dispatcher_1.trackerBackground.run(true, () => (0, tracker_load_1.withTrackerDeadline)(30_000, () => authorization.resolveIdentity(login)));
            if (identity) {
                store.recordContact(login, identity.id);
                imported++;
            }
            else
                unresolved++;
            await (0, promises_1.setTimeout)(1000);
        }
        console.info(`DIGEST_IMPORT_DONE: verified=${imported}; unresolved=${unresolved}`);
    }
    finally {
        store.close();
    }
}
void main().catch(() => { console.error('DIGEST_IMPORT_FAILED: check config/schema; no recipient names or secrets logged'); process.exitCode = 1; });
