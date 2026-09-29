import { parseJson, rootHasFile, run, warnOnce } from '../process';

/* maid looks for "maidfile" with these extensions (https://github.com/theMackabu/maid) */
export const maidfileFiles = ['maidfile', 'maidfile.toml', 'maidfile.yaml', 'maidfile.yml', 'maidfile.json', 'Maidfile', 'Maidfile.toml'];

/* Current maid (2.0+) uses `--system json`; older versions used `butler json` */
const listCommands = [
	['--system', 'json'],
	['butler', 'json'],
];

class Maidfile {
	packageProcessName: string = 'maid';

	/* The first command whose output is a Maidfile, or null. Another tool called `maid` exits 0 on errors, so check the output rather than the status. */
	async readMaidfile() {
		for (const args of listCommands) {
			const result = await run(this.packageProcessName, args);
			const json = parseJson(result.stdout);
			if (json && typeof json.tasks === 'object' && json.tasks !== null) return json;
		}
		return null;
	}

	async provideTasks() {
		/* maid walks up parent folders, so only run it when the project root has a maidfile */
		if (!rootHasFile(maidfileFiles)) return [];

		const json = await this.readMaidfile();
		if (!json) {
			warnOnce("Maidfile: couldn't list tasks. Check `maid` is theMackabu/maid (cargo install maid), not the unrelated markdown task runner.");
			return [];
		}

		const tasks: Array<Task> = [];
		Object.keys(json.tasks).forEach((key) => {
			if (json.tasks[key]?.hide === true || key.startsWith('_')) return;

			const task = new Task(key);
			task.setAction(
				key.includes('build') || key.includes('compile') ? Task.Build : Task.Run,
				new TaskProcessAction(this.packageProcessName, {
					cwd: nova.workspace.path ?? undefined,
					args: [key],
					shell: true,
				})
			);
			tasks.push(task);
		});

		console.info(`maidfile has ${tasks.length} task(s)`);
		return tasks;
	}
}

export default Maidfile;
