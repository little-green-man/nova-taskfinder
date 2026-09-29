import { readRootFile } from '../process';
import { parseJsonc } from '../recipes';
import { actionsFor } from '../scripts';
import { fileAssistant } from '../source';
import type { FileSource } from '../source';
import { messageSpec, taskFolder } from '../tasks';
import type { RunSpec } from '../tasks';
import { resolveFileVariables, vscodeTasks } from '../vscode';
import type { VscodeTask } from '../vscode';
import { projectPackageManager } from './package';

/* The file VS Code reads its workspace tasks from */
export const vscodeFiles = ['.vscode/tasks.json'];

/**
 * The real action for a task that uses the open file (`${file}`, `${fileDirname}`…), when it runs.
 * With no file open, the task prints why instead of running with empty paths.
 */
function resolveAction(data: unknown): RunSpec | undefined {
	const task = data as VscodeTask;
	if (typeof task?.line !== 'string') return undefined;

	const editor = nova.workspace.activeTextEditor;
	const file = editor?.document.path;
	if (!editor || !file) {
		return messageSpec(`"${task.name}" uses the open file. Open a file in this project, then run it again.`);
	}

	/* ${lineNumber}/${columnNumber} count from 1, from the text before the cursor */
	const selection = editor.selectedRange;
	const before = editor.document.getTextInRange(new Range(0, selection.start));
	const context = {
		file,
		workspace: nova.workspace.path ?? '',
		line: before.split('\n').length,
		column: before.length - before.lastIndexOf('\n'),
		selectedText: editor.document.getTextInRange(selection),
	};
	const resolve = (value: string) => resolveFileVariables(value, context);
	return {
		/* Nova quotes a task's command as one program name, so a command line goes to sh -c (the login shell still sets PATH) */
		command: '/bin/sh',
		args: ['-c', resolve(task.line)],
		cwd: taskFolder(task.cwd === undefined ? undefined : resolve(task.cwd)),
		env: task.env && Object.fromEntries(Object.entries(task.env).map(([k, v]) => [k, resolve(v)])),
		shell: true,
	};
}

export const vscodeSource: FileSource = {
	id: 'vscode',
	names: { tool: 'VS Code', file: 'a .vscode/tasks.json', listing: 'VS Code tasks', noun: 'tasks', turnOff: 'listing VS Code tasks' },
	rootFiles: vscodeFiles,
	settingKey: 'taskfinder.auto-vscode',
	installKey: 'npm',
	/* nothing to install: tasks.json is read directly, and each task runs its own command */
	ids: { error: 'vscode-invalid-json' },
	resolveAction,

	list(file) {
		let json: unknown;
		try {
			json = parseJsonc(readRootFile(file) ?? '{}');
		} catch (e) {
			const detail = (e as Error).message;
			return { kind: 'error', detail, body: `VS Code tasks can't be listed until it's fixed: ${detail}` };
		}

		const listing = vscodeTasks(json, {
			workspace: nova.workspace.path ?? '',
			home: nova.path.expanduser('~'),
			env: nova.environment,
			packageManager: projectPackageManager(),
		});
		listing.skipped.forEach(({ name, reason }) => console.info(`vscode: skipping "${name}": ${reason}`));

		return {
			kind: 'ok',
			tasks: listing.tasks.map((task) => ({
				name: task.name,
				/* Nova quotes a task's command as one program name, so a command line goes to sh -c (the login shell still sets PATH) */
				command: '/bin/sh',
				args: ['-c', task.line],
				cwd: task.cwd,
				env: task.env,
				actions: task.build ? ['run', 'build'] : actionsFor(task.name),
				/* a plain JSON copy: Nova passes this data back to resolveAction() when the task runs */
				resolve: task.needsFile ? (JSON.parse(JSON.stringify(task)) as Transferrable) : undefined,
			})),
		};
	},
};

export default fileAssistant(vscodeSource);
