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

export { actionsFor, isNpmHook, isComposerEvent, isYarnBerry };
export type { ActionName };
