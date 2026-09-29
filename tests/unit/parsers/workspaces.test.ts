import { state, useProject, install, settle } from '../nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DenoParser, PackageJsonParser, denoFiles, nodeFiles } from '../../../src/parsers';

/* [name, actions, command line, folder] */
const summarise = (task: any) => {
	const action = task.actions.run;
	return [
		task.name,
		Object.keys(task.actions).join('+'),
		[action.command, ...(action.options.args ?? [])].join(' '),
		action.options.cwd.slice(state.root.length + 1),
	];
};
const tasksOf = async (parser: { provideTasks(): any }) => {
	const tasks = await parser.provideTasks();
	await settle();
	return tasks.map(summarise);
};
const workspacesOn = () => state.globalConfig.set('taskfinder.workspace-packages', true);

test('npm workspaces: off by default, so only the root scripts', async () => {
	useProject('workspaces-npm');
	install('npm');
	assert.deepEqual(await tasksOf(new PackageJsonParser()), [['lint', 'run', 'npm run lint', '']]);
	assert.deepEqual(
		nodeFiles.filter((file) => file.includes('/')),
		[]
	);
});

test('npm workspaces: members run in their folder, named by package; exclusions and folders without package.json skipped', async () => {
	useProject('workspaces-npm');
	install('npm');
	workspacesOn();
	assert.deepEqual(await tasksOf(new PackageJsonParser()), [
		['lint', 'run', 'npm run lint', ''],
		['@acme/api: build', 'run+build', 'npm run build', 'packages/api'],
		['@acme/api: test', 'run', 'npm run test', 'packages/api'],
		['@acme/web: dev', 'run', 'npm run dev', 'packages/web'],
	]);
	assert.ok(nodeFiles.includes('packages/api/package.json') && nodeFiles.includes('packages/web/package.json'), 'members are watched');
});

test('pnpm workspaces: pnpm-workspace.yaml patterns, ** at any depth, folder name when a package has no name', async () => {
	useProject('workspaces-pnpm');
	install('pnpm');
	workspacesOn();
	assert.deepEqual(await tasksOf(new PackageJsonParser()), [
		['lint', 'run', 'pnpm run lint', ''],
		['site: dev', 'run', 'pnpm run dev', 'apps/site'],
		['core: test', 'run', 'pnpm run test', 'libs/deep/core'],
		['libs/ui: build', 'run+build', 'pnpm run build', 'libs/ui'],
	]);
});

test('Deno workspaces: members from deno.json(c), run with deno task in their folder', async () => {
	useProject('workspaces-deno');
	install('deno');
	workspacesOn();
	assert.deepEqual(await tasksOf(new DenoParser()), [
		['check', 'run', 'deno task check', ''],
		['@calc/add: test', 'run', 'deno task test', 'add'],
		['subtract: build', 'run+build', 'deno task build', 'subtract'],
	]);
	assert.deepEqual(denoFiles, ['deno.json', 'deno.jsonc', 'add/deno.json', 'subtract/deno.jsonc']);

	/* turning it off again stops watching the members */
	state.globalConfig.set('taskfinder.workspace-packages', false);
	await tasksOf(new DenoParser());
	assert.deepEqual(denoFiles, ['deno.json', 'deno.jsonc']);
});

test('no workspaces declared: the setting changes nothing', async () => {
	useProject('node-only');
	install('npm');
	workspacesOn();
	assert.equal((await tasksOf(new PackageJsonParser())).length, 7);
});
