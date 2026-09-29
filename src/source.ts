/**
 * The shared pipeline every task source runs through. A source is a small definition (what it reads, which tool it needs,
 * how to list its tasks); this module finds its root file, checks the tool, lists (CLI listings time out in run()),
 * shows or clears notifications, logs how long it took, and builds Nova tasks.
 */

import { clearNotification, howToInstall, installUrls, notify, openRootFile, openUrl, turnOff } from './notify';
import type { NotificationAction } from './notify';
import { firstRootFile, isInstalled, LIST_TIMEOUT } from './process';
import { createTask, messageSpec, processAction, runSpec } from './tasks';
import type { RunSpec } from './tasks';
import type { ActionName } from './scripts';

interface ListedTask {
	name: string;
	command: string;
	args: string[];
	/** Folder to run in, relative to the root (workspace packages) */
	cwd?: string;
	/** The script's own name, for Build/Clean, when `name` has a package prefix */
	script?: string;
	env?: Record<string, string>;
	/** Nova actions to bind, instead of deciding from the name */
	actions?: ActionName[];
	/** Resolve the command when the task runs (see TaskOptions.resolve); the source's resolveAction() gets this */
	resolve?: Transferrable;
}

/** What a listing found: tasks, or a problem to tell the user about. */
type Listing =
	| { kind: 'ok'; tasks: ListedTask[] }
	| { kind: 'old-version' }
	| { kind: 'wrong-tool' }
	| { kind: 'timeout' }
	| {
			kind: 'error';
			detail: string;
			/** Replaces the default "<file> has an error" title */
			title?: string;
			/** Replaces the default "<listing> can't be listed: <detail>" body */
			body?: string;
			/** File (and line) to open; defaults to the root file. `null` for no Open File button. */
			open?: { file: string; line?: number } | null;
	  };

type ProblemKind = 'missing' | 'old-version' | 'wrong-tool' | 'timeout' | 'error';

interface Source {
	/** Log name and notification id prefix, e.g. `taskfile` → `taskfile-missing` */
	id: string;
	/** Names used in messages */
	names: {
		/** The tool, as a title: "Task", "PHP" */
		tool: string;
		/** What the project has: "a Taskfile", "Laravel's artisan" */
		file: string;
		/** What's listed, as a phrase that can start a sentence: "Taskfile tasks", "just recipes" */
		listing: string;
		/** The listing's noun alone: "tasks", "recipes", "targets", "commands" */
		noun: string;
		/** What Turn Off stops: "reading the Taskfile" */
		turnOff: string;
	};
	/** Root files that mark a project as using this source, most common spelling first */
	rootFiles: string[];
	/** The `taskfinder.auto-<source>` setting, for Turn Off */
	settingKey: string;
	/** Key in installUrls */
	installKey: string;
	/**
	 * The command checked with `command -v`, and whether listing needs it (`list`: no tasks without it)
	 * or only running does (`run`: tasks are still listed). Omit when the source checks for itself (Node).
	 */
	tool?: { command: string; needed: 'list' | 'run' } | ((rootFile: string) => { command: string; needed: 'list' | 'run' } | undefined);
	/** Custom notification ids, where they predate this module */
	ids?: Partial<Record<ProblemKind, string>>;
	/** Extra buttons for the `missing` and `wrong-tool` notifications, before Turn Off (e.g. Maid's path setting) */
	toolActions?: NotificationAction[];
	/** For tasks listed with `resolve`: builds the real action when the task runs */
	resolveAction?: (data: unknown) => RunSpec | undefined;
	/** Messages for problems only some sources have */
	oldVersion?: string;
	wrongTool?: { title: string; body: string };
}

interface CliSource extends Source {
	list(rootFile: string): Promise<Listing>;
}

interface FileSource extends Source {
	/** Listing from the file alone; synchronous, so these sources' tasks appear without waiting on a process */
	list(rootFile: string): Listing;
}

const suffixes: Record<ProblemKind, string> = { missing: 'missing', 'old-version': 'old', 'wrong-tool': 'wrong', timeout: 'timeout', error: 'error' };
const idFor = (source: Source, kind: ProblemKind) => source.ids?.[kind] ?? `${source.id}-${suffixes[kind]}`;

const toolFor = (source: Source, rootFile: string) => (typeof source.tool === 'function' ? source.tool(rootFile) : source.tool);

function notifyMissing(source: Source, command: string, needed: 'list' | 'run') {
	const { names } = source;
	const outcome = needed === 'list' ? "can't be listed" : "won't run";
	notify(
		idFor(source, 'missing'),
		`${names.tool} isn't installed`,
		`This project has ${names.file}, but ${command} isn't on your PATH, so its ${names.noun} ${outcome}. Turn Off stops ${names.turnOff} in this project.`,
		[howToInstall(source.installKey), ...(source.toolActions ?? []), turnOff(source.settingKey)]
	);
}

/** Shows the notification for a listing problem; returns false when the listing was fine. */
function notifyProblem(source: Source, rootFile: string, listing: Listing): boolean {
	const { names } = source;
	switch (listing.kind) {
		case 'ok':
			return false;
		case 'old-version':
			notify(
				idFor(source, 'old-version'),
				`${names.tool} needs updating`,
				source.oldVersion ?? `A newer ${names.tool} is needed to list ${names.noun}.`,
				[openUrl('Update', installUrls[source.installKey])]
			);
			return true;
		case 'wrong-tool':
			notify(idFor(source, 'wrong-tool'), source.wrongTool?.title ?? `${names.tool} isn't the expected tool`, source.wrongTool?.body ?? '', [
				howToInstall(source.installKey),
				...(source.toolActions ?? []),
				turnOff(source.settingKey),
			]);
			return true;
		case 'timeout':
			notify(
				idFor(source, 'timeout'),
				`${names.tool} took too long`,
				`Listing ${names.listing} was stopped after ${LIST_TIMEOUT / 1000} seconds. Refresh tries again.`,
				[refresh]
			);
			return true;
		case 'error': {
			const open = listing.open === undefined ? { file: rootFile } : listing.open;
			const actions: NotificationAction[] = open ? [openRootFile(open.file, open.line)] : [];
			notify(
				idFor(source, 'error'),
				listing.title ?? `${rootFile} has an error`,
				listing.body ?? `${names.listing} can't be listed: ${listing.detail}`,
				actions
			);
			return true;
		}
	}
}

const refresh: NotificationAction = { title: 'Refresh', run: () => nova.commands.invoke('taskfinder.refresh') };

/* A successful listing clears any earlier problem notification */
const clearProblems = (source: Source) =>
	(['old-version', 'wrong-tool', 'timeout', 'error'] as ProblemKind[]).forEach((kind) => clearNotification(idFor(source, kind)));

/** A listed task for the sidebar: `spec()` gives its command when it runs, resolving it then if needed */
interface LatestTask {
	name: string;
	spec: () => RunSpec;
}

/* Each source's latest tasks, by setting key, as the Tasks menu shows them; the sidebar reads these */
const latest = new Map<string, LatestTask[]>();
let latestChanged: () => void = () => {};

const setLatest = (source: Source, tasks: ListedTask[] | undefined) => {
	if (tasks === undefined && !latest.has(source.settingKey)) return;
	if (tasks === undefined) latest.delete(source.settingKey);
	else
		latest.set(
			source.settingKey,
			tasks.map(({ name, command, args, cwd, env, resolve }) => ({
				name,
				spec: () => (resolve === undefined ? runSpec(command, args, { cwd, env }) : resolvedSpec(source, resolve)),
			}))
		);
	latestChanged();
};

/** The latest tasks of the source with this setting key */
const latestTasks = (settingKey: string): LatestTask[] => latest.get(settingKey) ?? [];

/** Forgets a source's tasks (it was turned off) */
const forgetLatest = (settingKey: string) => {
	if (latest.delete(settingKey)) latestChanged();
};

/** Called whenever any source's tasks change */
const onLatestChange = (callback: () => void) => {
	latestChanged = callback;
};

function finish(source: Source, listing: Listing, rootFile: string, started: number): Task[] {
	if (notifyProblem(source, rootFile, listing) || listing.kind !== 'ok') {
		setLatest(source, []);
		return [];
	}
	clearProblems(source);
	setLatest(source, listing.tasks);

	const tasks = listing.tasks.map(({ name, command, args, cwd, script, env, actions, resolve }) =>
		createTask(name, command, args, { cwd, script, env, actions, resolve })
	);
	console.info(`${source.id}: ${tasks.length} ${source.names.noun} (${Date.now() - started} ms)`);
	return tasks;
}

/** Tasks from a source whose listing runs a tool. */
async function provideCli(source: CliSource): Promise<Task[]> {
	/* tools such as task, maid and just search parent folders, so only run them when the project root has their file */
	const rootFile = firstRootFile(source.rootFiles);
	if (!rootFile) {
		setLatest(source, undefined);
		return [];
	}
	const started = Date.now();

	const tool = toolFor(source, rootFile);
	if (tool && !(await isInstalled(tool.command))) {
		notifyMissing(source, tool.command, tool.needed);
		if (tool.needed === 'list') {
			setLatest(source, []);
			return [];
		}
	}

	return finish(source, await source.list(rootFile), rootFile, started);
}

/** Tasks from a source read straight from its file. The tool, if any, is only needed to run them, so it's checked in the background. */
function provideFile(source: FileSource): Task[] {
	const rootFile = firstRootFile(source.rootFiles);
	if (!rootFile) {
		setLatest(source, undefined);
		return [];
	}
	const started = Date.now();

	const listing = source.list(rootFile);
	const tool = toolFor(source, rootFile);
	if (listing.kind === 'ok' && tool) {
		isInstalled(tool.command).then((installed) => {
			if (!installed) notifyMissing(source, tool.command, tool.needed);
		});
	}
	return finish(source, listing, rootFile, started);
}

/** A Nova Task Assistant class for a source, as registered by the feature table. */
/* Nova asks the Task Assistant for the real action when a resolvable task runs */
const resolvedSpec = (source: Source, data: unknown): RunSpec =>
	source.resolveAction?.(data) ?? messageSpec("Automatic Tasks couldn't prepare this task.");

const resolveFor = (source: Source, context: TaskActionResolveContext<Transferrable>): TaskProcessAction =>
	processAction(resolvedSpec(source, context.data));

const cliAssistant = (source: CliSource) =>
	class {
		provideTasks() {
			return provideCli(source);
		}
		resolveTaskAction(context: TaskActionResolveContext<Transferrable>) {
			return resolveFor(source, context);
		}
	};

const fileAssistant = (source: FileSource) =>
	class {
		provideTasks() {
			return provideFile(source);
		}
		resolveTaskAction(context: TaskActionResolveContext<Transferrable>) {
			return resolveFor(source, context);
		}
	};

export { cliAssistant, fileAssistant, provideCli, provideFile, latestTasks, forgetLatest, onLatestChange };
export type { Source, CliSource, FileSource, Listing, ListedTask, LatestTask };
