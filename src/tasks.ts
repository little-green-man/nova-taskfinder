import { getConfigWithWorkspaceOverride } from './config';
import { actionsFor } from './scripts';

const novaActions = {
	run: Task.Run,
	build: Task.Build,
	clean: Task.Clean,
};

/**
 * Creates a task that always has Run, plus Build (⌘B) or Clean (⇧⌘K) for build/clean-style names.
 * Nova disables any action a task doesn't set, so Build/Clean are added alongside Run, never instead of it.
 */
function createTask(name: string, command: string, args: string[]): Task {
	const task = new Task(name);
	const action = new TaskProcessAction(command, {
		cwd: nova.workspace.path ?? undefined,
		args,
		shell: true,
	});
	actionsFor(name).forEach((actionName) => task.setAction(novaActions[actionName], action));
	return task;
}

/** Whether lifecycle/event scripts should be listed (off by default). */
const showLifecycleScripts = (): boolean => getConfigWithWorkspaceOverride('taskfinder.show-lifecycle-scripts') === true;

export { createTask, showLifecycleScripts };
