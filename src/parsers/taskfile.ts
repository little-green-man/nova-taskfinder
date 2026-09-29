import { parseJson, rootHasFile, run, warnOnce } from '../process';

/* Filenames Task looks for, in priority order (https://taskfile.dev/usage/) */
export const taskfileFiles = [
	'Taskfile.yml',
	'taskfile.yml',
	'Taskfile.yaml',
	'taskfile.yaml',
	'Taskfile.dist.yml',
	'taskfile.dist.yml',
	'Taskfile.dist.yaml',
	'taskfile.dist.yaml',
];

class Taskfile {
	packageProcessName: string = 'task';

	async provideTasks() {
		/* task walks up parent folders, so only run it when the project root has a Taskfile */
		if (!rootHasFile(taskfileFiles)) return [];

		const result = await run(this.packageProcessName, ['--list-all', '--json']);
		const json = result.status === 0 ? parseJson(result.stdout) : null;

		if (!Array.isArray(json?.tasks)) {
			warnOnce(`Taskfile: couldn't list tasks (exit ${result.status}). Task v3.19.1 or later is required. ${result.stderr.trim()}`);
			return [];
		}

		const tasks: Array<Task> = [];
		json.tasks.forEach(({ name }: { name?: unknown }) => {
			/* wildcard tasks (e.g. start:*) need an argument, so can't be run as-is */
			if (typeof name !== 'string' || name.includes('*')) return;

			const task = new Task(name);
			task.setAction(
				Task.Run,
				new TaskProcessAction(this.packageProcessName, {
					cwd: nova.workspace.path ?? undefined,
					args: [name],
					shell: true,
				})
			);
			tasks.push(task);
		});

		console.info(`taskfile has ${tasks.length} task(s)`);
		return tasks;
	}
}

export default Taskfile;
