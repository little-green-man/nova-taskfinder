import type { PackageJson } from './formats';

/**
 * Pure naming rules shared by the parsers. No Nova globals or imports, so it can be unit-tested in Node.
 */

type ActionName = 'run' | 'build' | 'clean';

const matches = (name: string, words: string[]) => {
	const lower = name.toLowerCase();
	return words.some((word) => lower === word || lower.startsWith(`${word}:`));
};

/** Nova actions for a script: always Run, plus Build or Clean for build/clean-style names (exact or `name:*`). */
function actionsFor(name: string): ActionName[] {
	if (matches(name, ['build', 'compile'])) return ['run', 'build'];
	if (matches(name, ['clean'])) return ['run', 'clean'];
	return ['run'];
}

/* Scripts npm runs itself during install, publish, pack, version, restart and stop (https://docs.npmjs.com/cli/using-npm/scripts) */
const npmLifecycle = new Set([
	'preinstall',
	'install',
	'postinstall',
	'prepublish',
	'preprepare',
	'prepare',
	'postprepare',
	'prepublishOnly',
	'prepack',
	'postpack',
	'publish',
	'postpublish',
	'preversion',
	'version',
	'postversion',
	'dependencies',
	'prerestart',
	'postrestart',
	'prestop',
	'poststop',
]);

/**
 * Whether an npm script is a hook the package manager runs automatically.
 * `pre<x>`/`post<x>` only count when `<x>` is also a script and the package manager runs them (npm, Yarn 1; not pnpm or Yarn 2+).
 */
function isNpmHook(name: string, scripts: string[], prePostHooks: boolean): boolean {
	if (npmLifecycle.has(name)) return true;
	if (!prePostHooks) return false;

	const target = name.startsWith('pre') ? name.slice(3) : name.startsWith('post') ? name.slice(4) : '';
	return target !== '' && scripts.includes(target);
}

/* Composer command, installer and package events (https://getcomposer.org/doc/articles/scripts.md#event-names). Plugin events such as `init` and `command` are left out: a root script with those names is almost certainly a custom one. */
const composerEvents = new Set([
	'pre-install-cmd',
	'post-install-cmd',
	'pre-update-cmd',
	'post-update-cmd',
	'pre-status-cmd',
	'post-status-cmd',
	'pre-archive-cmd',
	'post-archive-cmd',
	'pre-autoload-dump',
	'post-autoload-dump',
	'post-root-package-install',
	'post-create-project-cmd',
	'pre-operations-exec',
	'pre-package-install',
	'post-package-install',
	'pre-package-update',
	'post-package-update',
	'pre-package-uninstall',
	'post-package-uninstall',
]);

/** Whether a Composer script is an event Composer runs automatically. */
function isComposerEvent(name: string): boolean {
	return composerEvents.has(name);
}

/** Whether a project uses Yarn 2+ (Berry), which doesn't run arbitrary pre/post scripts. */
function isYarnBerry(packageManagerField: unknown, hasYarnrcYml: boolean): boolean {
	if (hasYarnrcYml) return true;
	const match = typeof packageManagerField === 'string' ? packageManagerField.match(/^yarn@(\d+)/) : null;
	return match !== null && Number(match[1]) >= 2;
}

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

const packageManagers: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];

const isPackageManager = (value: unknown): value is PackageManager => packageManagers.includes(value as PackageManager);

/* Root lockfiles in detection order. npm comes last: a stray package-lock.json is the most common accident. */
const lockfiles: Array<[string, PackageManager]> = [
	['bun.lock', 'bun'],
	['bun.lockb', 'bun'],
	['pnpm-lock.yaml', 'pnpm'],
	['yarn.lock', 'yarn'],
	['package-lock.json', 'npm'],
	['npm-shrinkwrap.json', 'npm'],
];

/* Root files that affect which package manager is used, or how it behaves */
const packageManagerFiles = [...lockfiles.map(([file]) => file), '.yarnrc.yml', '.npmrc', 'pnpm-workspace.yaml'];

/** Parses a Corepack `packageManager` field, e.g. `pnpm@9.1.0+sha512.abc` → { name: 'pnpm', major: 9 }. */
function parsePackageManagerField(value: unknown): { name: string; major: number | null } | null {
	if (typeof value !== 'string') return null;
	const match = value.match(/^([^@\s]+)@?(\d+)?/);
	return match ? { name: match[1], major: match[2] === undefined ? null : Number(match[2]) } : null;
}

interface Detection {
	name: PackageManager;
	/** What decided it, for logging: `packageManager`, `devEngines`, a lockfile name, or `default` */
	source: string;
	/** Lockfiles present at the root, in detection order */
	lockfiles: string[];
}

/**
 * Works out a project's package manager: the `packageManager` field, then `devEngines.packageManager`
 * (the first entry if it's an array), then root lockfiles, then npm. Unknown names are skipped.
 */
function detectPackageManager(packageJson: PackageJson | null | undefined, rootFiles: string[]): Detection {
	const present = lockfiles.filter(([file]) => rootFiles.includes(file));
	const found = (name: PackageManager, source: string): Detection => ({ name, source, lockfiles: present.map(([file]) => file) });

	const field = parsePackageManagerField(packageJson?.packageManager)?.name;
	if (isPackageManager(field)) return found(field, 'packageManager');

	const devEngines = packageJson?.devEngines?.packageManager;
	const devEngine = (Array.isArray(devEngines) ? devEngines[0] : devEngines)?.name;
	if (isPackageManager(devEngine)) return found(devEngine, 'devEngines');

	if (present.length > 0) return found(present[0][1], present[0][0]);

	return found('npm', 'default');
}

/** Whether the lockfiles at the root belong to more than one package manager. */
const hasConflictingLockfiles = (files: string[]): boolean =>
	new Set(lockfiles.filter(([file]) => files.includes(file)).map(([, name]) => name)).size > 1;

interface HookContext {
	packageJson: PackageJson | null | undefined;
	hasYarnrcYml: boolean;
	/** Contents of .npmrc, if any */
	npmrc?: string;
	/** Contents of pnpm-workspace.yaml, if any */
	pnpmWorkspace?: string;
}

/**
 * Whether the package manager runs `pre<x>`/`post<x>` automatically:
 * npm, Yarn 1 and bun do; Yarn 2+ doesn't; pnpm does from v9 (off by default in 7–8), unless set explicitly.
 */
function runsPrePostHooks(pm: PackageManager, { packageJson, hasYarnrcYml, npmrc, pnpmWorkspace }: HookContext): boolean {
	if (pm === 'yarn') return !isYarnBerry(packageJson?.packageManager, hasYarnrcYml);
	if (pm !== 'pnpm') return true;

	/* pnpm-workspace.yaml is where newer pnpm keeps settings, so it wins over .npmrc */
	const explicit =
		pnpmWorkspace?.match(/^\s*enablePrePostScripts\s*:\s*(true|false)\s*$/m) ?? npmrc?.match(/^\s*enable-pre-post-scripts\s*=\s*(true|false)\s*$/m);
	if (explicit) return explicit[1] === 'true';

	const field = parsePackageManagerField(packageJson?.packageManager);
	if (field?.name === 'pnpm' && field.major !== null) return field.major >= 9;

	return true;
}

export {
	actionsFor,
	isNpmHook,
	isComposerEvent,
	isYarnBerry,
	isPackageManager,
	packageManagerFiles,
	detectPackageManager,
	hasConflictingLockfiles,
	runsPrePostHooks,
};
export type { ActionName, PackageManager, Detection };
