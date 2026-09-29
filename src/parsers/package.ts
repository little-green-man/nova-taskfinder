import { getConfigWithWorkspaceOverride } from '../config';
import type { PackageJson } from '../formats';
import { clearNotification, howToInstall, notify, openProjectSettings, setProjectSetting } from '../notify';
import { fileExists, isInstalled, listRootFolders, readRootFile } from '../process';
import { detectPackageManager, hasConflictingLockfiles, isNpmHook, isPackageManager, packageManagerFiles, runsPrePostHooks } from '../scripts';
import type { Detection } from '../scripts';
import { fileAssistant } from '../source';
import type { FileSource, ListedTask } from '../source';
import { expandWorkspaces, memberTaskName, packageJsonWorkspaces, pnpmWorkspaces } from '../workspaces';
import { showLifecycleScripts } from '../tasks';

/* The package-manager setting wins; `auto` (or unset) detects from package.json and root files. Re-resolved on every reload, as lockfiles change. */
function resolvePackageManager(json: PackageJson | null, rootFiles: string[]): Detection {
	const setting = getConfigWithWorkspaceOverride('taskfinder.package-manager');
	const detection = detectPackageManager(json, rootFiles);
	return isPackageManager(setting) ? { ...detection, name: setting, source: 'setting' } : detection;
}

/** The project's package manager (setting, or detected from package.json and lockfiles), for other sources' npm tasks */
export function projectPackageManager(): string {
	let json: PackageJson | null = null;
	try {
		json = JSON.parse(readRootFile('package.json') ?? 'null');
	} catch {
		/* an invalid package.json is reported by the Node source; detection falls back to the lockfiles */
	}
	const rootFiles = packageManagerFiles.filter((name) => fileExists(nova.path.join(nova.workspace.path ?? '', name)));
	return resolvePackageManager(json, rootFiles).name;
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

/**
 * Files whose changes reload Node tasks: package.json and package-manager files, plus each workspace package's
 * package.json found on the last read. The feature registry holds this same array, so it's updated in place.
 */
const baseFiles = ['package.json', ...packageManagerFiles];
export const nodeFiles: string[] = [...baseFiles];

const workspacePackagesOn = () => getConfigWithWorkspaceOverride('taskfinder.workspace-packages') === true;

/** Scripts to list from a package.json, hiding lifecycle hooks unless they're shown */
const visibleScripts = (json: PackageJson | null, prePostHooks: boolean) => {
	const scripts = Object.keys(json?.scripts ?? {});
	return showLifecycleScripts() ? scripts : scripts.filter((name) => !isNpmHook(name, scripts, prePostHooks));
};

/** Tasks from workspace packages (`<package>: <script>`, run in the package's folder), when Workspace Packages is on */
function workspaceTasks(json: PackageJson | null, pm: string, prePostHooks: boolean): ListedTask[] {
	const patterns = [...packageJsonWorkspaces(json), ...pnpmWorkspaces(readRootFile('pnpm-workspace.yaml'))];
	const members = expandWorkspaces(patterns, listRootFolders).filter((folder) => readRootFile(`${folder}/package.json`) !== undefined);
	nodeFiles.splice(baseFiles.length, Infinity, ...members.map((folder) => `${folder}/package.json`));

	return members.flatMap((folder) => {
		let member: PackageJson | null;
		try {
			member = JSON.parse(readRootFile(`${folder}/package.json`) ?? '{}');
		} catch (e) {
			console.error(`node: skipping ${folder}/package.json: ${(e as Error).message}`);
			return [];
		}
		return visibleScripts(member, prePostHooks).map((script) => ({
			name: memberTaskName(member?.name, folder, script),
			command: pm,
			args: ['run', script],
			cwd: folder,
			script,
		}));
	});
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
		let json: PackageJson | null;
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

		const prePostHooks = runsPrePostHooks(pm.name, {
			packageJson: json,
			hasYarnrcYml: rootFiles.includes('.yarnrc.yml'),
			npmrc: pm.name === 'pnpm' ? readRootFile('.npmrc') : undefined,
			pnpmWorkspace: pm.name === 'pnpm' ? readRootFile('pnpm-workspace.yaml') : undefined,
		});

		/* always `run`: built-in commands take priority over scripts of the same name in yarn, pnpm and bun */
		const tasks: ListedTask[] = visibleScripts(json, prePostHooks).map((name) => ({ name, command: pm.name, args: ['run', name] }));
		if (workspacePackagesOn()) tasks.push(...workspaceTasks(json, pm.name, prePostHooks));
		else nodeFiles.splice(baseFiles.length);
		return { kind: 'ok', tasks };
	},
};

export default fileAssistant(nodeSource);
