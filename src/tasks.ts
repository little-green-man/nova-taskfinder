import { getConfigWithWorkspaceOverride } from './config';
import { actionsFor } from './scripts';

const novaActions = {
	run: Task.Run,
	build: Task.Build,
	clean: Task.Clean,
};

interface TaskOptions {
	/** Folder to run in, relative to the workspace root (workspace packages); defaults to the root */
	cwd?: string;
	/** The script's own name, for Build/Clean, when the task name adds a prefix (`@acme/api: build`) */
	script?: string;
}

/**
 * Creates a task that always has Run, plus Build (⌘B) or Clean (⇧⌘K) for build/clean-style names.
 * Nova disables any action a task doesn't set, so Build/Clean are added alongside Run, never instead of it.
 */
function createTask(name: string, command: string, args: string[], options: TaskOptions = {}): Task {
	const task = new Task(name);
	const root = nova.workspace.path ?? undefined;
	const action = new TaskProcessAction(command, {
		cwd: root && options.cwd ? nova.path.join(root, options.cwd) : root,
		args,
		shell: true,
	});
	actionsFor(options.script ?? name).forEach((actionName) => task.setAction(novaActions[actionName], action));
	return task;
}

/** Whether lifecycle/event scripts should be listed (off by default). */
const showLifecycleScripts = (): boolean => getConfigWithWorkspaceOverride('taskfinder.show-lifecycle-scripts') === true;

export { createTask, showLifecycleScripts };
