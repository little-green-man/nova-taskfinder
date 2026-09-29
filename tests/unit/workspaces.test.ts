import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { denoWorkspaces, expandWorkspaces, memberTaskName, packageJsonWorkspaces, pnpmWorkspaces } from '../../src/workspaces';

/* A folder tree for expandWorkspaces: each key lists its subfolders */
const tree: Record<string, string[]> = {
	'': ['packages', 'apps', 'libs', 'node_modules', '.git'],
	packages: ['api', 'web', 'ignored', '.cache'],
	apps: ['site'],
	libs: ['ui', 'deep'],
	'libs/deep': ['core'],
	'libs/deep/core': [],
	'libs/ui': ['node_modules'],
	node_modules: ['left-pad'],
};
const list = (dir: string) => tree[dir] ?? [];

test('packageJsonWorkspaces: array (npm, Yarn 2+, bun) or { packages } (Yarn 1)', () => {
	assert.deepEqual(packageJsonWorkspaces({ workspaces: ['packages/*', 42] }), ['packages/*']);
	assert.deepEqual(packageJsonWorkspaces({ workspaces: { packages: ['apps/*'], nohoist: ['**'] } }), ['apps/*']);
	assert.deepEqual(packageJsonWorkspaces({ workspaces: 'packages/*' }), []);
	assert.deepEqual(packageJsonWorkspaces(null), []);
});

test('pnpmWorkspaces: the packages list only, quoted or not, comments ignored', () => {
	const yaml = '# comment\npackages:\n  - \'apps/*\'\n  - "libs/**" # deep\n  - tools\n\ncatalog:\n  - not-a-package\n';
	assert.deepEqual(pnpmWorkspaces(yaml), ['apps/*', 'libs/**', 'tools']);
	assert.deepEqual(pnpmWorkspaces(undefined), []);
	assert.deepEqual(pnpmWorkspaces('catalog:\n  react: ^19\n'), []);
});

test('denoWorkspaces: array or { members }', () => {
	assert.deepEqual(denoWorkspaces({ workspace: ['./add', './subtract'] }), ['./add', './subtract']);
	assert.deepEqual(denoWorkspaces({ workspace: { members: ['./a'] } }), ['./a']);
	assert.deepEqual(denoWorkspaces({}), []);
});

test('expandWorkspaces: *, literal paths, ./ prefixes and exclusions', () => {
	assert.deepEqual(expandWorkspaces(['packages/*', '!packages/ignored'], list), ['packages/api', 'packages/web']);
	assert.deepEqual(expandWorkspaces(['./apps/site/', 'apps/*'], list), ['apps/site']);
	assert.deepEqual(expandWorkspaces(['packages/a*'], list), ['packages/api']);
});

test('expandWorkspaces: ** finds any depth, never node_modules or dot folders', () => {
	assert.deepEqual(expandWorkspaces(['libs/**'], list), ['libs', 'libs/deep', 'libs/deep/core', 'libs/ui']);
	assert.ok(!expandWorkspaces(['**'], list).some((dir) => dir.includes('node_modules') || dir.includes('.git') || dir.includes('.cache')));
});

test("expandWorkspaces: the root and paths outside it aren't members", () => {
	assert.deepEqual(expandWorkspaces(['.', '../other', ''], list), []);
});

test('memberTaskName: package name, else the folder', () => {
	assert.equal(memberTaskName('@acme/api', 'packages/api', 'build'), '@acme/api: build');
	assert.equal(memberTaskName(undefined, 'libs/ui', 'build'), 'libs/ui: build');
	assert.equal(memberTaskName('  ', 'libs/ui', 'build'), 'libs/ui: build');
});
