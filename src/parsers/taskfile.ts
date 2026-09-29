import { diagnoseTaskfile } from '../diagnose';
import { clearNotification, howToInstall, installUrls, notify, openRootFile, openUrl, setProjectSetting } from '../notify';
import { firstRootFile, isInstalled, run } from '../process';
import { createTask } from '../tasks';

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
		const taskfile = firstRootFile(taskfileFiles);
		if (!taskfile) return [];

		if (!(await isInstalled(this.packageProcessName))) {
			notify(
				'taskfile-missing',
				"Task isn't installed",
				"This project has a Taskfile, but the task command isn't on your PATH, so its tasks can't be listed. Turn Off stops reading the Taskfile in this project.",
				[howToInstall('task'), setProjectSetting('Turn Off', 'taskfinder.auto-taskfile', false)]
			);
			return [];
		}

		const diagnosis = diagnoseTaskfile(await run(this.packageProcessName, ['--list-all', '--json']));

		if (diagnosis.kind === 'old-version') {
			notify('taskfile-old', 'Task needs updating', 'Automatic Tasks needs Task v3.19.1 or later to list Taskfile tasks.', [
				openUrl('Update', installUrls.task),
			]);
			return [];
		}
		if (diagnosis.kind === 'error') {
			notify('taskfile-error', `${taskfile} has an error`, `Taskfile tasks can't be listed: ${diagnosis.detail}`, [openRootFile(taskfile)]);
			return [];
		}
		if (diagnosis.kind !== 'ok') return [];

		clearNotification('taskfile-old');
		clearNotification('taskfile-error');

		const tasks: Array<Task> = [];
		diagnosis.value.forEach(({ name }) => {
			/* wildcard tasks (e.g. start:*) need an argument, so can't be run as-is */
			if (typeof name !== 'string' || name.includes('*')) return;

			tasks.push(createTask(name, this.packageProcessName, [name]));
		});

		console.info(`taskfile has ${tasks.length} task(s)`);
		return tasks;
	}
}

export default Taskfile;
