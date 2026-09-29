import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { actionsFor, isComposerEvent, isNpmHook, isYarnBerry } from '../../src/scripts';

/* Scripts from the manual test projects, so both kinds of test use the same inputs */
const scriptsOf = (project: string, file: string): string[] =>
	Object.keys(JSON.parse(readFileSync(`tests/projects/${project}/${file}`, 'utf8')).scripts);

test('actionsFor: build and compile names bind Build as well as Run', () => {
	for (const name of ['build', 'compile', 'build:css', 'compile:ts', 'Build']) {
		assert.deepEqual(actionsFor(name), ['run', 'build'], name);
	}
});

test('actionsFor: clean names bind Clean as well as Run', () => {
	for (const name of ['clean', 'clean:cache', 'CLEAN']) {
		assert.deepEqual(actionsFor(name), ['run', 'clean'], name);
	}
});

test('actionsFor: near misses only bind Run', () => {
	for (const name of ['rebuild-cache', 'prebuild', 'postbuild', 'build-docs', 'cleanup', 'dev', 'test', 'buildx']) {
		assert.deepEqual(actionsFor(name), ['run'], name);
	}
});

test('isNpmHook: fixed lifecycle scripts are always hooks', () => {
	for (const name of ['postinstall', 'prepare', 'prepublishOnly', 'version', 'dependencies']) {
		assert.equal(isNpmHook(name, [name], true), true, name);
		assert.equal(isNpmHook(name, [name], false), true, name);
	}
});

test('isNpmHook: pre/post hooks only when the target script exists', () => {
	const scripts = ['build', 'prebuild', 'postbuild', 'prettier', 'posts', 'pretest'];
	assert.equal(isNpmHook('prebuild', scripts, true), true);
	assert.equal(isNpmHook('postbuild', scripts, true), true);
	assert.equal(isNpmHook('pretest', scripts, true), false, 'no test script');
	assert.equal(isNpmHook('prettier', scripts, true), false, 'no "ttier" script');
	assert.equal(isNpmHook('posts', scripts, true), false, 'no "s" script');
	assert.equal(isNpmHook('build', scripts, true), false);
});

test('isNpmHook: pre/post hooks stay visible when the package manager does not run them', () => {
	assert.equal(isNpmHook('prebuild', ['build', 'prebuild'], false), false);
});

test('isNpmHook: node-only test project', () => {
	const scripts = scriptsOf('node-only', 'package.json');
	const visible = scripts.filter((name) => !isNpmHook(name, scripts, true));
	assert.deepEqual(visible, ['dev', 'build', 'test', 'lint:fix', 'clean', 'build:css', 'rebuild-cache']);
});

test('isComposerEvent: command, installer and package events', () => {
	for (const name of ['post-install-cmd', 'pre-update-cmd', 'post-autoload-dump', 'post-root-package-install', 'pre-operations-exec', 'post-package-install']) {
		assert.equal(isComposerEvent(name), true, name);
	}
});

test('isComposerEvent: custom scripts and plugin event names are not hidden', () => {
	for (const name of ['test', 'init', 'command', 'pre-command-run', 'post-deploy']) {
		assert.equal(isComposerEvent(name), false, name);
	}
});

test('isComposerEvent: composer-only test project', () => {
	const visible = scriptsOf('composer-only', 'composer.json').filter((name) => !isComposerEvent(name));
	assert.deepEqual(visible, ['test', 'analyse', 'clean', 'init']);
});

test('isYarnBerry: .yarnrc.yml or packageManager yarn 2+', () => {
	assert.equal(isYarnBerry(undefined, true), true);
	assert.equal(isYarnBerry('yarn@4.5.0', false), true);
	assert.equal(isYarnBerry('yarn@2.0.0', false), true);
	assert.equal(isYarnBerry('yarn@1.22.19', false), false);
	assert.equal(isYarnBerry('pnpm@9.1.0', false), false);
	assert.equal(isYarnBerry(undefined, false), false);
});
