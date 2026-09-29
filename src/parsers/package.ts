import { getConfigWithWorkspaceOverride } from '../config';
import { isNpmHook, isYarnBerry } from '../scripts';
import { createTask, showLifecycleScripts } from '../tasks';

class NodeTaskAssistant {
	tasks: any[];
	packageManager: string;
	packageJsonPath: string;

	constructor() {
		this.tasks = [];
		this.packageManager = String(getConfigWithWorkspaceOverride('taskfinder.package-manager') ?? 'npm');
		this.packageJsonPath = `${nova.workspace.path}/package.json`;
	}

	/* npm and Yarn 1 run pre<x>/post<x> automatically; Yarn 2+ doesn't */
	runsPrePostHooks(json: any): boolean {
		if (this.packageManager !== 'yarn') return true;
		const yarnrc = nova.fs.stat(`${nova.workspace.path}/.yarnrc.yml`);
		return !isYarnBerry(json.packageManager, Boolean(yarnrc?.isFile()));
	}

	findTasks() {
		const nodeFile = nova.fs.stat(this.packageJsonPath);
		if (nodeFile && nodeFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				const json = JSON.parse(contents);
				if (json.hasOwnProperty('scripts')) {
					const scripts = Object.keys(json.scripts);
					const showHooks = showLifecycleScripts();
					const prePostHooks = this.runsPrePostHooks(json);

					scripts.forEach((key) => {
						if (!showHooks && isNpmHook(key, scripts, prePostHooks)) return;

						const args = this.packageManager === 'yarn' ? [key] : ['run', key];
						this.tasks.push(createTask(key, this.packageManager, args));
					});
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	provideTasks() {
		this.tasks = [];
		this.statusUpdate();
		this.findTasks();
		console.info(`${this.packageJsonPath} has ${this.tasks.length} task(s)`);
		return this.tasks;
	}

	statusUpdate = () => console.info(`Node settings: Using ${this.packageManager}`);
}

export default NodeTaskAssistant;
