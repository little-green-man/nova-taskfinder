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

	findTasks() {
		const composerFile = nova.fs.stat(this.packageJsonPath);
		if (composerFile && composerFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				const json = JSON.parse(contents);
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
