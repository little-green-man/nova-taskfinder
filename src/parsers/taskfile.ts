import { diagnoseTaskfile } from '../diagnose';
import { run } from '../process';
import { cliAssistant } from '../source';
import type { CliSource } from '../source';

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

export const taskfileSource: CliSource = {
	id: 'taskfile',
	names: { tool: 'Task', file: 'a Taskfile', listing: 'Taskfile tasks', noun: 'tasks', turnOff: 'reading the Taskfile' },
	rootFiles: taskfileFiles,
	settingKey: 'taskfinder.auto-taskfile',
	installKey: 'task',
	tool: { command: 'task', needed: 'list' },
	oldVersion: 'Automatic Tasks needs Task v3.19.1 or later to list Taskfile tasks.',

	async list() {
		const diagnosis = diagnoseTaskfile(await run('task', ['--list-all', '--json']));
		if (diagnosis.kind !== 'ok') return diagnosis;

		/* wildcard tasks (e.g. start:*) need an argument, so can't be run as-is */
		const names = diagnosis.value.map(({ name }) => name).filter((name): name is string => typeof name === 'string' && !name.includes('*'));
		return { kind: 'ok', tasks: names.map((name) => ({ name, command: 'task', args: [name] })) };
	},
};

export default cliAssistant(taskfileSource);
