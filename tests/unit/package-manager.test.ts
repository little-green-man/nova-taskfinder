import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { detectPackageManager, hasConflictingLockfiles, packageManagerFiles, runsPrePostHooks } from '../../src/scripts';

/* A manual test project's package.json and the package-manager files at its root */
const project = (name: string) => {
	const dir = `tests/projects/${name}`;
	return {
		json: JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')),
		files: readdirSync(dir).filter((file) => packageManagerFiles.includes(file)),
	};
};

const detect = (json: any, files: string[] = []) => {
	const { name, source } = detectPackageManager(json, files);
	return `${name} (${source})`;
};

test('detectPackageManager: falls back to npm', () => {
	assert.equal(detect({}), 'npm (default)');
	assert.equal(detect(undefined), 'npm (default)');
});

test('detectPackageManager: each lockfile', () => {
	assert.equal(detect({}, ['package-lock.json']), 'npm (package-lock.json)');
	assert.equal(detect({}, ['npm-shrinkwrap.json']), 'npm (npm-shrinkwrap.json)');
	assert.equal(detect({}, ['yarn.lock']), 'yarn (yarn.lock)');
	assert.equal(detect({}, ['pnpm-lock.yaml']), 'pnpm (pnpm-lock.yaml)');
	assert.equal(detect({}, ['bun.lock']), 'bun (bun.lock)');
	assert.equal(detect({}, ['bun.lockb']), 'bun (bun.lockb)');
});

test('detectPackageManager: several lockfiles prefer bun, pnpm, yarn, then npm', () => {
	assert.equal(detect({}, ['package-lock.json', 'pnpm-lock.yaml']), 'pnpm (pnpm-lock.yaml)');
	assert.equal(detect({}, ['yarn.lock', 'package-lock.json']), 'yarn (yarn.lock)');
	assert.equal(detect({}, ['yarn.lock', 'bun.lockb', 'pnpm-lock.yaml']), 'bun (bun.lockb)');
});

test('detectPackageManager: packageManager field wins, with or without version and hash', () => {
	assert.equal(detect({ packageManager: 'pnpm@9.1.0' }, ['package-lock.json']), 'pnpm (packageManager)');
	assert.equal(detect({ packageManager: 'yarn@4.5.0+sha512.abc123' }), 'yarn (packageManager)');
	assert.equal(detect({ packageManager: 'bun' }), 'bun (packageManager)');
});

test('detectPackageManager: devEngines.packageManager, object or array', () => {
	assert.equal(detect({ devEngines: { packageManager: { name: 'yarn' } } }, ['package-lock.json']), 'yarn (devEngines)');
	assert.equal(detect({ devEngines: { packageManager: [{ name: 'pnpm' }, { name: 'npm' }] } }), 'pnpm (devEngines)');
	assert.equal(detect({ packageManager: 'bun@1.2.0', devEngines: { packageManager: { name: 'yarn' } } }), 'bun (packageManager)');
});

test('detectPackageManager: unknown names fall through to the next signal', () => {
	assert.equal(detect({ packageManager: 'deno@2.0.0' }, ['yarn.lock']), 'yarn (yarn.lock)');
	assert.equal(detect({ devEngines: { packageManager: { name: 'cnpm' } } }), 'npm (default)');
	assert.equal(detect({ packageManager: 42, devEngines: { packageManager: 'pnpm' } }), 'npm (default)');
});

test('detectPackageManager: reports every lockfile present', () => {
	assert.deepEqual(detectPackageManager({}, ['.npmrc', 'package-lock.json', 'pnpm-lock.yaml']).lockfiles, ['pnpm-lock.yaml', 'package-lock.json']);
});

test('hasConflictingLockfiles: only when they belong to different package managers', () => {
	assert.equal(hasConflictingLockfiles(['pnpm-lock.yaml', 'package-lock.json']), true);
	assert.equal(hasConflictingLockfiles(['bun.lock', 'bun.lockb']), false);
	assert.equal(hasConflictingLockfiles(['package-lock.json', 'npm-shrinkwrap.json']), false);
	assert.equal(hasConflictingLockfiles(['yarn.lock']), false);
});

test('runsPrePostHooks: npm, bun and Yarn 1 run hooks; Yarn 2+ does not', () => {
	const none = { packageJson: {}, hasYarnrcYml: false };
	assert.equal(runsPrePostHooks('npm', none), true);
	assert.equal(runsPrePostHooks('bun', none), true);
	assert.equal(runsPrePostHooks('yarn', none), true);
	assert.equal(runsPrePostHooks('yarn', { packageJson: { packageManager: 'yarn@1.22.19' }, hasYarnrcYml: false }), true);
	assert.equal(runsPrePostHooks('yarn', { packageJson: { packageManager: 'yarn@4.5.0' }, hasYarnrcYml: false }), false);
	assert.equal(runsPrePostHooks('yarn', { packageJson: {}, hasYarnrcYml: true }), false);
});

test('runsPrePostHooks: pnpm 9+ runs hooks by default, 7-8 do not', () => {
	assert.equal(runsPrePostHooks('pnpm', { packageJson: {}, hasYarnrcYml: false }), true);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: { packageManager: 'pnpm@9.0.0' }, hasYarnrcYml: false }), true);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: { packageManager: 'pnpm@8.15.0' }, hasYarnrcYml: false }), false);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: { packageManager: 'pnpm@7.0.0+sha.x' }, hasYarnrcYml: false }), false);
});

test('runsPrePostHooks: explicit pnpm settings win, pnpm-workspace.yaml over .npmrc', () => {
	const pnpm8 = { packageJson: { packageManager: 'pnpm@8.15.0' }, hasYarnrcYml: false };
	assert.equal(runsPrePostHooks('pnpm', { ...pnpm8, npmrc: 'registry=https://example.com\nenable-pre-post-scripts=true\n' }), true);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: {}, hasYarnrcYml: false, npmrc: 'enable-pre-post-scripts = false' }), false);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: {}, hasYarnrcYml: false, pnpmWorkspace: 'packages:\n  - app\nenablePrePostScripts: false\n' }), false);
	assert.equal(
		runsPrePostHooks('pnpm', { ...pnpm8, npmrc: 'enable-pre-post-scripts=false', pnpmWorkspace: 'enablePrePostScripts: true' }),
		true
	);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: {}, hasYarnrcYml: false, npmrc: '# enable-pre-post-scripts=false' }), true, 'comment ignored');
});

test('test projects resolve as documented in tests/README.md', () => {
	const cases: Record<string, string> = {
		'node-only': 'npm (default)',
		'pnpm-lockfile': 'pnpm (pnpm-lock.yaml)',
		'bun-lockfile': 'bun (bun.lock)',
		'package-manager-field': 'pnpm (packageManager)',
		'dev-engines': 'yarn (devEngines)',
		'yarn-berry': 'yarn (packageManager)',
	};
	for (const [name, expected] of Object.entries(cases)) {
		const { json, files } = project(name);
		assert.equal(detect(json, files), expected, name);
	}
	assert.equal(hasConflictingLockfiles(project('package-manager-field').files), true);
	assert.equal(runsPrePostHooks('pnpm', { packageJson: project('package-manager-field').json, hasYarnrcYml: false }), false);
});
