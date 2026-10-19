"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
// Run the same tests from a temporary cwd without .env or inherited application settings.
// Do not rename/read/delete the user's real .env to emulate a fresh checkout.
const root = (0, node_path_1.resolve)(__dirname, '../..');
const directory = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'yassistant-clean-tests-'));
try {
    const pkg = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(root, 'package.json'), 'utf8'));
    const args = pkg.scripts.test.trim().split(/\s+/);
    if (args.shift() !== 'tsx' || args.shift() !== '--test' || args.some((arg) => arg.startsWith('-'))) {
        throw new Error('Unsupported test script format');
    }
    const files = args.flatMap((pattern) => {
        const matches = Array.from((0, node_fs_1.globSync)(pattern, { cwd: root }));
        if (!matches.length)
            throw new Error('Test pattern matched no files');
        return matches.map((file) => (0, node_path_1.resolve)(root, file));
    });
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) {
        if (/^(APP_|ENABLE_|YANDEX_|LLM_|OPENROUTER_|ADMIN_|ANALYTICS_|TRACKER_|MY_DAY_|NODE_ENV$|PORT$)/.test(key)) {
            delete environment[key];
        }
    }
    console.info(`CLEAN_TEST_RUN: no .env or application settings; ${files.length} test files`);
    const result = (0, node_child_process_1.spawnSync)(process.execPath, [require.resolve('tsx/cli'), '--test', ...files], {
        cwd: directory, env: environment, stdio: 'inherit'
    });
    if (result.error || result.status !== 0)
        process.exitCode = result.status || 1;
    else
        console.info('CLEAN_TESTS_OK');
}
catch {
    console.error('CLEAN_TESTS_FAILED');
    process.exitCode = 1;
}
finally {
    (0, node_fs_1.rmSync)(directory, { recursive: true, force: true });
}
