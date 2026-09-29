import { state, fixture, useProject, install, script, settle, summarise } from '../nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ComposerParser, MaidfileParser, TaskfileParser } from '../../../src/parsers';

const ids = () => state.notifications.map((n) => n.id);

/* Composer */

const composerTasks = async () => {
	const tasks = new ComposerParser().provideTasks();
	await settle();
	return tasks.map(summarise);
};

test('composer-only: events hidden, plugin event names kept, Clean bound', async () => {
	useProject('composer-only');
	install('composer');
	assert.deepEqual(await composerTasks(), [
		['test', 'run', 'composer run test'],
		['analyse', 'run', 'composer run analyse'],
		['clean', 'run+clean', 'composer run clean'],
		['init', 'run', 'composer run init'],
	]);
	assert.deepEqual(state.notifications, []);
});

test('composer missing: tasks still listed, Install and Turn Off offered', async () => {
	useProject('composer-only');
	assert.equal((await composerTasks()).length, 4);
	assert.deepEqual(ids(), ['taskfinder.composer-missing']);
	assert.deepEqual(state.notifications[0].actions, ['Install', 'Turn Off', 'Dismiss']);
});

test('invalid composer.json: notification with Open File', async () => {
	useProject('broken-json');
	install('composer');
	assert.deepEqual(await composerTasks(), []);
	assert.deepEqual(ids(), ['taskfinder.composer-invalid-json']);
});

/* Taskfile */

const taskfileTasks = async () => (await new TaskfileParser().provideTasks()).map(summarise);
const TASK_LIST = 'task --list-all --json';

test('taskfile-only: namespaced and dotted names, wildcard skipped', async () => {
	useProject('taskfile-only');
	install('task');
	script(TASK_LIST, { stdout: fixture('task-list.json') });
	assert.deepEqual(await taskfileTasks(), [
		['build', 'run+build', 'task build'],
		['docs.site', 'run', 'task docs.site'],
		['hello', 'run', 'task hello'],
		['db:migrate', 'run', 'task db:migrate'],
	]);
});

test('no root Taskfile: task is never run (it would search parent folders)', async () => {
	useProject('root-only/child');
	install('task');
	assert.deepEqual(await taskfileTasks(), []);
	assert.deepEqual(state.ran, []);
});

test('task missing: notification, task list not attempted', async () => {
	useProject('taskfile-only');
	assert.deepEqual(await taskfileTasks(), []);
	assert.deepEqual(ids(), ['taskfinder.taskfile-missing']);
	assert.deepEqual(state.notifications[0].actions, ['Install', 'Turn Off', 'Dismiss']);
	assert.ok(!state.ran.includes(TASK_LIST));
});

test('Task too old for --json: Update offered', async () => {
	useProject('taskfile-only');
	install('task');
	script(TASK_LIST, { status: 1, stderr: 'unknown flag: --json\n' });
	await taskfileTasks();
	assert.deepEqual(ids(), ['taskfinder.taskfile-old']);
	assert.deepEqual(state.notifications[0].actions, ['Update', 'Dismiss']);
});

test('Taskfile error: first line of the error, Open File; cleared once fixed', async () => {
	useProject('broken-taskfile');
	install('task');
	script(TASK_LIST, { status: 109, stderr: fixture('task-error.txt') });
	await taskfileTasks();
	assert.equal(state.notifications[0].title, 'Taskfile.yml has an error');
	assert.match(state.notifications[0].body ?? '', /Failed to parse Taskfile\.yml: yaml: line 3/);

	script(TASK_LIST, { stdout: fixture('task-list.json') });
	await taskfileTasks();
	assert.deepEqual(state.cancelled, ['taskfinder.taskfile-error']);
});

/* Maid */

const maidTasks = async () => (await new MaidfileParser().provideTasks()).map(summarise);

test('maidfile-only: hidden and _ tasks skipped, build bound to Build', async () => {
	useProject('maidfile-only');
	install('maid');
	script('maid --system json', { stdout: fixture('maid-list.json') });
	assert.deepEqual(await maidTasks(), [
		['hello', 'run', 'maid hello'],
		['build', 'run+build', 'maid build'],
	]);
	assert.deepEqual(state.ran, ['command -v maid', 'maid --system json']);
});

test('legacy maid: falls back to butler json', async () => {
	useProject('maidfile-only');
	install('maid');
	script('maid --system json', { status: 2, stderr: "error: unexpected argument '--system' found\n" });
	script('maid butler json', { stdout: fixture('maid-list.json') });
	assert.equal((await maidTasks()).length, 2);
});

test("npm's maid: A different maid is installed", async () => {
	useProject('maidfile-only');
	install('maid');
	script('maid --system json', { stdout: fixture('npm-maid-help.txt') });
	script('maid butler json', { stdout: fixture('npm-maid-help.txt') });
	assert.deepEqual(await maidTasks(), []);
	assert.deepEqual(ids(), ['taskfinder.maid-wrong']);
});

test('maidfile error: Open File with the TOML error', async () => {
	useProject('broken-maidfile');
	install('maid');
	script('maid --system json', { status: 1, stderr: fixture('maid-error.txt') });
	script('maid butler json', { status: 1, stderr: fixture('maid-error.txt') });
	await maidTasks();
	assert.deepEqual(ids(), ['taskfinder.maidfile-error']);
	assert.match(state.notifications[0].body ?? '', /Invalid TOML document/);
});

test('maid missing: notification', async () => {
	useProject('maidfile-only');
	await maidTasks();
	assert.deepEqual(ids(), ['taskfinder.maid-missing']);
});

test('maid Path: a configured maid is used to check, list and run', async () => {
	useProject('maidfile-only');
	state.globalConfig.set('taskfinder.maid-path', '/opt/mackabu/bin/maid');
	script('command -v /opt/mackabu/bin/maid', { status: 0 });
	script('/opt/mackabu/bin/maid --system json', { stdout: fixture('maid-list.json') });
	assert.deepEqual(await maidTasks(), [
		['hello', 'run', '/opt/mackabu/bin/maid hello'],
		['build', 'run+build', '/opt/mackabu/bin/maid build'],
	]);
});

test('maid Path: spaces are quoted, ~ is expanded, and a blank project value follows the preference', async () => {
	useProject('maidfile-only');
	state.globalConfig.set('taskfinder.maid-path', '~/My Tools/maid');
	state.workspaceConfig.set('taskfinder.maid-path', '  ');
	script("command -v '/home/My Tools/maid'", { status: 0 });
	script("'/home/My Tools/maid' --system json", { stdout: fixture('maid-list.json') });
	assert.equal((await maidTasks())[0][2], "'/home/My Tools/maid' hello");
});

test('maid Path: the wrong maid notification offers Settings to choose another', async () => {
	useProject('maidfile-only');
	install('maid');
	script('maid --system json', { stdout: fixture('npm-maid-help.txt') });
	script('maid butler json', { stdout: fixture('npm-maid-help.txt') });
	await maidTasks();
	assert.deepEqual(state.notifications[0].actions, ['Install', 'Settings', 'Turn Off', 'Dismiss']);
});
