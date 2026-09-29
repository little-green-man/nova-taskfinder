/**
 * Stand-in Nova globals for running parsers under Node.
 * Import this before any `src/` module: `src/tasks.ts` reads `Task.Run` when it loads.
 *
 * - Files are read from a real project folder (`useProject()`, usually `tests/projects/<name>`).
 * - Processes return scripted results (`script()`), usually captured real output from `tests/fixtures/`.
 *   `command -v <tool>` succeeds for tools passed to `install()`. Anything unscripted exits 127.
 * - Settings, notifications, opened URLs/files and created tasks are recorded in `nova.state`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { resetState as resetProcess } from '../../src/process';
import { resetState as resetNotify } from '../../src/notify';

interface Result {
	status: number;
	stdout: string;
	stderr: string;
}

interface RecordedNotification {
	id: string;
	title?: string;
	body?: string;
	actions: string[];
}

const state = {
	root: '',
	/* simulate Nova file calls failing (seen when the extension ran out of file handles) */
	listdirFails: false,
	statThrowsIfMissing: false,
	installed: new Set<string>(),
	scripts: new Map<string, Result>(),
	workspaceConfig: new Map<string, unknown>(),
	globalConfig: new Map<string, unknown>(),
	notifications: [] as RecordedNotification[],
	cancelled: [] as string[],
	urls: [] as string[],
	ran: [] as string[],
	/* files opened and not yet closed */
	openFiles: 0,
	/* deliver stdout in pieces of this many characters without newlines, as Nova may do for very long lines (0 = whole lines) */
	chunkSize: 0,
};

/** Loads a file from `tests/fixtures/`. */
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

const config = (values: Map<string, unknown>) => ({
	get: (key: string) => (values.has(key) ? values.get(key) : null),
	set: (key: string, value: unknown) => values.set(key, value),
	onDidChange: () => ({ dispose() {} }),
});

const g = globalThis as any;

/* Parsers log progress; keep test output readable */
console.info = () => {};
console.log = () => {};
console.warn = () => {};

g.nova = {
	extension: { version: 'test' },
	workspace: {
		get path() {
			return state.root;
		},
		config: config(state.workspaceConfig),
		openFile: (path: string) => state.urls.push(`file:${path}`),
		openConfig: () => state.urls.push('config:project'),
		reloadTasks: () => {},
	},
	config: config(state.globalConfig),
	path: { join, dirname, basename },
	fs: {
		stat: (path: string) => {
			try {
				const stats = statSync(path);
				return { isFile: () => stats.isFile(), isDirectory: () => stats.isDirectory() };
			} catch {
				if (state.statThrowsIfMissing) throw new Error('The operation couldn’t be completed. (NSCocoaErrorDomain error 512.)');
				return null;
			}
		},
		open: (path: string) => {
			const contents = readFileSync(path, 'utf8');
			state.openFiles++;
			let closed = false;
			return {
				read: () => contents,
				close: () => {
					if (!closed) state.openFiles--;
					closed = true;
				},
			};
		},
		listdir: (path: string) => {
			if (state.listdirFails) throw new Error('The operation couldn’t be completed. (NSCocoaErrorDomain error 256.)');
			return readdirSync(path);
		},
	},
	notifications: {
		add: (request: any) => {
			state.notifications.push({ id: request.identifier, title: request.title, body: request.body, actions: request.actions ?? [] });
			return new Promise(() => {});
		},
		cancel: (id: string) => state.cancelled.push(id),
	},
	openURL: (url: string) => state.urls.push(url),
};

g.NotificationRequest = class {
	identifier: string;
	constructor(identifier: string) {
		this.identifier = identifier;
	}
};

g.TaskProcessAction = class {
	constructor(
		public command: string,
		public options: { args?: string[]; cwd?: string; shell?: boolean }
	) {}
};

g.Task = class {
	static Run = 'run';
	static Build = 'build';
	static Clean = 'clean';
	actions: Record<string, any> = {};
	constructor(public name: string) {}
	setAction(name: string, action: any) {
		this.actions[name] = action;
	}
};

g.Process = class {
	private handlers: Record<string, (value: any) => void> = {};
	private line: string;
	constructor(command: string, options: { args?: string[] }) {
		this.line = [command, ...(options.args ?? [])].join(' ');
	}
	onStdout(fn: (line: string) => void) {
		this.handlers.stdout = fn;
	}
	onStderr(fn: (line: string) => void) {
		this.handlers.stderr = fn;
	}
	onDidExit(fn: (status: number) => void) {
		this.handlers.exit = fn;
	}
	start() {
		state.ran.push(this.line);
		const check = this.line.match(/^command -v (\S+)$/);
		const result = check
			? { status: state.installed.has(check[1]) ? 0 : 1, stdout: '', stderr: '' }
			: (state.scripts.get(this.line) ?? { status: 127, stdout: '', stderr: `not scripted: ${this.line}` });
		queueMicrotask(() => {
			/* Nova delivers output line by line */
			const pieces = state.chunkSize > 0 ? (result.stdout.match(new RegExp(`[^]{1,${state.chunkSize}}`, 'g')) ?? []) : result.stdout.split(/(?<=\n)/).filter(Boolean);
			pieces.forEach((piece) => this.handlers.stdout?.(piece));
			result.stderr.split(/(?<=\n)/).filter(Boolean).forEach((line) => this.handlers.stderr?.(line));
			this.handlers.exit?.(result.status);
		});
	}
};

/** Resets everything, including the extension's own caches, and points the workspace at a project. */
function useProject(name: string, root = 'tests/projects') {
	/* reset the extension's own state first: it cancels showing notifications, which is recorded below */
	resetProcess();
	resetNotify();
	state.root = resolve(root, name);
	state.listdirFails = false;
	state.statThrowsIfMissing = false;
	state.installed.clear();
	state.scripts.clear();
	state.workspaceConfig.clear();
	state.globalConfig.clear();
	state.notifications.length = 0;
	state.cancelled.length = 0;
	state.urls.length = 0;
	state.ran.length = 0;
	state.openFiles = 0;
	state.chunkSize = 0;
}

const install = (...tools: string[]) => tools.forEach((tool) => state.installed.add(tool));

const script = (commandLine: string, result: Partial<Result>) => state.scripts.set(commandLine, { status: 0, stdout: '', stderr: '', ...result });

/** Waits for fire-and-forget work (install checks, notifications) to settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

/** A task as `[name, actions, command line]`, e.g. `['build', 'run+build', 'npm run build']`. */
const summarise = (task: any) => {
	const action = task.actions.run;
	return [task.name, Object.keys(task.actions).join('+'), [action.command, ...(action.options.args ?? [])].join(' ')];
};

export { state, fixture, useProject, install, script, settle, summarise };
