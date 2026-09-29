import { clearNotification, howToInstall, notify, openRootFile, turnOff } from '../notify';
import { firstRootFile, isInstalled, readTextFile } from '../process';
import { denoTasks, parseJsonc } from '../recipes';
import { createTask } from '../tasks';

/* deno.json wins if both exist */
export const denoFiles = ['deno.json', 'deno.jsonc'];

class Deno {
	packageProcessName: string = 'deno';

	/* Checked once per window; tasks are listed either way, as they're read from the file */
	checkInstalled() {
		isInstalled(this.packageProcessName).then((installed) => {
			if (installed) return;
			notify(
				'deno-missing',
				"Deno isn't installed",
				"This project has a deno.json, but deno isn't on your PATH, so its tasks won't run. Turn Off stops listing Deno tasks in this project.",
				[howToInstall('deno'), turnOff('taskfinder.auto-deno')]
			);
		});
	}

	provideTasks() {
		const file = firstRootFile(denoFiles);
		if (!file) return [];

		let json: any;
		try {
			json = parseJsonc(readTextFile(`${nova.workspace.path}/${file}`));
		} catch (e) {
			notify('deno-invalid-json', `${file} has an error`, `Deno tasks can't be listed until it's fixed: ${(e as Error).message}`, [
				openRootFile(file),
			]);
			return [];
		}
		clearNotification('deno-invalid-json');
		this.checkInstalled();

		const tasks = denoTasks(json).map((name) => createTask(name, this.packageProcessName, ['task', name]));
		console.info(`${file} has ${tasks.length} task(s)`);
		return tasks;
	}
}

export default Deno;
