import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShortLinkStore } from './short-link-store';

test('short redirect tokens survive reopening and reuse existing URLs without exposing the URL in the token', () => {
  const directory = mkdtempSync(join(tmpdir(), 'digest-links-'));
  const path = join(directory, 'links.sqlite');
  let store = new ShortLinkStore(path);
  try {
    const url = 'https://tracker.example.test/issues?_q=Assignee%3A%20user%40';
    const token = store.remember(url);
    assert.ok(token.length >= 22);
    assert.equal(store.remember(url), token);
    store.close(); store = new ShortLinkStore(path);
    assert.equal(store.resolve(token), url);
    assert.equal(store.remember(url), token);
    assert.equal(store.resolve("' OR 1=1 --"), undefined);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
