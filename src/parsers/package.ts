import { getConfigWithWorkspaceOverride } from '../config';
import { clearNotification, howToInstall, notify, openProjectSettings, setProjectSetting } from '../notify';
import { fileExists, isInstalled, readRootFile } from '../process';
import { detectPackageManager, hasConflictingLockfiles, isNpmHook, isPackageManager, packageManagerFiles, runsPrePostHooks } from '../scripts';
import type { Detection } from '../scripts';
import { fileAssistant } from '../source';
import type { FileSource } from '../source';
import { showLifecycleScripts } from '../tasks';

/* The package-manager setting wins; `auto` (or unset) detects from package.json and root files. Re-resolved on every reload, as lockfiles change. */
function resolvePackageManager(json: any, rootFiles: string[]): Detection {
	const setting = getConfigWithWorkspaceOverride('taskfinder.package-manager');
	const detection = detectPackageManager(json, rootFiles);
	return isPackageManager(setting) ? { ...detection, name: setting, source: 'setting' } : detection;
}

/* Where the package manager choice came from, for messages */
function describeSource(pm: Detection): string {
	if (pm.source === 'setting') return 'set in Package Manager';
	if (pm.source === 'packageManager') return 'from the packageManager field';
	if (pm.source === 'devEngines') return 'from devEngines';
	if (pm.source === 'default') return 'the default';
	return `from ${pm.source}`;
}

/* Checked once per window per package manager; the notification clears if a later reload picks one that is installed */
function checkInstalled(pm: Detection) {
	isInstalled(pm.name).then((installed) => {
		if (installed) return clearNotification('node-pm-missing');

		const actions =
			pm.source === 'setting'
				? [howToInstall(pm.name), openProjectSettings]
				: [howToInstall(pm.name), ...(pm.name === 'npm' ? [] : [setProjectSetting('Use npm', 'taskfinder.package-manager', 'npm')])];
		notify(
			'node-pm-missing',
			`${pm.name} isn't installed`,
			`This project uses ${pm.name} (${describeSource(pm)}), but ${pm.name} isn't on your PATH, so its tasks won't run.`,
			actions
		);
	});
}

function notifyLockfiles(pm: Detection) {
	if (!hasConflictingLockfiles(pm.lockfiles)) return clearNotification('node-lockfiles');
	notify(
		'node-lockfiles',
		'Lockfiles for several package managers',
		`This project has ${pm.lockfiles.slice(0, -1).join(', ')} and ${pm.lockfiles[pm.lockfiles.length - 1]}. Using ${pm.name} (${describeSource(pm)}); if that's wrong, choose a Package Manager in Settings.`,
		[openProjectSettings]
	);
}

export const nodeSource: FileSource = {
	id: 'node',
	names: { tool: 'npm', file: 'a package.json', listing: 'Node tasks', noun: 'tasks', turnOff: 'listing Node tasks' },
	rootFiles: ['package.json'],
	settingKey: 'taskfinder.auto-node',
	installKey: 'npm',
	/* no generic tool check: the package manager is chosen per project (checkInstalled) */
	ids: { error: 'node-invalid-json' },

	list(file) {
		let json: any;
		try {
			json = JSON.parse(readRootFile(file) ?? '{}');
		} catch (e) {
			const detail = (e as Error).message;
			return { kind: 'error', detail, body: `Node tasks can't be listed until it's fixed: ${detail}` };
		}

		const rootFiles = packageManagerFiles.filter((name) => fileExists(nova.path.join(nova.workspace.path ?? '', name)));
		const pm = resolvePackageManager(json, rootFiles);
		console.info(`node: using ${pm.name} (${describeSource(pm)})`);
		notifyLockfiles(pm);
		checkInstalled(pm);

		const scripts = Object.keys(json?.scripts ?? {});
		const showHooks = showLifecycleScripts();
		const prePostHooks = runsPrePostHooks(pm.name, {
			packageJson: json,
			hasYarnrcYml: rootFiles.includes('.yarnrc.yml'),
			npmrc: pm.name === 'pnpm' ? readRootFile('.npmrc') : undefined,
			pnpmWorkspace: pm.name === 'pnpm' ? readRootFile('pnpm-workspace.yaml') : undefined,
		});

		/* always `run`: built-in commands take priority over scripts of the same name in yarn, pnpm and bun */
		const names = scripts.filter((name) => showHooks || !isNpmHook(name, scripts, prePostHooks));
		return { kind: 'ok', tasks: names.map((name) => ({ name, command: pm.name, args: ['run', name] })) };
	},
};

export default fileAssistant(nodeSource);
