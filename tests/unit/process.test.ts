import { state, useProject, script } from './nova';
import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { isInstalled, run, shellQuote, stopAll, LIST_TIMEOUT } from '../../src/process';
import { diagnoseArtisan, diagnoseJust, diagnoseMaid, diagnoseMake, diagnoseTaskfile } from '../../src/diagnose';

/* Let queued process output and exits run (setImmediate isn't faked) */
const flush = () => new Promise((done) => setImmediate(done));

const withFakeTimers = async (fn: () => Promise<void>) => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		await fn();
	} finally {
		mock.timers.reset();
	}
};

test('run: a command that finishes in time is never signalled', () =>
	withFakeTimers(async () => {
		useProject('node-only');
		script('just --list', { stdout: 'ok\n' });
		const result = await run('just', ['--list']);
		assert.deepEqual(result, { status: 0, stdout: 'ok\n', stderr: '' });
		mock.timers.tick(LIST_TIMEOUT * 2);
		assert.deepEqual(state.signals, []);
	}));

test('run: a hung command is terminated after the timeout', () =>
	withFakeTimers(async () => {
		useProject('node-only');
		script('make -pRrq', { hang: true, stdout: 'partial\n' });
		let result: any;
		run('make', ['-pRrq']).then((r) => (result = r));
		await flush();

		mock.timers.tick(LIST_TIMEOUT - 1);
		await flush();
		assert.equal(result, undefined);

		mock.timers.tick(1);
		await flush();
		assert.deepEqual(state.signals, ['terminate make -pRrq']);
		assert.deepEqual(result, { status: 143, stdout: 'partial\n', stderr: '', timedOut: true });
	}));

test('run: a command that ignores terminate is killed 2 s later, and resolves once', () =>
	withFakeTimers(async () => {
		useProject('node-only');
		script('php artisan list --format=json', { hang: true, ignoresTerminate: true });
		const results: any[] = [];
		run('php', ['artisan', 'list', '--format=json']).then((r) => results.push(r));
		await flush();

		mock.timers.tick(LIST_TIMEOUT);
		await flush();
		assert.equal(results.length, 0);
		mock.timers.tick(2000);
		await flush();
		assert.deepEqual(state.signals, ['terminate php artisan list --format=json', 'kill php artisan list --format=json']);
		assert.equal(results.length, 1);
		assert.equal(results[0].timedOut, true);
	}));

test('stopAll: terminates listing processes still running', () =>
	withFakeTimers(async () => {
		useProject('node-only');
		script('task --list-all --json', { hang: true });
		let result: any;
		run('task', ['--list-all', '--json']).then((r) => (result = r));
		await flush();

		stopAll();
		await flush();
		assert.deepEqual(state.signals, ['terminate task --list-all --json']);
		assert.equal(result.status, 143);
		assert.equal(result.timedOut, undefined);
	}));

test('isInstalled: a check that times out (5 s) counts as installed', () =>
	withFakeTimers(async () => {
		useProject('node-only');
		script('command -v just', { hang: true });
		let installed: boolean | undefined;
		isInstalled('just').then((value) => (installed = value));
		await flush();
		mock.timers.tick(5000);
		await flush();
		assert.equal(installed, true);
	}));

test('diagnose: a timed-out listing is reported as a timeout', () => {
	const timedOut = { status: 143, stdout: '', stderr: '', timedOut: true };
	assert.equal(diagnoseTaskfile(timedOut).kind, 'timeout');
	assert.equal(diagnoseJust(timedOut).kind, 'timeout');
	assert.equal(diagnoseMake(timedOut).kind, 'timeout');
	assert.equal(diagnoseArtisan(timedOut).kind, 'timeout');
	assert.equal(diagnoseMaid([{ status: 1, stdout: '', stderr: 'x' }, timedOut]).kind, 'timeout');
});

test('shellQuote: plain words unchanged; anything else single-quoted', () => {
	assert.equal(shellQuote('/usr/local/bin/maid'), '/usr/local/bin/maid');
	assert.equal(shellQuote('/Users/me/My Tools/maid'), "'/Users/me/My Tools/maid'");
	assert.equal(shellQuote("it's"), "'it'\\''s'");
});
