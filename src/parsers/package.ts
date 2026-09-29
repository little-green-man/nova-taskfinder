import { getConfigWithWorkspaceOverride } from '../config';
import { clearNotification, howToInstall, notify, openProjectSettings, openRootFile, setProjectSetting } from '../notify';
import { isInstalled } from '../process';
import { detectPackageManager, hasConflictingLockfiles, isNpmHook, isPackageManager, packageManagerFiles, runsPrePostHooks } from '../scripts';
import type { Detection } from '../scripts';
import { createTask, showLifecycleScripts } from '../tasks';

class NodeTaskAssistant {
	tasks: any[];
	packageJsonPath: string;

	constructor() {
		this.tasks = [];
		this.packageJsonPath = `${nova.workspace.path}/package.json`;
	}

	rootPath = (file: string) => `${nova.workspace.path}/${file}`;

	readRootFile(file: string): string | undefined {
		try {
			if (nova.fs.stat(this.rootPath(file))?.isFile()) return nova.fs.open(this.rootPath(file)).read() as string;
		} catch (e) {
			console.log(e);
		}
		return undefined;
	}

	/* The package-manager setting wins; `auto` (or unset) detects from package.json and root files. Re-resolved on every reload, as lockfiles change. */
	resolvePackageManager(json: any, rootFiles: string[]): Detection {
		const setting = getConfigWithWorkspaceOverride('taskfinder.package-manager');
		const detection = detectPackageManager(json, rootFiles);
		return isPackageManager(setting) ? { ...detection, name: setting, source: 'setting' } : detection;
	}

	/* Where the package manager choice came from, for messages */
	describeSource(pm: Detection): string {
		if (pm.source === 'setting') return 'set in Package Manager';
		if (pm.source === 'packageManager') return 'from the packageManager field';
		if (pm.source === 'devEngines') return 'from devEngines';
		if (pm.source === 'default') return 'the default';
		return `from ${pm.source}`;
	}

	/* Checked once per window; the notification clears if a later reload picks a package manager that is installed */
	checkInstalled(pm: Detection) {
		isInstalled(pm.name).then((installed) => {
			if (installed) return clearNotification('node-pm-missing');

			const actions =
				pm.source === 'setting'
					? [howToInstall(pm.name), openProjectSettings]
					: [howToInstall(pm.name), ...(pm.name === 'npm' ? [] : [setProjectSetting('Use npm', 'taskfinder.package-manager', 'npm')])];
			notify('node-pm-missing', `${pm.name} isn't installed`, `This project uses ${pm.name} (${this.describeSource(pm)}), but ${pm.name} isn't on your PATH, so its tasks won't run.`, actions);
		});
	}

	findTasks() {
		const nodeFile = nova.fs.stat(this.packageJsonPath);
		if (nodeFile && nodeFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				let json: any;
				try {
					json = JSON.parse(contents);
				} catch (e) {
					notify('node-invalid-json', 'package.json has an error', `Node tasks can't be listed until it's fixed: ${(e as Error).message}`, [openRootFile('package.json')]);
					return;
				}
				clearNotification('node-invalid-json');

				const rootFiles = packageManagerFiles.filter((file) => nova.fs.stat(this.rootPath(file))?.isFile());
				const pm = this.resolvePackageManager(json, rootFiles);

				console.info(`Node: using ${pm.name} (from ${pm.source})`);
				if (hasConflictingLockfiles(pm.lockfiles)) {
					notify(
						'node-lockfiles',
						'Lockfiles for several package managers',
						`This project has ${pm.lockfiles.slice(0, -1).join(', ')} and ${pm.lockfiles[pm.lockfiles.length - 1]}. Using ${pm.name} (${this.describeSource(pm)}); if that's wrong, choose a Package Manager in Settings.`,
						[openProjectSettings]
					);
				} else {
					clearNotification('node-lockfiles');
				}
				this.checkInstalled(pm);

				if (json.hasOwnProperty('scripts')) {
					const scripts = Object.keys(json.scripts);
					const showHooks = showLifecycleScripts();
					const prePostHooks = runsPrePostHooks(pm.name, {
						packageJson: json,
						hasYarnrcYml: rootFiles.includes('.yarnrc.yml'),
						npmrc: pm.name === 'pnpm' ? this.readRootFile('.npmrc') : undefined,
						pnpmWorkspace: pm.name === 'pnpm' ? this.readRootFile('pnpm-workspace.yaml') : undefined,
					});

					scripts.forEach((key) => {
						if (!showHooks && isNpmHook(key, scripts, prePostHooks)) return;
						/* always `run`: built-in commands take priority over scripts of the same name in yarn, pnpm and bun */
						this.tasks.push(createTask(key, pm.name, ['run', key]));
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

export default NodeTaskAssistant;
