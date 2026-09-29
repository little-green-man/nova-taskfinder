import { diagnoseMaid } from '../diagnose';
import type { CommandResult } from '../diagnose';
import { run } from '../process';
import { cliAssistant } from '../source';
import type { CliSource } from '../source';

/* maid looks for "maidfile" with these extensions (https://github.com/theMackabu/maid) */
export const maidfileFiles = ['maidfile', 'maidfile.toml', 'maidfile.yaml', 'maidfile.yml', 'maidfile.json', 'Maidfile', 'Maidfile.toml'];

/* Current maid (2.0+) uses `--system json`; older versions used `butler json` */
const listCommands = [
	['--system', 'json'],
	['butler', 'json'],
];

export const maidSource: CliSource = {
	id: 'maid',
	names: { tool: 'maid', file: 'a maidfile', listing: 'Maidfile tasks', noun: 'tasks', turnOff: 'reading the maidfile' },
	rootFiles: maidfileFiles,
	settingKey: 'taskfinder.auto-maidfile',
	installKey: 'maid',
	tool: { command: 'maid', needed: 'list' },
	ids: { error: 'maidfile-error' },
	wrongTool: {
		title: 'A different maid is installed',
		body: "The maid command on your PATH isn't theMackabu/maid, the Maidfile task runner (npm's maid package is an unrelated tool), so Maidfile tasks can't be listed. Turn Off stops reading the maidfile in this project.",
	},

	async list() {
		/* try each list command until one returns a Maidfile, keeping every result for diagnosis */
		const results: CommandResult[] = [];
		let diagnosis = diagnoseMaid(results);
		for (const args of listCommands) {
			results.push(await run('maid', args));
			diagnosis = diagnoseMaid(results);
			if (diagnosis.kind === 'ok') break;
		}
		if (diagnosis.kind !== 'ok') return diagnosis;

		const tasks = diagnosis.value.tasks;
		const names = Object.keys(tasks).filter((name) => tasks[name]?.hide !== true && !name.startsWith('_'));
		return { kind: 'ok', tasks: names.map((name) => ({ name, command: 'maid', args: [name] })) };
	},
};

export default cliAssistant(maidSource);
