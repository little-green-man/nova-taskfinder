/**
 * Pure rules for VS Code's .vscode/tasks.json: which tasks can run in Nova, as shell command lines.
 * No Nova globals, so they can be unit-tested in Node. See DESIGN.md → VS Code tasks.
 */

import { shellQuote } from './process';

/** A task as Nova will run it: one shell command line, in `cwd` (absolute, or relative to the workspace), with `env`. */
interface VscodeTask {
	name: string;
	line: string;
	cwd?: string;
	env?: Record<string, string>;
	/** In VS Code's build group, so it also runs with Build (⌘B) */
	build: boolean;
	/** Uses the open file (`${file}`, `${fileDirname}`…), so it's resolved when it runs (resolveFileVariables) */
	needsFile: boolean;
}

interface VscodeListing {
	tasks: VscodeTask[];
	/** Tasks that can't run in Nova, and why (logged) */
	skipped: Array<{ name: string; reason: string }>;
}

interface VscodeContext {
	/** Absolute workspace path */
	workspace: string;
	home: string;
	/** Environment variables, for `${env:NAME}` */
	env: Record<string, string>;
	/** The project's package manager, for `npm` tasks */
	packageManager: string;
}

/** The open file, for resolving file variables when a task runs */
interface FileContext {
	/** Absolute path of the open file */
	file: string;
	workspace: string;
	line?: number;
	column?: number;
	selectedText?: string;
}

type Json = Record<string, any>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/* VS Code-only variables that Nova can't provide */
const unsupported = /\$\{(?:command|config|input):[^}]*\}|\$\{(?:execPath|defaultBuildTask)\}/;

/* Variables that depend on the open file */
const fileVariable =
	/\$\{(?:file|relativeFile|relativeFileDirname|fileBasename|fileBasenameNoExtension|fileExtname|fileDirname|fileDirnameBasename|lineNumber|columnNumber|selectedText)\}/;

/** Replaces the variables that are the same for the whole project; leaves open-file variables for later. */
function resolveProjectVariables(text: string, ctx: VscodeContext): string {
	const basename = ctx.workspace.split('/').filter(Boolean).pop() ?? '';
	return text.replace(/\$\{([^}]+)\}/g, (match, name: string) => {
		if (name.startsWith('env:')) return ctx.env[name.slice(4)] ?? '';
		const values: Record<string, string> = {
			workspaceFolder: ctx.workspace,
			workspaceRoot: ctx.workspace,
			fileWorkspaceFolder: ctx.workspace,
			cwd: ctx.workspace,
			workspaceFolderBasename: basename,
			userHome: ctx.home,
			pathSeparator: '/',
			'/': '/',
		};
		return name in values ? values[name] : match;
	});
}

/** Replaces the open-file variables, when a task runs. */
function resolveFileVariables(text: string, f: FileContext): string {
	const slash = f.file.lastIndexOf('/');
	const dir = slash === -1 ? '' : f.file.slice(0, slash);
	const base = f.file.slice(slash + 1);
	const dot = base.lastIndexOf('.');
	const relative = f.file.startsWith(`${f.workspace}/`) ? f.file.slice(f.workspace.length + 1) : f.file;
	const relativeDir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
	const values: Record<string, string> = {
		file: f.file,
		fileDirname: dir,
		fileBasename: base,
		fileBasenameNoExtension: dot > 0 ? base.slice(0, dot) : base,
		fileExtname: dot > 0 ? base.slice(dot) : '',
		fileDirnameBasename: dir.split('/').pop() ?? '',
		relativeFile: relative,
		relativeFileDirname: relativeDir,
		lineNumber: String(f.line ?? 1),
		columnNumber: String(f.column ?? 1),
		selectedText: f.selectedText ?? '',
	};
	return text.replace(/\$\{([^}]+)\}/g, (match, name: string) => (name in values ? values[name] : match));
}

/* A command or argument: a string, or `{ value, quoting }` */
const valueOf = (item: unknown): string | undefined => {
	if (typeof item === 'string') return item;
	if (isObject(item) && typeof item.value === 'string') return item.value;
	if (isObject(item) && Array.isArray(item.value)) return item.value.join(' ');
	return undefined;
};

/* Later layers win; `options` and its `env` are merged rather than replaced */
function merge(...layers: Array<Json | undefined>): Json {
	return layers.filter(isObject).reduce<Json>((merged, layer) => {
		const options = { ...merged.options, ...layer.options, env: { ...merged.options?.env, ...layer.options?.env } };
		return { ...merged, ...layer, options };
	}, {});
}

const dependencies = (task: Json): string[] => {
	const dependsOn = task.dependsOn;
	const list = Array.isArray(dependsOn) ? dependsOn : dependsOn === undefined ? [] : [dependsOn];
	return list.map((item) => (typeof item === 'string' ? item : isObject(item) && typeof item.task === 'string' ? item.task : '')).filter(Boolean);
};

/* One task's own command, before dependencies: a command line, or a reason it can't run */
function ownCommand(task: Json, ctx: VscodeContext): { line?: string; cwd?: string; env?: Record<string, string>; reason?: string } {
	const type = typeof task.type === 'string' ? task.type : 'process';
	const rawEnv = isObject(task.options?.env) ? Object.entries(task.options.env).map(([k, v]) => [k, String(v)] as const) : [];
	let cwd: string | undefined = typeof task.options?.cwd === 'string' ? task.options.cwd : undefined;
	const command = valueOf(task.command);
	const args = (Array.isArray(task.args) ? task.args : []).map(valueOf).filter((arg): arg is string => arg !== undefined);

	if (type !== 'npm' && type !== 'shell' && type !== 'process') return { reason: `"${type}" tasks come from a VS Code extension` };

	const texts = [command ?? '', ...args, cwd ?? '', ...rawEnv.map(([, v]) => v)];
	const blocked = texts.map((text) => text.match(unsupported)?.[0]).find(Boolean);
	if (blocked) return { reason: `uses ${blocked}, which only VS Code can provide` };

	/* project variables are filled in before quoting, so values read naturally; open-file ones wait until the task runs */
	const project = (text: string) => resolveProjectVariables(text, ctx);
	let line: string | undefined;
	if (type === 'npm') {
		if (typeof task.script !== 'string') return { reason: 'npm task without a script' };
		line = `${ctx.packageManager} run ${shellQuote(task.script)}`;
		if (typeof task.path === 'string' && task.path) cwd = task.path.replace(/\/+$/, '');
	} else {
		if (command === undefined) return {};
		/* a shell command may be a whole command line; a process command is one program */
		line = [type === 'shell' ? project(command) : shellQuote(project(command)), ...args.map((arg) => shellQuote(project(arg)))].join(' ');
	}

	return {
		line,
		cwd: cwd === undefined ? undefined : project(cwd),
		env: rawEnv.length > 0 ? Object.fromEntries(rawEnv.map(([k, v]) => [k, project(v)])) : undefined,
	};
}

/* A command line that runs in its own folder and environment, for combining with others */
const wrapped = (part: { line: string; cwd?: string; env?: Record<string, string> }, workspace: string) => {
	const dir = part.cwd === undefined ? workspace : part.cwd.startsWith('/') ? part.cwd : `${workspace}/${part.cwd}`;
	const exports = Object.entries(part.env ?? {}).map(([k, v]) => `export ${k}=${shellQuote(v)} && `);
	return `(cd ${shellQuote(dir)} && ${exports.join('')}${part.line})`;
};

/**
 * The runnable tasks in a tasks.json: `shell`, `process` and `npm` tasks, with top-level defaults and `osx` overrides
 * applied, project variables resolved, and `dependsOn` combined into one command line (`sequence`: one after another;
 * `parallel`, VS Code's default: together, then the task's own command).
 */
function vscodeTasks(json: unknown, ctx: VscodeContext): VscodeListing {
	const listing: VscodeListing = { tasks: [], skipped: [] };
	if (!isObject(json) || !Array.isArray(json.tasks)) return listing;

	const defaults = merge({ type: json.type, command: json.command, args: json.args, options: json.options }, json.osx);
	const tasks: Json[] = json.tasks.filter(isObject).map((task: Json) => merge(defaults, task, task.osx));
	const nameOf = (task: Json) =>
		typeof task.label === 'string' && task.label
			? task.label
			: task.type === 'npm' && typeof task.script === 'string'
				? `npm: ${task.script}`
				: undefined;
	const byName = new Map(tasks.flatMap((task) => (nameOf(task) ? [[nameOf(task) as string, task] as const] : [])));

	/* A task with its dependencies, as one wrapped command line; throws a reason if it can't run */
	const compose = (task: Json, seen: Set<string>): { line: string; needsFile: boolean } => {
		const name = nameOf(task) ?? '';
		if (seen.has(name) || seen.size > 10) throw new Error('its dependencies loop');
		const own = ownCommand(task, ctx);
		if (own.reason) throw new Error(own.reason);

		const deps = dependencies(task).map((dep) => {
			const found = byName.get(dep);
			if (!found) throw new Error(`it depends on "${dep}", which isn't in tasks.json`);
			return compose(found, new Set([...seen, name]));
		});
		const ownPart = own.line ? wrapped({ line: own.line, cwd: own.cwd, env: own.env }, ctx.workspace) : undefined;
		if (!ownPart && deps.length === 0) throw new Error('it has no command');

		let depsLine = '';
		if (deps.length === 1 || task.dependsOrder === 'sequence') depsLine = deps.map((d) => d.line).join(' && ');
		else if (deps.length > 1) {
			const started = deps.map((d, i) => `${d.line} & P${i}=$!`).join('; ');
			depsLine = `${started}; ${deps.map((_, i) => `wait $P${i}`).join(' && ')}`;
		}
		const line = [depsLine && (deps.length > 1 && ownPart ? `{ ${depsLine}; }` : depsLine), ownPart].filter(Boolean).join(' && ');
		const needsFile = fileVariable.test(own.line ?? '') || fileVariable.test(own.cwd ?? '') || deps.some((d) => d.needsFile);
		return { line: deps.length > 1 && !ownPart ? `{ ${line}; }` : line, needsFile };
	};

	tasks.forEach((task) => {
		const name = nameOf(task);
		if (!name) {
			listing.skipped.push({ name: '(no label)', reason: 'it has no label' });
			return;
		}
		if (task.hide === true) return;
		try {
			const build = task.group === 'build' || (isObject(task.group) && task.group.kind === 'build');
			if (dependencies(task).length === 0) {
				/* a plain task keeps its own folder and environment, rather than a wrapped command line */
				const own = ownCommand(task, ctx);
				if (own.reason) throw new Error(own.reason);
				if (!own.line) throw new Error('it has no command');
				const needsFile =
					fileVariable.test(own.line) || fileVariable.test(own.cwd ?? '') || Object.values(own.env ?? {}).some((v) => fileVariable.test(v));
				listing.tasks.push({ name, line: own.line, cwd: own.cwd, env: own.env, build, needsFile });
			} else {
				const composed = compose(task, new Set());
				listing.tasks.push({ name, line: composed.line, build, needsFile: composed.needsFile });
			}
		} catch (e) {
			listing.skipped.push({ name, reason: (e as Error).message });
		}
	});
	return listing;
}

export { vscodeTasks, resolveFileVariables, resolveProjectVariables };
export type { VscodeTask, VscodeListing, VscodeContext, FileContext };
