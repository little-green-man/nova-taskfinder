import { state, useProject, install, script, settle } from './nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { PackageJsonParser } from '../../src/parsers';
import { createSidebar, disposeSidebar, formatDuration, statusText, stripAnsi } from '../../src/sidebar';
import { forgetLatest } from '../../src/source';

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const logFile = (name: string) => `${(globalThis as any).nova.extension.workspaceStoragePath}/Output/${name} — Node.log`;
const log = (name: string) => readFileSync(logFile(name), 'utf8');

/* The sidebar for node-only, after Nova has asked for its tasks */
const opened = async () => {
	useProject('node-only');
	install('npm');
	await new PackageJsonParser().provideTasks();
	await settle();
	const disposables = createSidebar();
	const provider = state.tree?.provider;
	const groups = await provider.getChildren(null);
	const rows = await provider.getChildren(groups[0]);
	const row = (name: string) => rows.find((r: any) => r.name === name);
	const item = (name: string) => provider.getTreeItem(row(name));
	const close = () => {
		disposeSidebar();
		disposables.forEach((d) => d.dispose());
	};
	return { provider, groups, rows, row, item, close, state };
};

const invoke = (command: string) => state.commands.get(command)?.();

test('sidebar: tasks grouped under their source, as in the Tasks menu', async () => {
	const { provider, groups, rows, item, close } = await opened();
	assert.deepEqual(
		groups.map((g: any) => g.name),
		['Node (package.json)']
	);
	assert.equal(provider.getTreeItem(groups[0]).collapsibleState, 2);
	assert.ok(rows.some((r: any) => r.name === 'build'));
	assert.equal(item('build').contextValue, 'task');
	assert.equal(item('build').command, 'taskfinder.sidebar.open');
	assert.equal('descriptiveText' in item('build'), false);
	assert.equal(item('build').image, 'task-idle');
	close();
});

test('sidebar: double-click runs the task, streams output to a new document, and shows the result', async () => {
	const { row, item, close } = await opened();
	script('npm run build', { stdout: '\u001b[32mbuilt\u001b[0m\n' });
	state.tree!.selection = [row('build')];
	invoke('taskfinder.sidebar.open');
	await wait(300);

	assert.ok(state.ran.includes('npm run build'));
	assert.match(log('build'), /^\$ npm run build\n\(in .*node-only\)\n\nbuilt\n\nFinished after 0 s\.\n$/);
	assert.equal(state.urls.length, 1);
	assert.equal(item('build').descriptiveText, '✓ 0 s');
	assert.equal(item('build').image, 'task-succeeded');
	assert.equal(state.openFiles, 0);
	assert.equal(item('build').contextValue, 'finished');
	close();
});

test('sidebar: a failing task shows its exit status', async () => {
	const { row, item, close } = await opened();
	script('npm run test', { status: 2, stderr: 'oops\n' });
	state.tree!.selection = [row('test')];
	invoke('taskfinder.sidebar.run');
	await wait(300);
	assert.equal(item('test').descriptiveText, '✗ exit 2');
	assert.equal(item('test').image, 'task-failed');
	assert.match(log('test'), /oops\n\nFailed with exit 2/);
	close();
});

test('sidebar: two tasks run at once; Stop and Stop All end them', async () => {
	const { row, item, close } = await opened();
	script('npm run dev', { hang: true });
	script('npm run build', { hang: true });
	state.tree!.selection = [row('dev')];
	invoke('taskfinder.sidebar.open');
	state.tree!.selection = [row('build')];
	invoke('taskfinder.sidebar.open');
	await settle();
	assert.match(item('dev').descriptiveText, /^running · \d+ s$/);
	assert.equal(item('build').contextValue, 'running');
	assert.equal(item('build').image, 'task-running');

	/* double-click on a running task shows its output rather than starting it again */
	invoke('taskfinder.sidebar.open');
	await settle();
	assert.equal(state.ran.filter((line) => line === 'npm run build').length, 1);

	invoke('taskfinder.sidebar.stop');
	await settle();
	assert.equal(item('build').descriptiveText, 'stopped');
	assert.equal(item('build').image, 'task-stopped');
	assert.equal(item('dev').contextValue, 'running');

	invoke('taskfinder.sidebar.stop-all');
	await settle();
	assert.equal(item('dev').descriptiveText, 'stopped');
	assert.deepEqual(state.signals, ['terminate npm run build', 'terminate npm run dev']);
	close();
});

test('sidebar: output goes to a log file per task, opened when it runs and by Show Output', async () => {
	const { row, close } = await opened();
	script('npm run build', { stdout: 'done\n' });
	state.tree!.selection = [row('build')];
	invoke('taskfinder.sidebar.open');
	await wait(300);
	assert.ok(existsSync(`${(globalThis as any).nova.extension.workspaceStoragePath}/Output/build — Node.log`));
	invoke('taskfinder.sidebar.output');
	await settle();
	assert.equal(state.urls.length, 2);
	assert.match(state.urls[1], /^file:.*\/Output\/build — Node\.log$/);
	close();
});

test("sidebar: the last session's logs are removed when it starts", async () => {
	const first = await opened();
	script('npm run build', { stdout: 'done\n' });
	first.state.tree!.selection = [first.row('build')];
	invoke('taskfinder.sidebar.open');
	await wait(300);
	first.close();
	assert.ok(existsSync(logFile('build')));
	const second = await opened();
	assert.ok(!existsSync(logFile('build')));
	second.close();
});

test('sidebar: a log past 5 MB starts again, keeping the latest output', async () => {
	const { row, close } = await opened();
	script('npm run dev', { stdout: `${'x'.repeat(99)}\n`.repeat(60_000) + 'last line\n' });
	state.tree!.selection = [row('dev')];
	invoke('taskfinder.sidebar.open');
	await wait(400);
	const text = log('dev');
	assert.ok(text.startsWith('(earlier output removed)'));
	assert.ok(text.length < 5_000_000);
	assert.match(text, /last line\n\nFinished/);
	close();
});

test('sidebar: a source turned off disappears; the view redraws when tasks change', async () => {
	const { provider, close } = await opened();
	const before = state.tree!.reloads;
	forgetLatest('taskfinder.auto-node');
	assert.ok(state.tree!.reloads > before);
	assert.deepEqual(await provider.getChildren(null), []);
	close();
});

test('statusText, formatDuration and stripAnsi', () => {
	assert.equal(formatDuration(12_400), '12 s');
	assert.equal(formatDuration(125_000), '2 min 5 s');
	assert.equal(formatDuration(3_780_000), '1 h 3 min');
	const base = { name: 'x', line: 'x', started: 0, stopped: false, pending: '', logSize: 0 };
	assert.equal(statusText(undefined), undefined);
	assert.equal(statusText(base, 3000), 'running · 3 s');
	assert.equal(statusText({ ...base, status: 0, ended: 3000 }), '✓ 3 s');
	assert.equal(statusText({ ...base, status: 1, ended: 3000 }), '✗ exit 1');
	assert.equal(statusText({ ...base, status: 143, ended: 3000, stopped: true }), 'stopped');
	assert.equal(stripAnsi('\u001b[1;31mred\u001b[0m \u001b]8;;http://x\u0007link\u001b]8;;\u0007 50%\r100%'), 'red link 50%\n100%');
});
