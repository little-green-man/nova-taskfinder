import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { createReloader, isWatchedFile } from '../../src/watch';

test('isWatchedFile: root files by relative or absolute path', () => {
	const files = ['package.json', 'routes/console.php'];
	assert.equal(isWatchedFile(files, 'package.json', '/p'), true);
	assert.equal(isWatchedFile(files, './package.json', '/p'), true);
	assert.equal(isWatchedFile(files, '/p/package.json', '/p'), true);
	assert.equal(isWatchedFile(files, '/p/routes/console.php', '/p'), true);
});

test('isWatchedFile: ignores nested copies and other folders', () => {
	const files = ['package.json'];
	assert.equal(isWatchedFile(files, '/p/node_modules/x/package.json', '/p'), false);
	assert.equal(isWatchedFile(files, '/other/package.json', '/p'), false);
	assert.equal(isWatchedFile(files, '/p/package.json.bak', '/p'), false);
});

test('createReloader: a burst of changes reloads once, after the delay', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	const reloads: string[] = [];
	const reloader = createReloader((id) => reloads.push(id), 300);

	reloader.schedule('node');
	mock.timers.tick(200);
	reloader.schedule('node');
	reloader.schedule('composer');
	mock.timers.tick(299);
	assert.deepEqual(reloads, []);
	mock.timers.tick(1);
	assert.deepEqual(reloads, ['node', 'composer']);
	mock.timers.reset();
});

test('createReloader: cancel and cancelAll drop pending reloads', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	const reloads: string[] = [];
	const reloader = createReloader((id) => reloads.push(id), 300);

	reloader.schedule('node');
	reloader.schedule('composer');
	reloader.cancel('node');
	mock.timers.tick(300);
	assert.deepEqual(reloads, ['composer']);

	reloader.schedule('node');
	reloader.cancelAll();
	mock.timers.tick(300);
	assert.deepEqual(reloads, ['composer']);
	mock.timers.reset();
});
