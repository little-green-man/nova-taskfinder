import { diagnoseMaid } from '../diagnose';
import type { CommandResult } from '../diagnose';
import { clearNotification, howToInstall, notify, openRootFile, setProjectSetting } from '../notify';
import { firstRootFile, isInstalled, run } from '../process';
import { createTask } from '../tasks';

/* maid looks for "maidfile" with these extensions (https://github.com/theMackabu/maid) */
export const maidfileFiles = ['maidfile', 'maidfile.toml', 'maidfile.yaml', 'maidfile.yml', 'maidfile.json', 'Maidfile', 'Maidfile.toml'];

/* Current maid (2.0+) uses `--system json`; older versions used `butler json` */
const listCommands = [
	['--system', 'json'],
	['butler', 'json'],
];

const turnOffMaid = setProjectSetting('Turn Off', 'taskfinder.auto-maidfile', false);

class Maidfile {
	packageProcessName: string = 'maid';

	/* Tries each list command until one returns a Maidfile, keeping every result for diagnosis */
	async readMaidfile() {
		const results: CommandResult[] = [];
		for (const args of listCommands) {
			results.push(await run(this.packageProcessName, args));
			const diagnosis = diagnoseMaid(results);
			if (diagnosis.kind === 'ok') return diagnosis;
		}
		return diagnoseMaid(results);
	}

	async provideTasks() {
		/* maid walks up parent folders, so only run it when the project root has a maidfile */
		const maidfile = firstRootFile(maidfileFiles);
		if (!maidfile) return [];

		if (!(await isInstalled(this.packageProcessName))) {
			notify(
				'maid-missing',
				"maid isn't installed",
				"This project has a maidfile, but the maid command isn't on your PATH, so its tasks can't be listed. Turn Off stops reading the maidfile in this project.",
				[howToInstall('maid'), turnOffMaid]
			);
			return [];
		}

		const diagnosis = await this.readMaidfile();

		if (diagnosis.kind === 'wrong-tool') {
			notify(
				'maid-wrong',
				'A different maid is installed',
				"The maid command on your PATH isn't theMackabu/maid, the Maidfile task runner (npm's maid package is an unrelated tool), so Maidfile tasks can't be listed. Turn Off stops reading the maidfile in this project.",
				[howToInstall('maid'), turnOffMaid]
			);
			return [];
		}
		if (diagnosis.kind === 'error') {
			notify('maidfile-error', `${maidfile} has an error`, `Maidfile tasks can't be listed: ${diagnosis.detail}`, [openRootFile(maidfile)]);
			return [];
		}
		if (diagnosis.kind !== 'ok') return [];

		clearNotification('maid-wrong');
		clearNotification('maidfile-error');

		const json = diagnosis.value;
		const tasks: Array<Task> = [];
		Object.keys(json.tasks).forEach((key) => {
			if (json.tasks[key]?.hide === true || key.startsWith('_')) return;

			tasks.push(createTask(key, this.packageProcessName, [key]));
		});

		console.info(`maidfile has ${tasks.length} task(s)`);
		return tasks;
	}
}

export default Maidfile;
