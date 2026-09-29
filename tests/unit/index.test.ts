import { state, useProject, script, setConfig } from './nova';
import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { activate, deactivate } from '../../src/index';
import { features } from '../../src/features';
import { run } from '../../src/process';

const flush = () => new Promise((done) => setImmediate(done));
const liveWatchers = () => state.watchers.filter((w) => !w.disposed);

/* Each test starts the extension in a project and stops it afterwards, as Nova does per window */
const started = async (project = 'node-only') => {
	useProject(project);
	state.watchers.length = 0;
	state.subscriptions.length = 0;
	await activate();
};

/* Nova disposes nova.subscriptions itself after deactivate() */
const stopped = () => {
	deactivate();
	state.subscriptions.forEach((d) => d.dispose());
};

test('activate: registers every source, its watchers, Refresh Tasks and the Project Settings resolvers', async () => {
	await started();
	assert.equal(state.assistants.size, features.length);
	assert.deepEqual(
		liveWatchers().map((w) => w.glob),
		features.flatMap((f) => f.globs)
	);
	assert.ok(state.commands.has('taskfinder.refresh'));
	assert.ok(state.commands.has('taskfinder.auto-make.choices'));
	assert.deepEqual([...new Set(state.reloads)].sort(), features.map((f) => f.id).sort());
	stopped();
});

test('a source turned off in Project Settings is removed, and comes back when turned on', async () => {
	await started();
	state.reloads.length = 0;

	setConfig('workspace', 'taskfinder.auto-make', false);
	assert.ok(!state.assistants.has('taskfinder-tasks-make'));
	assert.ok(!liveWatchers().some((w) => w.glob === '*akefile'));
	assert.deepEqual(state.reloads, ['taskfinder-tasks-make']);

	setConfig('workspace', 'taskfinder.auto-make', null);
	assert.ok(state.assistants.has('taskfinder-tasks-make'));
	assert.ok(liveWatchers().some((w) => w.glob === '*akefile'));
	stopped();
});

test('file changes: root files reload once after the debounce; other paths are ignored', async () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		await started();
		state.reloads.length = 0;
		const nodeWatcher = liveWatchers().find((w) => w.glob === '*package.json');

		nodeWatcher?.callback(`${state.root}/node_modules/x/package.json`);
		nodeWatcher?.callback(`${state.root}/package.json`);
		nodeWatcher?.callback('package.json');
		mock.timers.tick(299);
		assert.deepEqual(state.reloads, []);
		mock.timers.tick(1);
		assert.deepEqual(state.reloads, ['taskfinder-tasks-node']);
		stopped();
	} finally {
		mock.timers.reset();
	}
});

test('settings that change a listing reload only the sources that read them', async () => {
	await started();
	for (const [key, id] of [
		['taskfinder.make-listing', 'taskfinder-tasks-make'],
		['taskfinder.artisan-commands', 'taskfinder-tasks-artisan'],
		['taskfinder.just-confirm-recipes', 'taskfinder-tasks-just'],
	]) {
		state.reloads.length = 0;
		setConfig('global', key, 'x');
		assert.deepEqual(state.reloads, [id], key);
	}
	state.reloads.length = 0;
	setConfig('global', 'taskfinder.package-manager', 'x');
	assert.deepEqual(state.reloads, ['taskfinder-tasks-node', 'taskfinder-tasks-vscode']);
	state.reloads.length = 0;
	setConfig('global', 'taskfinder.show-lifecycle-scripts', true);
	assert.deepEqual(state.reloads, ['taskfinder-tasks-node', 'taskfinder-tasks-composer']);
	state.reloads.length = 0;
	setConfig('global', 'taskfinder.workspace-packages', true);
	assert.deepEqual(state.reloads, ['taskfinder-tasks-node', 'taskfinder-tasks-deno']);
	state.reloads.length = 0;
	setConfig('global', 'taskfinder.maid-path', '/opt/maid');
	assert.deepEqual(state.reloads, ['taskfinder-tasks-maidfile']);
	stopped();
});

test('Refresh Tasks reloads the active sources only', async () => {
	await started();
	setConfig('workspace', 'taskfinder.auto-deno', false);
	state.reloads.length = 0;

	await state.commands.get('taskfinder.refresh')?.();
	assert.deepEqual(
		state.reloads,
		features.map((f) => f.id).filter((id) => id !== 'taskfinder-tasks-deno')
	);
	stopped();
});

test('deactivate: disposes assistants and watchers, and stops listing processes', async () => {
	await started();
	script('make -pRrq', { hang: true });
	run('make', ['-pRrq']);
	await flush();

	stopped();
	await flush();
	assert.equal(state.assistants.size, 0);
	assert.equal(liveWatchers().length, 0);
	assert.deepEqual(state.signals, ['terminate make -pRrq']);
});

test('manifest: every source root file activates the extension, and nothing else does', () => {
	const manifest = JSON.parse(readFileSync('build/taskfinder.novaextension/extension.json', 'utf8'));
	const events: string[] = manifest.activationEvents.map((event: string) => event.replace('onWorkspaceContains:', ''));
	/* root files that identify a project; nested or included files only trigger reloads */
	const rootFiles = features.flatMap((f) => f.files).filter((file) => events.includes(file) || isIdentifying(file));
	assert.deepEqual([...new Set(events)].sort(), [...new Set(rootFiles)].sort());
});

/* files that are reload triggers only, not reasons to start the extension */
function isIdentifying(file: string) {
	const reloadOnly = new Set(['routes/console.php', 'composer.lock', '.npmrc', '.yarnrc.yml', 'pnpm-workspace.yaml']);
	return !reloadOnly.has(file) && !/lock|shrinkwrap|\.mk$/.test(file);
}
