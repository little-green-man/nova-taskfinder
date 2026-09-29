/**
 * The shapes of the files and tool output the sources read. Everything is optional: it's someone else's file or
 * another program's output, so the code that uses these still checks values before trusting them.
 */

interface PackageManagerEntry {
	name?: unknown;
	version?: unknown;
	onFail?: unknown;
}

/** package.json */
interface PackageJson {
	name?: unknown;
	scripts?: Record<string, unknown>;
	/** npm, Yarn and bun: an array of patterns, or Yarn 1's `{ packages: [...] }` */
	workspaces?: unknown;
	/** Corepack: `pnpm@9.1.0+sha512…` */
	packageManager?: unknown;
	devEngines?: { packageManager?: PackageManagerEntry | PackageManagerEntry[] };
}

/** composer.json */
interface ComposerJson {
	scripts?: Record<string, unknown>;
}

/** deno.json / deno.jsonc: a task is a command string, or `{ command?, description?, dependencies? }` */
interface DenoJson {
	name?: unknown;
	tasks?: Record<string, unknown>;
	/** member folders: an array, or `{ members: [...] }` */
	workspace?: unknown;
}

/** `task --list-all --json` */
interface TaskList {
	tasks?: Array<{ name?: unknown }>;
}

/** `maid --system json` */
interface MaidList {
	tasks?: Record<string, { hide?: unknown } | undefined>;
}

/** A recipe in `just --dump --dump-format json` */
interface JustRecipe {
	name?: string;
	/** `sub::lint` for module recipes */
	namepath?: string;
	private?: boolean;
	parameters?: Array<{ name?: string; kind?: string; default?: unknown }>;
	/** `"confirm"`, `{ "confirm": "message" }`, … */
	attributes?: unknown[];
}

/** `just --dump --dump-format json`, or one of its modules */
interface JustDump {
	recipes?: Record<string, JustRecipe>;
	modules?: Record<string, JustDump>;
}

/** A command in `php artisan list --format=json` */
interface ArtisanCommand {
	name?: unknown;
	hidden?: boolean;
	/** PHP encodes "no arguments" as `[]` */
	definition?: { arguments?: Record<string, { is_required?: boolean }> | [] };
}

/** `php artisan list --format=json` */
interface ArtisanList {
	commands?: ArtisanCommand[];
}

export type { PackageJson, ComposerJson, DenoJson, TaskList, MaidList, JustRecipe, JustDump, ArtisanCommand, ArtisanList };
