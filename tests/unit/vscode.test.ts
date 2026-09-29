import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonc } from '../../src/recipes';
import { resolveFileVariables, vscodeTasks } from '../../src/vscode';
import type { VscodeContext } from '../../src/vscode';

const ctx: VscodeContext = { workspace: '/work/app', home: '/home/me', env: { HOME: '/home/me', TOKEN: 'abc' }, packageManager: 'pnpm' };
const sample = () => parseJsonc(readFileSync('tests/projects/vscode-tasks/.vscode/tasks.json', 'utf8'));
const byName = (name: string) => vscodeTasks(sample(), ctx).tasks.find((task) => task.name === name);

test('vscodeTasks: lists shell, process and npm tasks; skips hidden, VS Code-only and contributed types', () => {
	const listing = vscodeTasks(sample(), ctx);
	assert.deepEqual(
		listing.tasks.map((task) => task.name),
		[
			'Build workspace',
			'Build from current open file',
			'Test workspace',
			'Process task',
			'Greet',
			'npm: dev',
			'macOS override',
			'Everything (in sequence)',
			'Both at once, then report',
		]
	);
	assert.deepEqual(listing.skipped, [
		{ name: 'launch:stop', reason: 'uses ${command:workbench.action.terminal.kill}, which only VS Code can provide' },
		{ name: 'Gulp task', reason: '"gulp" tasks come from a VS Code extension' },
	]);
});

test('vscodeTasks: build group binds Build; test group and others only Run', () => {
	assert.equal(byName('Build workspace')?.build, true);
	assert.equal(byName('Build from current open file')?.build, true);
	assert.equal(byName('Test workspace')?.build, false);
});

test('vscodeTasks: commands, quoted args, project variables and env', () => {
	assert.equal(byName('Test workspace')?.line, "echo 'vscode: test' app");
	assert.equal(byName('Process task')?.line, "echo 'vscode: a process task, env' /home/me");
	assert.deepEqual(byName('Greet')?.env, { GREETING: 'hello' });
	assert.equal(byName('macOS override')?.line, "echo 'vscode: macOS override used'");
});

test('vscodeTasks: npm tasks use the project package manager, in their path', () => {
	assert.deepEqual(byName('npm: dev'), {
		name: 'npm: dev',
		line: 'pnpm run dev',
		cwd: 'web',
		env: { GREETING: 'hello' },
		build: false,
		needsFile: false,
	});
});

test('vscodeTasks: open-file variables are left for run time', () => {
	const task = byName('Build from current open file');
	assert.equal(task?.needsFile, true);
	assert.equal(task?.cwd, '${fileDirname}');
	assert.equal(byName('Build workspace')?.needsFile, false);
});

test('resolveFileVariables: from the open file', () => {
	const f = { file: '/work/app/src/lib/util.test.ts', workspace: '/work/app', line: 7, selectedText: 'x' };
	assert.equal(
		resolveFileVariables(
			'${file}|${fileDirname}|${fileBasename}|${fileBasenameNoExtension}|${fileExtname}|${fileDirnameBasename}|${relativeFile}|${relativeFileDirname}|${lineNumber}|${selectedText}',
			f
		),
		'/work/app/src/lib/util.test.ts|/work/app/src/lib|util.test.ts|util.test|.ts|lib|src/lib/util.test.ts|src/lib|7|x'
	);
	assert.equal(resolveFileVariables('${unknown}', f), '${unknown}');
});

test('vscodeTasks: top-level defaults apply to every task', () => {
	const listing = vscodeTasks({ version: '2.0.0', type: 'shell', options: { cwd: 'sub' }, tasks: [{ label: 'a', command: 'make' }] }, ctx);
	assert.deepEqual(listing.tasks[0], { name: 'a', line: 'make', cwd: 'sub', env: undefined, build: false, needsFile: false });
});

test('vscodeTasks: tasks without a label or command are skipped; a dependency loop is reported', () => {
	const listing = vscodeTasks(
		{
			tasks: [
				{ type: 'shell', command: 'x' },
				{ label: 'empty', type: 'shell' },
				{ label: 'a', dependsOn: 'b' },
				{ label: 'b', dependsOn: 'a' },
				{ label: 'c', dependsOn: 'missing' },
			],
		},
		ctx
	);
	assert.deepEqual(listing.tasks, []);
	assert.deepEqual(
		listing.skipped.map((s) => s.reason),
		['it has no label', 'it has no command', 'its dependencies loop', 'its dependencies loop', 'it depends on "missing", which isn\'t in tasks.json']
	);
});

test('vscodeTasks: not a tasks.json', () => {
	assert.deepEqual(vscodeTasks(null, ctx), { tasks: [], skipped: [] });
	assert.deepEqual(vscodeTasks({ tasks: 'x' }, ctx), { tasks: [], skipped: [] });
});

/* dependsOn command lines, run for real in /bin/sh */
const shell = (line: string) => {
	try {
		return { out: execFileSync('/bin/sh', ['-c', line], { encoding: 'utf8' }), failed: false };
	} catch (e: any) {
		return { out: String(e.stdout ?? ''), failed: true };
	}
};
const workspace = mkdtempSync(join(tmpdir(), 'taskfinder-vscode-'));
const run = (tasks: any[], name: string) => {
	const task = vscodeTasks({ tasks }, { ...ctx, workspace }).tasks.find((t) => t.name === name);
	assert.ok(task, name);
	return shell(task.line);
};

test('dependsOn sequence: in order, and stops at the first failure', () => {
	const tasks = [
		{ label: 'one', type: 'shell', command: 'echo one' },
		{ label: 'two', type: 'shell', command: 'echo two' },
		{ label: 'fail', type: 'shell', command: 'exit 3' },
		{ label: 'all', dependsOn: ['one', 'two'], dependsOrder: 'sequence', type: 'shell', command: 'echo own' },
		{ label: 'broken', dependsOn: ['one', 'fail', 'two'], dependsOrder: 'sequence' },
	];
	assert.deepEqual(run(tasks, 'all'), { out: 'one\ntwo\nown\n', failed: false });
	assert.deepEqual(run(tasks, 'broken'), { out: 'one\n', failed: true });
});

test('dependsOn parallel (the default): together, then the own command; a failure stops it', () => {
	const tasks = [
		{ label: 'slow', type: 'shell', command: 'sleep 0.3; echo slow' },
		{ label: 'fast', type: 'shell', command: 'echo fast' },
		{ label: 'fail', type: 'shell', command: 'exit 2' },
		{ label: 'both', dependsOn: ['slow', 'fast'], type: 'shell', command: 'echo own' },
		{ label: 'depsOnly', dependsOn: ['slow', 'fast'] },
		{ label: 'broken', dependsOn: ['slow', 'fail'], type: 'shell', command: 'echo never' },
	];
	assert.deepEqual(run(tasks, 'both'), { out: 'fast\nslow\nown\n', failed: false });
	assert.deepEqual(run(tasks, 'depsOnly'), { out: 'fast\nslow\n', failed: false });
	assert.equal(run(tasks, 'broken').failed, true);
	assert.ok(!run(tasks, 'broken').out.includes('never'));
});

test('dependsOn: each part runs in its own folder with its own env', () => {
	const tasks = [
		{ label: 'here', type: 'shell', command: 'pwd', options: { cwd: '/tmp' } },
		{ label: 'env', type: 'shell', command: 'echo $X', options: { env: { X: 'it works' } } },
		{ label: 'all', dependsOn: ['here', 'env'], dependsOrder: 'sequence' },
	];
	const { out } = run(tasks, 'all');
	assert.match(out, /\/tmp\nit works\n$/);
});
