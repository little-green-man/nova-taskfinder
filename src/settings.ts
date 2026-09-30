/**
 * Labels for each setting's choices, shared by the Project Settings `resolve` commands and the manifest test.
 * No Nova globals or imports, so it can be unit-tested in Node.
 */

type Choice = [value: string | boolean, label: string];

/* Short labels, as shown in Project Settings and in "Use Global Setting (…)". Keep in step with extension.json. */
const choices: Record<string, Choice[]> = {
	'taskfinder.auto-node': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-composer': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-taskfile': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-maidfile': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-just': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-deno': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-make': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-artisan': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.auto-vscode': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.workspace-packages': [
		[true, 'On'],
		[false, 'Off'],
	],
	'taskfinder.package-manager': [
		['auto', 'Automatic'],
		['npm', 'npm'],
		['yarn', 'yarn'],
		['pnpm', 'pnpm'],
		['bun', 'bun'],
	],
	'taskfinder.show-lifecycle-scripts': [
		[true, 'Show'],
		[false, 'Hide'],
	],
	'taskfinder.just-confirm-recipes': [
		['exclude', 'Hide'],
		['yes', 'Show, and confirm when run'],
	],
	'taskfinder.make-listing': [
		['database', 'Asking make'],
		['file', 'Reading the Makefile'],
	],
	'taskfinder.make-jobs': [
		['off', 'One at a time'],
		['auto', 'One per CPU core'],
	],
	'taskfinder.artisan-commands': [
		['common', 'Common'],
		['all', 'All'],
	],
};

const USE_GLOBAL = 'Use Global Setting';

/**
 * A Project Settings pop-up's choices: "Use Global Setting" (naming the current preference, e.g. "Use Global Setting (On)")
 * followed by the setting's own choices. `null` stores "follow the preference".
 */
function projectChoices(key: string, globalValue: unknown): Array<[string | boolean | null, string]> {
	const own = choices[key] ?? [];
	const current = own.find(([value]) => value === globalValue)?.[1];
	return [[null, current ? `${USE_GLOBAL} (${current})` : USE_GLOBAL], ...own];
}

/** The command name that resolves a setting's Project Settings choices. */
const resolveCommand = (key: string) => `${key}.choices`;

export { choices, projectChoices, resolveCommand, USE_GLOBAL };
export type { Choice };
