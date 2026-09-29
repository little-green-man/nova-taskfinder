import { getConfigWithWorkspaceOverride } from '../config';
import { artisanErrorLocation, diagnoseArtisan } from '../diagnose';
import { clearNotification, howToInstall, notify, openRootFile, turnOff } from '../notify';
import { firstRootFile, isInstalled, run } from '../process';
import { artisanCommands } from '../recipes';
import { createTask } from '../tasks';

/* `artisan` identifies a Laravel app; console routes and new packages change the command list */
export const artisanFiles = ['artisan', 'routes/console.php', 'composer.lock'];

class Artisan {
	packageProcessName: string = 'php';

	async provideTasks() {
		if (!firstRootFile(['artisan'])) return [];

		if (!(await isInstalled(this.packageProcessName))) {
			notify('php-missing', "PHP isn't installed", "This project has Laravel's artisan, but php isn't on your PATH, so its commands can't be listed. Turn Off stops listing artisan commands in this project.", [
				howToInstall('php'),
				turnOff('taskfinder.auto-artisan'),
			]);
			return [];
		}

		/* listing starts the Laravel app, so it runs the project's own PHP (service providers, routes/console.php) */
		const result = await run(this.packageProcessName, ['artisan', 'list', '--format=json']);
		const diagnosis = diagnoseArtisan(result);

		if (diagnosis.kind === 'error') {
			const location = artisanErrorLocation(result.stdout + result.stderr);
			notify('artisan-error', "Laravel couldn't list its commands", diagnosis.detail, location ? [openRootFile(location.file, location.line)] : []);
			return [];
		}
		if (diagnosis.kind !== 'ok') return [];
		clearNotification('artisan-error');

		const mode = getConfigWithWorkspaceOverride('taskfinder.artisan-commands') === 'all' ? 'all' : 'common';
		const tasks = artisanCommands(diagnosis.value, mode).map((name) => createTask(name, this.packageProcessName, ['artisan', name]));

		console.info(`artisan has ${tasks.length} command(s) (${mode})`);
		return tasks;
	}
}

export default Artisan;
