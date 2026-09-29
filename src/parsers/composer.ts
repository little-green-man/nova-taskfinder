import { clearNotification, howToInstall, notify, openRootFile, setProjectSetting } from '../notify';
import { isInstalled } from '../process';
import { isComposerEvent } from '../scripts';
import { createTask, showLifecycleScripts } from '../tasks';

class Composer {
	packageProcessName: string;
	packageJsonPath: string;
	tasks: any[];

	constructor() {
		this.tasks = [];
		this.packageProcessName = 'composer';
		this.packageJsonPath = `${nova.workspace.path}/composer.json`;
	}

	/* Checked once per window; tasks are listed either way */
	checkInstalled() {
		isInstalled(this.packageProcessName).then((installed) => {
			if (installed) return;
			notify('composer-missing', "Composer isn't installed", "This project has a composer.json, but composer isn't on your PATH, so its tasks won't run. Turn Off stops listing Composer tasks in this project.", [
				howToInstall('composer'),
				setProjectSetting('Turn Off', 'taskfinder.auto-composer', false),
			]);
		});
	}

	findTasks() {
		const composerFile = nova.fs.stat(this.packageJsonPath);
		if (composerFile && composerFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				let json: any;
				try {
					json = JSON.parse(contents);
				} catch (e) {
					notify('composer-invalid-json', 'composer.json has an error', `Composer tasks can't be listed until it's fixed: ${(e as Error).message}`, [
						openRootFile('composer.json'),
					]);
					return;
				}
				clearNotification('composer-invalid-json');
				this.checkInstalled();

				if (json.hasOwnProperty('scripts')) {
					const showEvents = showLifecycleScripts();

					Object.keys(json.scripts).forEach((key) => {
						if (!showEvents && isComposerEvent(key)) return;
						this.tasks.push(createTask(key, this.packageProcessName, ['run', key]));
					});
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	provideTasks() {
		this.tasks = [];
		this.findTasks();
		console.info(`${this.packageJsonPath} has ${this.tasks.length} task(s)`);
		return this.tasks;
	}
}

export default Composer;
