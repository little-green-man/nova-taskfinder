import { state, useProject, settle } from '../nova';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { VscodeParser } from '../../../src/parsers';

const root = resolve('tests/projects/vscode-tasks');
const provide = async () => {
	const tasks = await new VscodeParser().provideTasks();
	await settle();
	return tasks as any[];
};
const named = (tasks: any[], name: string) => tasks.find((task) => task.name === name);

test('vscode-tasks: lists runnable tasks, reading tasks.json only', async () => {
	useProject('vscode-tasks');
	const tasks = await provide();
	assert.equal(tasks.length, 9);
	assert.deepEqual(state.ran, []);
	assert.deepEqual(state.notifications, []);

	const build = named(tasks, 'Build workspace');
	assert.deepEqual(Object.keys(build.actions), ['run', 'build']);
	assert.equal(build.actions.run.command, '/bin/sh');
	assert.deepEqual(build.actions.run.options, {
		cwd: root,
		args: ['-c', "echo 'vscode: build workspace (⌘B)'"],
		env: { GREETING: 'hello' },
		shell: true,
	});

	const npm = named(tasks, 'npm: dev');
	assert.deepEqual(npm.actions.run.options.args, ['-c', 'npm run dev']);
	assert.equal(npm.actions.run.options.cwd, `${root}/web`);
	assert.deepEqual(named(tasks, 'Process task').actions.run.options.args, ['-c', "echo 'vscode: a process task, env' /home"]);
});

test('vscode-tasks: npm tasks use the Package Manager setting', async () => {
	useProject('vscode-tasks');
	state.globalConfig.set('taskfinder.package-manager', 'bun');
	assert.deepEqual(named(await provide(), 'npm: dev').actions.run.options.args, ['-c', 'bun run dev']);
});

test('vscode-tasks: open-file tasks resolve when they run, from the active editor', async () => {
	useProject('vscode-tasks');
	const task = named(await provide(), 'Build from current open file');
	assert.ok(task.actions.run instanceof (globalThis as any).TaskResolvableAction);
	assert.equal(task.actions.build, task.actions.run);
	const assistant = new VscodeParser() as any;

	/* no file open: explains, rather than running with empty paths */
	const none = assistant.resolveTaskAction({ data: task.actions.run.options.data });
	assert.equal(none.command, '/bin/echo');
	assert.match(none.options.args[0], /uses the open file/);

	state.editor = { path: `${root}/web/src/app.js`, text: 'one\ntwo', selection: [5, 7] };
	const action = assistant.resolveTaskAction({ data: task.actions.run.options.data });
	assert.deepEqual(action.options.args, ['-c', `echo "vscode: running in the open file's folder:" && pwd`]);
	assert.equal(action.options.cwd, `${root}/web/src`);
	assert.equal(action.options.shell, true);
});

test('resolveFileVariables at run time: line, column and selection from the editor', async () => {
	useProject('vscode-tasks');
	state.root = '/work';
	state.editor = { path: '/work/src/a.ts', text: 'one\ntwo\nthree', selection: [9, 12] };
	const data = { name: 'x', line: 'echo ${relativeFile}:${lineNumber}:${columnNumber} ${selectedText}', build: false, needsFile: true };
	const action = (new VscodeParser() as any).resolveTaskAction({ data });
	assert.deepEqual(action.options.args, ['-c', 'echo src/a.ts:3:2 hre']);
});

test('resolveTaskAction: unknown data prints a message instead of failing', () => {
	useProject('vscode-tasks');
	const action = (new VscodeParser() as any).resolveTaskAction({ data: null });
	assert.equal(action.command, '/bin/echo');
});

test('broken-vscode: invalid JSONC notifies with Open File, and lists nothing', async () => {
	useProject('broken-vscode');
	assert.deepEqual(await provide(), []);
	assert.deepEqual(
		state.notifications.map((n) => n.id),
		['taskfinder.vscode-invalid-json']
	);
	assert.match(state.notifications[0].body ?? '', /^VS Code tasks can't be listed until it's fixed: /);
});

test('no .vscode/tasks.json: nothing listed', async () => {
	useProject('node-only');
	assert.deepEqual(await provide(), []);
	assert.deepEqual(state.notifications, []);
});
