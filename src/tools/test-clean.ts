import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run the same tests from a temporary cwd without .env or inherited application settings.
// Do not rename/read/delete the user's real .env to emulate a fresh checkout.
const root = resolve(__dirname, '../..');
const directory = mkdtempSync(join(tmpdir(), 'yassistant-clean-tests-'));
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: { test: string } };
  const args = pkg.scripts.test.trim().split(/\s+/);
  if (args.shift() !== 'tsx' || args.shift() !== '--test' || args.some((arg) => arg.startsWith('-'))) {
    throw new Error('Unsupported test script format');
  }
  const files = args.flatMap((pattern) => {
    const matches = Array.from(globSync(pattern, { cwd: root }));
    if (!matches.length) throw new Error('Test pattern matched no files');
    return matches.map((file) => resolve(root, file));
  });
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(APP_|ENABLE_|YANDEX_|LLM_|OPENROUTER_|ADMIN_|ANALYTICS_|TRACKER_|MY_DAY_|NODE_ENV$|PORT$)/.test(key)) {
      delete environment[key];
    }
  }
  console.info(`CLEAN_TEST_RUN: no .env or application settings; ${files.length} test files`);
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--test', ...files], {
    cwd: directory, env: environment, stdio: 'inherit'
  });
  if (result.error || result.status !== 0) process.exitCode = result.status || 1;
  else console.info('CLEAN_TESTS_OK');
} catch {
  console.error('CLEAN_TESTS_FAILED'); process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
