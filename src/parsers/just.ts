import { getConfigWithWorkspaceOverride } from '../config';
import { diagnoseJust } from '../diagnose';
import { clearNotification, howToInstall, installUrls, notify, openRootFile, openUrl, turnOff } from '../notify';
import { firstRootFile, isInstalled, run } from '../process';
import { justRecipes } from '../recipes';
import { createTask } from '../tasks';

/* just finds `justfile` in any case, or `.justfile` (https://just.systems/man/en/) */
export const justFiles = ['justfile', 'Justfile', 'JUSTFILE', '.justfile'];

class Just {
	packageProcessName: string = 'just';

	async provideTasks() {
		/* just walks up parent folders, so only run it when the project root has a justfile */
		const justfile = firstRootFile(justFiles);
		if (!justfile) return [];

		if (!(await isInstalled(this.packageProcessName))) {
			notify('just-missing', "just isn't installed", "This project has a justfile, but the just command isn't on your PATH, so its recipes can't be listed. Turn Off stops reading the justfile in this project.", [
				howToInstall('just'),
				turnOff('taskfinder.auto-just'),
			]);
			return [];
		}

		/* `--json` is shorter but only exists from just 1.48 */
		const diagnosis = diagnoseJust(await run(this.packageProcessName, ['--dump', '--dump-format', 'json']));

		if (diagnosis.kind === 'old-version') {
			notify('just-old', 'just needs updating', 'Automatic Tasks needs just 1.15 or later to list recipes.', [openUrl('Update', installUrls.just)]);
			return [];
		}
		if (diagnosis.kind === 'error') {
			notify('justfile-error', `${justfile} has an error`, `just recipes can't be listed: ${diagnosis.detail}`, [openRootFile(justfile)]);
			return [];
		}
		if (diagnosis.kind !== 'ok') return [];

		clearNotification('just-old');
		clearNotification('justfile-error');

		const confirm = getConfigWithWorkspaceOverride('taskfinder.just-confirm-recipes') === 'yes' ? 'yes' : 'exclude';
		const tasks = justRecipes(diagnosis.value, confirm).map(({ name, args }) => createTask(name, this.packageProcessName, args));

		console.info(`justfile has ${tasks.length} recipe(s)`);
		return tasks;
	}
}

export default Just;
