import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { artisanCommands, denoTasks, justRecipes, makeRulesFromDatabase, makeRulesFromText, makeTargets, parseJsonc } from '../../src/recipes';
import { artisanErrorLocation, diagnoseArtisan, diagnoseJust, diagnoseMake, errorDetail } from '../../src/diagnose';

const read = (path: string) => readFileSync(path, 'utf8');

/* just */

test('justRecipes: runnable recipes, modules as namepaths, [confirm] excluded by default', () => {
	const dump = JSON.parse(read('tests/fixtures/just-dump.json'));
	assert.deepEqual(justRecipes(dump, 'exclude'), [
		{ name: 'build', args: ['build'] },
		{ name: 'test', args: ['test'] },
		{ name: 'watch', args: ['watch'] },
		{ name: 'sub::clean', args: ['sub::clean'] },
		{ name: 'sub::lint', args: ['sub::lint'] },
	]);
});

test('justRecipes: [confirm] recipes run with --yes when chosen', () => {
	const dump = JSON.parse(read('tests/fixtures/just-dump.json'));
	assert.deepEqual(
		justRecipes(dump, 'yes').find((task) => task.name === 'release'),
		{ name: 'release', args: ['--yes', 'release'] }
	);
});

test('justRecipes: parameters', () => {
	const recipe = (parameters: any[]) => ({ recipes: { r: { name: 'r', namepath: 'r', private: false, attributes: [], parameters } } });
	assert.equal(justRecipes(recipe([{ name: 'a', kind: 'singular', default: null }]), 'exclude').length, 0);
	assert.equal(justRecipes(recipe([{ name: 'a', kind: 'plus', default: null }]), 'exclude').length, 0);
	assert.equal(justRecipes(recipe([{ name: 'a', kind: 'plus', default: 'x' }]), 'exclude').length, 1);
	assert.equal(justRecipes(recipe([{ name: 'a', kind: 'star', default: null }]), 'exclude').length, 1);
	assert.deepEqual(justRecipes({}, 'exclude'), []);
});

test('diagnoseJust: ok, error, old version', () => {
	assert.equal(diagnoseJust({ status: 0, stdout: read('tests/fixtures/just-dump.json'), stderr: '' }).kind, 'ok');
	assert.deepEqual(diagnoseJust({ status: 1, stdout: '', stderr: read('tests/fixtures/just-error.txt') }), {
		kind: 'error',
		detail: "expected '*', ':', '$', identifier, or '+', but found end of line",
	});
	assert.equal(diagnoseJust({ status: 2, stdout: '', stderr: "error: Found argument '--dump-format' which wasn't expected\n" }).kind, 'old-version');
	assert.equal(diagnoseJust({ status: 1, stdout: '', stderr: 'The JSON dump format is currently unstable. Invoke `just` with the `--unstable` flag\n' }).kind, 'old-version');
});

/* Deno */

test('parseJsonc: comments and trailing commas, strings untouched', () => {
	assert.deepEqual(parseJsonc('{\n// c\n"a": "http://x//y", /* b */ "b": [1, 2,],\n}'), { a: 'http://x//y', b: [1, 2] });
	assert.deepEqual(parseJsonc('{"a": "quote \\" // not a comment"}'), { a: 'quote " // not a comment' });
	assert.throws(() => parseJsonc('{ "a": '));
});

test('denoTasks: string, object and dependency-only tasks', () => {
	assert.deepEqual(denoTasks(parseJsonc(read('tests/projects/deno-only/deno.jsonc'))), ['dev', 'build', 'all', 'url']);
	assert.deepEqual(denoTasks({}), []);
	assert.deepEqual(denoTasks({ tasks: { a: 'x', b: 42, c: null } }), ['a']);
});

/* Make */

test('makeRulesFromText: targets, .PHONY and literal includes; assignments and recipes skipped', () => {
	const rules = makeRulesFromText(read('tests/projects/make-only/Makefile'));
	assert.deepEqual(rules.phony, ['build', 'test', 'clean', 'lint']);
	assert.deepEqual(rules.includes, ['extra.mk']);
	assert.ok(!rules.targets.includes('VERSION'));
	assert.deepEqual(makeTargets(rules), ['build', 'test', 'clean']);
});

test('makeRulesFromText: define blocks, continuations, :: rules and ::= assignments', () => {
	const rules = makeRulesFromText('define X\nfake: target\nendef\nA ::= 1\nB ?= 2\nall:: one \\\n  two\n\t@echo recipe: not a rule\n-include $(DEPS) local.mk *.d\n');
	assert.deepEqual(rules.targets, ['all']);
	assert.deepEqual(rules.includes, ['local.mk']);
});

test('makeRulesFromDatabase: includes included files, skips Not a target, sorted', () => {
	const rules = makeRulesFromDatabase(read('tests/fixtures/make-database.txt'));
	assert.deepEqual(makeTargets(rules), ['build', 'clean', 'lint', 'test']);
	assert.ok(rules.targets.includes('app.o') && rules.targets.includes('docs/site'));
	assert.ok(!rules.targets.includes('Makefile'));
});

test('makeTargets: without .PHONY, only name-like targets', () => {
	assert.deepEqual(
		makeTargets({ targets: ['build', 'app.o', 'docs/site', '_internal', '%.o', '.DEFAULT', 'test', 'build', '$(OUT)'], phony: [], includes: [] }),
		['build', 'test']
	);
});

test('diagnoseMake: the : goal error is ignored; real errors reported', () => {
	assert.equal(diagnoseMake({ status: 2, stdout: 'db', stderr: "make: *** No rule to make target `:'.  Stop.\n" }).kind, 'ok');
	assert.equal(diagnoseMake({ status: 2, stdout: 'db', stderr: "make: *** No rule to make target ':'.  Stop.\n" }).kind, 'ok');
	assert.deepEqual(diagnoseMake({ status: 2, stdout: '', stderr: read('tests/fixtures/make-error.txt') }), {
		kind: 'error',
		detail: 'Makefile:2: *** missing separator.  Stop.',
	});
});

/* artisan */

const artisanList = () => JSON.parse(read('tests/projects/laravel/artisan-list.json'));

test('artisanCommands: Common is the curated list plus app:*', () => {
	assert.deepEqual(artisanCommands(artisanList(), 'common').sort(), ['about', 'app:hello', 'db:seed', 'migrate', 'migrate:fresh', 'optimize:clear', 'pail', 'queue:work', 'route:list', 'serve', 'test']);
});

test('artisanCommands: All skips hidden, required-argument and terminal-only commands', () => {
	const all = artisanCommands(artisanList(), 'all');
	for (const name of ['cache:clear', 'config:cache', 'app:hello', 'serve']) assert.ok(all.includes(name), name);
	for (const name of ['make:controller', 'cache:forget', 'tinker', 'dev', 'docs', 'help', 'list', '_complete']) assert.ok(!all.includes(name), name);
});

test('diagnoseArtisan and artisanErrorLocation: Laravel errors on stdout', () => {
	const output = read('tests/fixtures/artisan-error.txt');
	assert.deepEqual(diagnoseArtisan({ status: 1, stdout: output, stderr: '' }), {
		kind: 'error',
		detail: 'ParseError syntax error, unexpected identifier "oops", expecting ")"',
	});
	assert.deepEqual(artisanErrorLocation(output), { file: 'routes/console.php', line: 9 });
	assert.equal(artisanErrorLocation('  at vendor/laravel/framework/src/x.php:12'), null);
	assert.equal(diagnoseArtisan({ status: 0, stdout: JSON.stringify(artisanList()), stderr: '' }).kind, 'ok');
});

test('errorDetail: a bare heading line takes the next line too', () => {
	assert.equal(errorDetail('   ParseError \n\n  syntax error\n', 'x'), 'ParseError syntax error');
});
