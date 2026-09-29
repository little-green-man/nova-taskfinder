import { state, useProject, settle } from './nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { choices, projectChoices, resolveCommand, USE_GLOBAL } from '../../src/settings';
import { notify, resetState } from '../../src/notify';

const manifest = JSON.parse(readFileSync('build/taskfinder.novaextension/extension.json', 'utf8'));

/* Every setting item in a config list, flattening sections */
const items = (list: any[]): any[] => list.flatMap((item) => (item.type === 'section' ? items(item.children) : [item]));
const settings = (list: any[]) => items(list).filter((item) => item.key);

test('projectChoices: names the current preference', () => {
	assert.deepEqual(projectChoices('taskfinder.auto-make', true), [
		[null, 'Use Global Setting (On)'],
		[true, 'On'],
		[false, 'Off'],
	]);
	assert.equal(projectChoices('taskfinder.make-listing', 'file')[0][1], 'Use Global Setting (Reading the Makefile)');
	assert.equal(projectChoices('taskfinder.package-manager', null)[0][1], USE_GLOBAL);
	assert.equal(projectChoices('taskfinder.package-manager', 'deno')[0][1], USE_GLOBAL);
});

test('manifest: uses the documented configWorkspace key', () => {
	assert.ok(Array.isArray(manifest.configWorkspace));
	assert.equal(manifest['config-workspace'], undefined);
});

test('manifest: both panes have the same settings, in the same order, all described in src/settings.ts', () => {
	const global = settings(manifest.config).map((item) => item.key);
	const project = settings(manifest.configWorkspace).map((item) => item.key);
	assert.deepEqual(project, global);
	assert.deepEqual([...global].sort(), Object.keys(choices).sort());
});

test('manifest: Project Settings choices match src/settings.ts and resolve through its command', () => {
	settings(manifest.configWorkspace).forEach((item) => {
		assert.equal(item.resolve, resolveCommand(item.key), item.key);
		assert.equal(item.default, null, item.key);
		assert.deepEqual(item.values, projectChoices(item.key, undefined), item.key);
	});
});

test('manifest: preference values match src/settings.ts', () => {
	settings(manifest.config)
		.filter((item) => item.type === 'enum')
		.forEach((item) =>
			assert.deepEqual(
				item.values.map(([value]: [string]) => value),
				choices[item.key].map(([value]) => value),
				item.key
			)
		);
});

test('manifest: short titles, and Refresh Tasks in the menu and both panes', () => {
	[...items(manifest.config), ...items(manifest.configWorkspace)].forEach((item) => assert.ok(!/^Include /.test(item.title), item.title));
	assert.ok(manifest.commands.extensions.some((command: any) => command.command === 'taskfinder.refresh'));
	for (const list of [manifest.config, manifest.configWorkspace])
		assert.ok(items(list).some((item) => item.type === 'command' && item.command === 'taskfinder.refresh'));
});

test('Refresh Tasks: showing notifications are removed and may show again', async () => {
	useProject('node-only');
	notify('demo', 'Demo', 'Body');
	notify('demo', 'Demo', 'Body');
	assert.equal(state.notifications.length, 1);

	resetState();
	assert.deepEqual(state.cancelled, ['taskfinder.demo']);
	notify('demo', 'Demo', 'Body');
	await settle();
	assert.equal(state.notifications.length, 2);
});
