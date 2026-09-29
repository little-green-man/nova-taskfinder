import { getConfigWithWorkspaceOverride } from '../config';
import { diagnoseJust } from '../diagnose';
import { run } from '../process';
import { justRecipes } from '../recipes';
import { cliAssistant } from '../source';
import type { CliSource } from '../source';

/* just finds `justfile` in any case, or `.justfile` (https://just.systems/man/en/) */
export const justFiles = ['justfile', 'Justfile', 'JUSTFILE', '.justfile'];

export const justSource: CliSource = {
	id: 'just',
	names: { tool: 'just', file: 'a justfile', listing: 'just recipes', noun: 'recipes', turnOff: 'reading the justfile' },
	rootFiles: justFiles,
	settingKey: 'taskfinder.auto-just',
	installKey: 'just',
	tool: { command: 'just', needed: 'list' },
	ids: { error: 'justfile-error' },
	oldVersion: 'Automatic Tasks needs just 1.15 or later to list recipes.',

	async list() {
		/* `--json` is shorter but only exists from just 1.48 */
		const diagnosis = diagnoseJust(await run('just', ['--dump', '--dump-format', 'json']));
		if (diagnosis.kind !== 'ok') return diagnosis;

		const confirm = getConfigWithWorkspaceOverride('taskfinder.just-confirm-recipes') === 'yes' ? 'yes' : 'exclude';
		return { kind: 'ok', tasks: justRecipes(diagnosis.value, confirm).map(({ name, args }) => ({ name, command: 'just', args })) };
	},
};

export default cliAssistant(justSource);
