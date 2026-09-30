import { state, fixture, useProject, install, script, settle, summarise } from '../nova';
import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	ArtisanParser,
	ComposerParser,
	DenoParser,
	JustParser,
	MakeParser,
	MaidfileParser,
	PackageJsonParser,
	TaskfileParser,
	makeFiles,
} from '../../../src/parsers';

const ids = () => state.notifications.map((n) => n.id);
const tasksOf = async (parser: { provideTasks(): any }) => {
	const tasks = await parser.provideTasks();
	await settle();
	return tasks.map(summarise);
};

/* just */

const JUST_DUMP = 'just --dump --dump-format json';

test("just-only: recipes and module recipes; Build bound, but a module's clean isn't the project's Clean", async () => {
	useProject('just-only');
	install('just');
	script(JUST_DUMP, { stdout: fixture('just-dump.json') });
	assert.deepEqual(await tasksOf(new JustParser()), [
		['build', 'run+build', 'just build'],
		['test', 'run', 'just test'],
		['watch', 'run', 'just watch'],
		['sub::clean', 'run', 'just sub::clean'],
		['sub::lint', 'run', 'just sub::lint'],
	]);
});

test('just: [confirm] recipes with Run with --yes', async () => {
	useProject('just-only');
	install('just');
	script(JUST_DUMP, { stdout: fixture('just-dump.json') });
	state.workspaceConfig.set('taskfinder.just-confirm-recipes', 'yes');
	assert.ok((await tasksOf(new JustParser())).some(([name, , command]: string[]) => name === 'release' && command === 'just --yes release'));
});

test('just: missing, old and broken', async () => {
	useProject('just-only');
	await tasksOf(new JustParser());
	assert.deepEqual(ids(), ['taskfinder.just-missing']);

	useProject('just-only');
	install('just');
	script(JUST_DUMP, { status: 2, stderr: "error: Found argument '--dump-format' which wasn't expected\n" });
	await tasksOf(new JustParser());
	assert.deepEqual(ids(), ['taskfinder.just-old']);

	useProject('broken-justfile');
	install('just');
	script(JUST_DUMP, { status: 1, stderr: fixture('just-error.txt') });
	await tasksOf(new JustParser());
	assert.deepEqual(ids(), ['taskfinder.justfile-error']);
	assert.equal(state.notifications[0].title, 'justfile has an error');
});

/* Deno */

test('deno-only: tasks from deno.jsonc, run with deno task', async () => {
	useProject('deno-only');
	install('deno');
	assert.deepEqual(await tasksOf(new DenoParser()), [
		['dev', 'run', 'deno task dev'],
		['build', 'run+build', 'deno task build'],
		['all', 'run', 'deno task all'],
		['url', 'run', 'deno task url'],
	]);
	assert.deepEqual(state.notifications, []);
});

test('deno: missing tool still lists tasks; broken file notifies', async () => {
	useProject('deno-only');
	assert.equal((await tasksOf(new DenoParser())).length, 4);
	assert.deepEqual(ids(), ['taskfinder.deno-missing']);

	useProject('broken-deno');
	install('deno');
	assert.deepEqual(await tasksOf(new DenoParser()), []);
	assert.deepEqual(ids(), ['taskfinder.deno-invalid-json']);
	assert.deepEqual(state.notifications[0].actions, ['Open File', 'Dismiss']);
});

/* Make */

const MAKE_DB = 'make -pRrq -f Makefile :';

test('make-only: Make database (default) lists .PHONY targets including included files', async () => {
	useProject('make-only');
	install('make');
	script(MAKE_DB, { status: 2, stdout: fixture('make-database.txt'), stderr: "make: *** No rule to make target `:'.  Stop.\n" });
	assert.deepEqual(await tasksOf(new MakeParser()), [
		['build', 'run+build', 'make build'],
		['clean', 'run+clean', 'make clean'],
		['lint', 'run', 'make lint'],
		['test', 'run', 'make test'],
	]);
	assert.ok(makeFiles.includes('extra.mk'), 'included file is watched');
});

test('make-only: Read Makefile runs nothing and follows literal includes', async () => {
	useProject('make-only');
	state.globalConfig.set('taskfinder.make-listing', 'file');
	assert.deepEqual(
		(await tasksOf(new MakeParser())).map(([name]: string[]) => name),
		['build', 'test', 'clean', 'lint']
	);
	assert.deepEqual(state.ran, []);
});

test('make: Parallel Jobs adds -j per core and the flags; output sync is left out for make 3.81', async () => {
	useProject('make-only');
	state.globalConfig.set('taskfinder.make-listing', 'file');
	state.globalConfig.set('taskfinder.make-flags', '--output-sync=target');
	assert.equal((await tasksOf(new MakeParser()))[0][2], 'make build', 'no -j, so no output sync');

	state.workspaceConfig.set('taskfinder.make-jobs', 'auto');
	script('make --version', { stdout: 'GNU Make 4.4.1\n' });
	assert.equal((await tasksOf(new MakeParser()))[0][2], 'make -j$(sysctl -n hw.ncpu) --output-sync=target build');

	script('make --version', { stdout: 'GNU Make 3.81\n' });
	assert.equal((await tasksOf(new MakeParser()))[0][2], 'make -j$(sysctl -n hw.ncpu) build');
});

test('make: missing (database mode) and broken Makefile', async () => {
	useProject('make-only');
	await tasksOf(new MakeParser());
	assert.deepEqual(ids(), ['taskfinder.make-missing']);

	useProject('broken-makefile');
	install('make');
	script(MAKE_DB, { status: 2, stderr: fixture('make-error.txt') });
	assert.deepEqual(await tasksOf(new MakeParser()), []);
	assert.deepEqual(ids(), ['taskfinder.makefile-error']);
	assert.match(state.notifications[0].body ?? '', /missing separator/);
});

/* artisan */

const ARTISAN_LIST = 'php artisan list --format=json';

test('laravel: Common commands, run with php artisan', async () => {
	useProject('laravel');
	install('php');
	script(ARTISAN_LIST, { stdout: fixture('../projects/laravel/artisan-list.json') });
	const tasks = await tasksOf(new ArtisanParser());
	assert.equal(tasks.length, 11);
	assert.deepEqual(
		tasks.find(([name]: string[]) => name === 'serve'),
		['serve', 'run', 'php artisan serve']
	);
});

test('laravel: a real app prints all its JSON on one long line, which may arrive in pieces', async () => {
	useProject('laravel');
	install('php');
	const oneLine = JSON.stringify(JSON.parse(fixture('../projects/laravel/artisan-list.json')));
	script(ARTISAN_LIST, { stdout: oneLine });
	state.chunkSize = 1000;
	assert.equal((await tasksOf(new ArtisanParser())).length, 11);
	assert.deepEqual(state.notifications, []);
});

test('laravel: All lists more', async () => {
	useProject('laravel');
	install('php');
	script(ARTISAN_LIST, { stdout: fixture('../projects/laravel/artisan-list.json') });
	state.workspaceConfig.set('taskfinder.artisan-commands', 'all');
	assert.equal((await tasksOf(new ArtisanParser())).length, 13);
});

test('laravel: php missing, and a broken app opens the failing file at its line', async () => {
	useProject('laravel');
	await tasksOf(new ArtisanParser());
	assert.deepEqual(ids(), ['taskfinder.php-missing']);

	useProject('broken-laravel');
	install('php');
	script(ARTISAN_LIST, { status: 1, stdout: fixture('artisan-error.txt') });
	assert.deepEqual(await tasksOf(new ArtisanParser()), []);
	assert.deepEqual(state.notifications, [
		{
			id: 'taskfinder.artisan-error',
			title: "Laravel couldn't list its commands",
			body: 'ParseError syntax error, unexpected identifier "oops", expecting ")"',
			actions: ['Open File', 'Dismiss'],
		},
	]);
});

test('listdir failing and stat throwing for missing files (a *.novaextension folder): root files are still found', async () => {
	useProject('make-only');
	state.listdirFails = true;
	state.statThrowsIfMissing = true;
	state.globalConfig.set('taskfinder.make-listing', 'file');
	assert.deepEqual(
		(await tasksOf(new MakeParser())).map(([name]: string[]) => name),
		['build', 'test', 'clean', 'lint']
	);
});

test('no root file: nothing runs', async () => {
	useProject('node-only');
	install('just', 'make', 'php', 'deno');
	for (const parser of [new JustParser(), new DenoParser(), new MakeParser(), new ArtisanParser()]) assert.deepEqual(await tasksOf(parser), []);
	assert.deepEqual(state.ran, []);
});

test('every file opened is closed (leaked handles make all file access fail in Nova)', async () => {
	for (const project of ['all-sources', 'make-only', 'deno-only', 'broken-deno', 'pnpm-lockfile', 'broken-json']) {
		useProject(project);
		state.globalConfig.set('taskfinder.make-listing', 'file');
		for (const parser of [
			new PackageJsonParser(),
			new ComposerParser(),
			new TaskfileParser(),
			new MaidfileParser(),
			new JustParser(),
			new DenoParser(),
			new MakeParser(),
			new ArtisanParser(),
		]) {
			await parser.provideTasks();
		}
		await settle();
		assert.equal(state.openFiles, 0, project);
	}
});

test('a listing that hangs is stopped after 15 s, with a Refresh button; a later listing clears it', async () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		useProject('just-only');
		install('just');
		script(JUST_DUMP, { hang: true });
		let tasks: any;
		new JustParser().provideTasks().then((t: any) => (tasks = t));
		for (let i = 0; i < 5; i++) await new Promise((done) => setImmediate(done));

		mock.timers.tick(15000);
		for (let i = 0; i < 5; i++) await new Promise((done) => setImmediate(done));
		assert.deepEqual(tasks, []);
		assert.deepEqual(state.signals, [`terminate ${JUST_DUMP}`]);
		assert.deepEqual(state.notifications, [
			{
				id: 'taskfinder.just-timeout',
				title: 'just took too long',
				body: 'Listing just recipes was stopped after 15 seconds. Refresh tries again.',
				actions: ['Refresh', 'Dismiss'],
			},
		]);

		script(JUST_DUMP, { stdout: fixture('just-dump.json') });
		await new JustParser().provideTasks();
		assert.ok(state.cancelled.includes('taskfinder.just-timeout'));
	} finally {
		mock.timers.reset();
	}
});
