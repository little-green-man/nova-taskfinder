import { state, useProject, install, settle, summarise } from '../nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PackageJsonParser } from '../../../src/parsers';

const tasksFor = async () => {
	const tasks = new PackageJsonParser().provideTasks();
	await settle();
	return tasks.map(summarise);
};

const notificationIds = () => state.notifications.map((n) => n.id);

test('node-only: npm by default, hooks hidden, Build/Clean bound', async () => {
	useProject('node-only');
	install('npm');
	assert.deepEqual(await tasksFor(), [
		['dev', 'run', 'npm run dev'],
		['build', 'run+build', 'npm run build'],
		['test', 'run', 'npm run test'],
		['lint:fix', 'run', 'npm run lint:fix'],
		['clean', 'run+clean', 'npm run clean'],
		['build:css', 'run+build', 'npm run build:css'],
		['rebuild-cache', 'run', 'npm run rebuild-cache'],
	]);
	assert.deepEqual(state.notifications, []);
});

test('node-only: Show Lifecycle Scripts lists hooks', async () => {
	useProject('node-only');
	install('npm');
	state.globalConfig.set('taskfinder.show-lifecycle-scripts', true);
	const names = (await tasksFor()).map(([name]) => name);
	assert.ok(names.includes('prebuild') && names.includes('postinstall'));
});

test('pnpm-lockfile: pnpm run, prebuild hidden (pnpm 9+ runs hooks)', async () => {
	useProject('pnpm-lockfile');
	install('pnpm');
	assert.deepEqual(await tasksFor(), [
		['build', 'run+build', 'pnpm run build'],
		['test', 'run', 'pnpm run test'],
	]);
});

test('dev-engines: yarn run, so a script named info runs the script', async () => {
	useProject('dev-engines');
	install('yarn');
	assert.deepEqual(await tasksFor(), [
		['info', 'run', 'yarn run info'],
		['dev', 'run', 'yarn run dev'],
	]);
});

test('Package Manager setting overrides detection', async () => {
	useProject('pnpm-lockfile');
	install('npm');
	state.workspaceConfig.set('taskfinder.package-manager', 'npm');
	assert.equal((await tasksFor())[0][2], 'npm run build');
});

test('detected package manager missing: notification offers Use npm; tasks still listed', async () => {
	useProject('bun-lockfile');
	const tasks = await tasksFor();
	assert.equal(tasks.length, 2);
	assert.deepEqual(state.notifications, [
		{
			id: 'taskfinder.node-pm-missing',
			title: "bun isn't installed",
			body: "This project uses bun (from bun.lock), but bun isn't on your PATH, so its tasks won't run.",
			actions: ['Install', 'Use npm', 'Dismiss'],
		},
	]);
});

test('package manager set in settings but missing: notification offers Settings', async () => {
	useProject('bun-lockfile');
	state.globalConfig.set('taskfinder.package-manager', 'bun');
	await tasksFor();
	assert.deepEqual(state.notifications[0].actions, ['Install', 'Settings', 'Dismiss']);
	assert.match(state.notifications[0].body ?? '', /set in Package Manager/);
});

test('conflicting lockfiles: notification with Settings', async () => {
	useProject('package-manager-field');
	install('pnpm');
	await tasksFor();
	assert.deepEqual(notificationIds(), ['taskfinder.node-lockfiles']);
	assert.match(state.notifications[0].body ?? '', /pnpm-lock\.yaml and package-lock\.json/);
});

test('invalid package.json: notification with Open File, no tasks', async () => {
	useProject('broken-json');
	install('npm');
	assert.deepEqual(await tasksFor(), []);
	assert.deepEqual(notificationIds(), ['taskfinder.node-invalid-json']);
	assert.deepEqual(state.notifications[0].actions, ['Open File', 'Dismiss']);
});

test('stat throwing for missing lockfiles (a *.novaextension folder) still lists scripts', async () => {
	useProject('node-only');
	install('npm');
	state.statThrowsIfMissing = true;
	state.listdirFails = true;
	assert.equal((await tasksFor()).length, 7);
});

test('notifications show once per window', async () => {
	useProject('broken-json');
	await tasksFor();
	await tasksFor();
	assert.equal(state.notifications.length, 1);
});
