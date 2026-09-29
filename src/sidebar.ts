/**
 * The Automatic Tasks sidebar: every source's tasks, grouped as in the Tasks menu, run with a double-click.
 * Nova has no API to start its own tasks, so the sidebar runs them itself with Process, outside Nova's task system:
 * status shows in each row's icon and text, and output streams into a log file per task. See DESIGN.md → Tasks sidebar.
 */

import { features } from './features';
import { latestTasks, onLatestChange } from './source';
import type { RunSpec } from './tasks';
import { KILL_DELAY } from './process';

interface Group {
	kind: 'group';
	id: string;
	name: string;
}

interface Row {
	kind: 'task';
	id: string;
	name: string;
	/** The feature (source) setting key */
	key: string;
}

type Element = Group | Row;

interface Run {
	name: string;
	line: string;
	process?: Process;
	started: number;
	ended?: number;
	/** Exit status; undefined while running */
	status?: number;
	stopped: boolean;
	/** The log file the output goes to, shown by Show Output */
	log?: string;
	/** Output not yet written to the log */
	pending: string;
	/** Characters in the log so far, to keep it under LOG_LIMIT */
	logSize: number;
	killTimer?: ReturnType<typeof setTimeout>;
}

/** How often output is written to the log, in ms: a write per line would be slow for chatty tasks */
const FLUSH_INTERVAL = 200;
/** A log past this many characters starts again, so a task left running for days can't fill the disk */
const LOG_LIMIT = 5_000_000;
const TRIMMED = '(earlier output removed)\n\n';

/* The latest run of each task, by row id */
const runs = new Map<string, Run>();
/* Elements are reused between reloads, so Nova keeps selection and expanded groups */
const elements = new Map<string, Element>();
let view: TreeView<Element> | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;
let flusher: ReturnType<typeof setInterval> | undefined;

const element = <E extends Element>(made: E): E => {
	const existing = elements.get(made.id) as E | undefined;
	if (existing) return existing;
	elements.set(made.id, made);
	return made;
};

/** Colour and cursor codes, which a document would show as noise */
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '').replace(/\r(?!\n)/g, '\n');

/** "12 s", "2 min 5 s", "1 h 3 min" */
function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s} s`;
	if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
	return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** A row's grey text: "running · 12 s", "✓ 3 s", "✗ exit 1", "stopped" */
function statusText(run: Run | undefined, now = Date.now()): string | undefined {
	if (!run) return undefined;
	if (run.status === undefined) return `running · ${formatDuration(now - run.started)}`;
	if (run.stopped) return 'stopped';
	return run.status === 0 ? `✓ ${formatDuration((run.ended ?? now) - run.started)}` : `✗ exit ${run.status}`;
}

const isRunning = (run: Run | undefined) => run !== undefined && run.status === undefined;

/** A row's icon, from Images/: idle, running, succeeded, failed or stopped */
function statusImage(run: Run | undefined): string {
	if (!run) return 'task-idle';
	if (run.status === undefined) return 'task-running';
	if (run.stopped) return 'task-stopped';
	return run.status === 0 ? 'task-succeeded' : 'task-failed';
}

const provider: TreeDataProvider<Element> = {
	getChildren(parent) {
		if (!parent)
			return features
				.filter((feature) => latestTasks(feature.key).length > 0)
				.map((feature) => element<Group>({ kind: 'group', id: feature.key, name: feature.name }));
		if (parent.kind !== 'group') return [];
		return latestTasks(parent.id).map((task) => element<Row>({ kind: 'task', id: `${parent.id}\n${task.name}`, name: task.name, key: parent.id }));
	},
	getParent(child) {
		return child.kind === 'task' ? (elements.get(child.key) ?? null) : null;
	},
	getTreeItem(el) {
		if (el.kind === 'group') {
			const item = new TreeItem(el.name, TreeItemCollapsibleState.Expanded);
			item.identifier = el.id;
			item.contextValue = 'source';
			return item;
		}
		const run = runs.get(el.id);
		const item = new TreeItem(el.name, TreeItemCollapsibleState.None);
		item.identifier = el.id;
		/* unset rather than undefined: Nova shows "undefined" */
		const status = statusText(run);
		if (status) item.descriptiveText = status;
		item.image = statusImage(run);
		item.contextValue = isRunning(run) ? 'running' : run ? 'finished' : 'task';
		item.tooltip = run ? `${run.line}\n${statusText(run)}` : 'Double-click to run';
		item.command = 'taskfinder.sidebar.open';
		return item;
	},
};

/* Redraws one row, or the whole tree when the tasks change */
const redraw = (el: Element | null = null) => {
	try {
		Promise.resolve(view?.reload(el)).catch((e) => console.error(`Sidebar: couldn't redraw: ${e}`));
	} catch (e) {
		console.error(`Sidebar: couldn't redraw: ${e}`);
	}
};

/* Redraws one task's row: its status changed */
const redrawRow = (id: string) => {
	const el = elements.get(id);
	if (el) redraw(el);
};

/* While anything runs, redraw the running rows each second so the times count up; stops when nothing runs */
const tick = () => {
	const anyRunning = [...runs.values()].some(isRunning);
	if (anyRunning && !ticker)
		ticker = setInterval(() => {
			runs.forEach((run, id) => {
				if (isRunning(run)) redrawRow(id);
			});
			tick();
		}, 1000);
	if (!anyRunning && ticker) {
		clearInterval(ticker);
		ticker = undefined;
	}
};

/* Writes text to a log file ('w' starts it, 'a' adds to it), closing it each time: open handles pile up in Nova */
function writeLog(path: string, text: string, mode: 'w' | 'a') {
	const file = nova.fs.open(path, mode) as FileTextMode;
	try {
		file.write(text);
	} finally {
		file.close();
	}
}

/* Writes pending output to each run's log; stops when nothing is running or pending */
function flush() {
	runs.forEach((run) => {
		if (!run.pending || !run.log) return;
		const text = run.pending;
		run.pending = '';
		try {
			if (run.logSize + text.length > LOG_LIMIT) {
				const kept = TRIMMED + text.slice(-LOG_LIMIT / 2);
				writeLog(run.log, kept, 'w');
				run.logSize = kept.length;
				return;
			}
			writeLog(run.log, text, 'a');
			run.logSize += text.length;
		} catch (e) {
			console.error(`Sidebar: couldn't write the output of "${run.name}": ${e}`);
		}
	});
	if (![...runs.values()].some((run) => run.pending || isRunning(run)) && flusher) {
		clearInterval(flusher);
		flusher = undefined;
	}
}

const append = (run: Run, text: string) => {
	run.pending += stripAnsi(text);
	if (!flusher) flusher = setInterval(flush, FLUSH_INTERVAL);
};

/* Creates a folder and any missing parents: nova.fs.mkdir makes one level at a time */
function makeFolder(path: string) {
	const exists = (dir: string) => {
		try {
			return nova.fs.stat(dir)?.isDirectory() === true;
		} catch {
			return false;
		}
	};
	if (exists(path)) return;
	const parent = nova.path.dirname(path);
	if (parent !== path) makeFolder(parent);
	nova.fs.mkdir(path);
}

const outputFolder = () => nova.path.join(nova.extension.workspaceStoragePath, 'Output');

/* Removes the last session's logs: they're only useful while the project is open */
function clearLogs() {
	try {
		const folder = outputFolder();
		if (!nova.fs.stat(folder)) return;
		nova.fs.listdir(folder).forEach((name) => nova.fs.remove(nova.path.join(folder, name)));
	} catch (e) {
		console.warn(`Sidebar: couldn't clear old output: ${e}`);
	}
}

/** A task's log file, in the extension's storage for this project: "build — Node.log" */
function logPath(row: Row): string | undefined {
	const source = features.find((feature) => feature.key === row.key)?.name.replace(/ \(.*\)$/, '') ?? 'task';
	const folder = outputFolder();
	makeFolder(folder);
	return nova.path.join(folder, `${row.name} — ${source}.log`.replace(/[/:]/g, '-'));
}

/** Opens the run's log file; Nova shows new output as it's written */
async function showOutput(run: Run) {
	flush();
	if (!run.log) {
		console.warn(`Sidebar: "${run.name}" has no output file (see the error above)`);
		return;
	}
	try {
		const editor = await nova.workspace.openFile(run.log);
		if (!editor) console.warn(`Sidebar: Nova didn't open ${run.log}`);
	} catch (e) {
		console.error(`Sidebar: couldn't open the output of "${run.name}": ${e}`);
	}
}

const describe = (spec: RunSpec) => [spec.command, ...spec.args].join(' ');

function start(row: Row) {
	const task = latestTasks(row.key).find((t) => t.name === row.name);
	if (!task) return;
	const spec = task.spec();
	const line = describe(spec);
	const run: Run = {
		name: row.name,
		line,
		started: Date.now(),
		stopped: false,
		pending: '',
		logSize: 0,
	};
	runs.set(row.id, run);
	try {
		run.log = logPath(row);
		const header = `$ ${line}\n${spec.cwd ? `(in ${spec.cwd})\n` : ''}\n`;
		if (run.log) writeLog(run.log, header, 'w');
		run.logSize = header.length;
	} catch (e) {
		console.error(`Sidebar: couldn't create the output file for "${run.name}": ${e}`);
		nova.workspace.showErrorMessage(
			`Automatic Tasks couldn't create the output file for "${run.name}": ${e}\n\n(${nova.extension.workspaceStoragePath})`
		);
		run.log = undefined;
	}

	const finish = (status: number) => {
		if (run.status !== undefined) return;
		clearTimeout(run.killTimer);
		run.status = status;
		run.ended = Date.now();
		append(
			run,
			`\n${run.stopped ? 'Stopped' : status === 0 ? 'Finished' : `Failed with exit ${status}`} after ${formatDuration(run.ended - run.started)}.\n`
		);
		tick();
		redrawRow(row.id);
	};

	try {
		const proc = new Process(spec.command, { args: spec.args, cwd: spec.cwd, env: spec.env, shell: spec.shell || undefined });
		run.process = proc;
		proc.onStdout((text) => append(run, text));
		proc.onStderr((text) => append(run, text));
		proc.onDidExit(finish);
		proc.start();
	} catch (e) {
		append(run, `Couldn't start: ${e}\n`);
		finish(-1);
	}
	void showOutput(run);
	tick();
	redrawRow(row.id);
}

function stop(run: Run | undefined) {
	if (!run || !isRunning(run) || run.stopped) return;
	run.stopped = true;
	try {
		run.process?.terminate();
	} catch {
		/* already gone */
	}
	run.killTimer = setTimeout(() => {
		try {
			run.process?.kill();
		} catch {
			/* already gone */
		}
	}, KILL_DELAY);
}

const selectedRow = (): Row | undefined => view?.selection.find((el): el is Row => el.kind === 'task');

/** Double-click: runs the task, or shows its output while it's running */
function open() {
	const row = selectedRow();
	if (!row) return;
	const run = runs.get(row.id);
	if (isRunning(run)) void showOutput(run as Run);
	else start(row);
}

/** Stops every sidebar run (Stop All, and on deactivate) */
function stopAllRuns() {
	runs.forEach(stop);
}

/** Creates the sidebar's tree and commands; returns what to dispose */
function createSidebar(): Disposable[] {
	clearLogs();
	view = new TreeView('taskfinder.tasks', { dataProvider: provider });
	onLatestChange(() => redraw());
	const register = (name: string, callback: () => void) => nova.commands.register(name, callback);
	return [
		view,
		register('taskfinder.sidebar.open', open),
		register('taskfinder.sidebar.run', () => {
			const row = selectedRow();
			if (row && !isRunning(runs.get(row.id))) start(row);
		}),
		register('taskfinder.sidebar.stop', () => {
			const row = selectedRow();
			if (row) stop(runs.get(row.id));
		}),
		register('taskfinder.sidebar.output', () => {
			const run = runs.get(selectedRow()?.id ?? '');
			if (run) void showOutput(run);
		}),
		register('taskfinder.sidebar.stop-all', stopAllRuns),
	];
}

/** Stops every run and forgets the sidebar's state (deactivate) */
function disposeSidebar() {
	flush();
	stopAllRuns();
	/* kill straight away: the extension is going, so kill timers may never fire */
	runs.forEach((run) => {
		try {
			if (isRunning(run)) run.process?.kill();
		} catch {
			/* already gone */
		}
	});
	clearInterval(ticker);
	clearInterval(flusher);
	ticker = undefined;
	flusher = undefined;
	runs.clear();
	elements.clear();
	onLatestChange(() => {});
	view = undefined;
}

export { createSidebar, disposeSidebar, formatDuration, statusText, stripAnsi };
