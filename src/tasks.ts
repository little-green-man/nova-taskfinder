import { getConfigWithWorkspaceOverride } from './config';
import { actionsFor } from './scripts';
import type { ActionName } from './scripts';

const novaActions = {
	run: Task.Run,
	build: Task.Build,
	clean: Task.Clean,
};

interface TaskOptions {
	/** Folder to run in: absolute, or relative to the workspace root (workspace packages); defaults to the root */
	cwd?: string;
	/** The script's own name, for Build/Clean, when the task name adds a prefix (`@acme/api: build`) */
	script?: string;
	/** Environment variables for the command */
	env?: Record<string, string>;
	/** Which Nova actions to bind, instead of deciding from the name (VS Code's build group) */
	actions?: ActionName[];
	/**
	 * Resolve the command when the task runs rather than now (VS Code tasks that use the open file): a
	 * TaskResolvableAction carrying this data, passed to the source's resolveAction() by the Task Assistant.
	 */
	resolve?: Transferrable;
}

/** A command as a task runs it; shared by Nova tasks and the sidebar, so both run the same thing */
interface RunSpec {
	command: string;
	args: string[];
	/** Absolute folder */
	cwd?: string;
	env?: Record<string, string>;
	shell: boolean;
}

/** The folder a task runs in: absolute paths as they are, others under the workspace root */
const taskFolder = (cwd?: string) => {
	const root = nova.workspace.path ?? undefined;
	if (cwd?.startsWith('/')) return cwd;
	return root && cwd ? nova.path.join(root, cwd) : root;
};

/** A listed task's command, ready to run */
const runSpec = (command: string, args: string[], options: Pick<TaskOptions, 'cwd' | 'env'> = {}): RunSpec => ({
	command,
	args,
	cwd: taskFolder(options.cwd),
	env: options.env,
	shell: true,
});

const processAction = (spec: RunSpec) => new TaskProcessAction(spec.command, { args: spec.args, cwd: spec.cwd, env: spec.env, shell: spec.shell });

/** Prints a message instead of running (no shell, so the message needs no quoting) */
const messageSpec = (message: string): RunSpec => ({ command: '/bin/echo', args: [message], shell: false });

/**
 * Creates a task that always has Run, plus Build (⌘B) or Clean (⇧⌘K) for build/clean-style names.
 * Nova disables any action a task doesn't set, so Build/Clean are added alongside Run, never instead of it.
 */
function createTask(name: string, command: string, args: string[], options: TaskOptions = {}): Task {
	const task = new Task(name);
	const action = options.resolve !== undefined ? new TaskResolvableAction({ data: options.resolve }) : processAction(runSpec(command, args, options));
	(options.actions ?? actionsFor(options.script ?? name)).forEach((actionName) =>
		task.setAction(novaActions[actionName], action as TaskProcessAction)
	);
	return task;
}

/** Whether lifecycle/event scripts should be listed (off by default). */
const showLifecycleScripts = (): boolean => getConfigWithWorkspaceOverride('taskfinder.show-lifecycle-scripts') === true;

export { createTask, taskFolder, runSpec, processAction, messageSpec, showLifecycleScripts };
export type { RunSpec };
