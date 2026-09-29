import { getConfigWithWorkspaceOverride } from '../config';
import { artisanErrorLocation, diagnoseArtisan } from '../diagnose';
import { run } from '../process';
import { artisanCommands } from '../recipes';
import { cliAssistant } from '../source';
import type { CliSource } from '../source';

/* `artisan` identifies a Laravel app; console routes and new packages change the command list */
export const artisanFiles = ['artisan', 'routes/console.php', 'composer.lock'];

export const artisanSource: CliSource = {
	id: 'artisan',
	names: { tool: 'PHP', file: "Laravel's artisan", listing: 'artisan commands', noun: 'commands', turnOff: 'listing artisan commands' },
	rootFiles: ['artisan'],
	settingKey: 'taskfinder.auto-artisan',
	installKey: 'php',
	tool: { command: 'php', needed: 'list' },
	ids: { missing: 'php-missing' },

	async list() {
		/* listing starts the Laravel app, so it runs the project's own PHP (service providers, routes/console.php) */
		const result = await run('php', ['artisan', 'list', '--format=json']);
		const diagnosis = diagnoseArtisan(result);

		if (diagnosis.kind === 'error') {
			const location = artisanErrorLocation(result.stdout + result.stderr);
			return { kind: 'error', detail: diagnosis.detail, title: "Laravel couldn't list its commands", body: diagnosis.detail, open: location };
		}
		if (diagnosis.kind !== 'ok') return diagnosis;

		const mode = getConfigWithWorkspaceOverride('taskfinder.artisan-commands') === 'all' ? 'all' : 'common';
		return { kind: 'ok', tasks: artisanCommands(diagnosis.value, mode).map((name) => ({ name, command: 'php', args: ['artisan', name] })) };
	},
};

export default cliAssistant(artisanSource);
