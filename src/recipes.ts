import type { ArtisanCommand, ArtisanList, DenoJson, JustDump } from './formats';

/**
 * Pure rules for reading just, Deno, Make and artisan task lists. No Nova globals or imports, so they can be unit-tested in Node.
 */

interface ListedTask {
	name: string;
	args: string[];
}

/* just */

type JustConfirmMode = 'exclude' | 'yes';

/** Runnable recipes from `just --dump --dump-format json`, including modules (run as `just mod::recipe`). */
function justRecipes(dump: JustDump | undefined, confirm: JustConfirmMode): ListedTask[] {
	const tasks: ListedTask[] = [];

	const walk = (module: JustDump | undefined) => {
		Object.values(module?.recipes ?? {}).forEach((recipe) => {
			if (recipe.private) return;
			/* a parameter without a default needs an argument, unless it's `*` variadic (zero or more) */
			if ((recipe.parameters ?? []).some((p) => p.default === null && p.kind !== 'star')) return;

			const needsConfirm = (recipe.attributes ?? []).some((a) => a === 'confirm' || (typeof a === 'object' && a !== null && 'confirm' in a));
			if (needsConfirm && confirm === 'exclude') return;

			const name = recipe.namepath ?? recipe.name;
			if (!name) return;
			tasks.push({ name, args: needsConfirm ? ['--yes', name] : [name] });
		});
		Object.values(module?.modules ?? {}).forEach(walk);
	};

	walk(dump);
	return tasks;
}

/* Deno */

/**
 * Parses JSONC (as used by deno.json/deno.jsonc): `//` and `/* *\/` comments and trailing commas are allowed.
 * Comment markers inside strings are left alone. Throws like JSON.parse on invalid input.
 */
function parseJsonc(text: string): unknown {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const char = text[i];
		if (char === '"') {
			const start = i++;
			while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
			out += text.slice(start, ++i);
		} else if (char === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
		} else if (char === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 2;
		} else {
			out += char;
			i++;
		}
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Task names from deno.json: a task is a command string, or an object with `command` and/or `dependencies`. */
function denoTasks(json: unknown): string[] {
	const tasks = typeof json === 'object' && json !== null ? (json as DenoJson).tasks : undefined;
	if (typeof tasks !== 'object' || tasks === null) return [];
	return Object.entries(tasks)
		.filter(([, task]) => typeof task === 'string' || (typeof task === 'object' && task !== null))
		.map(([name]) => name);
}

/* Make */

interface MakeRules {
	targets: string[];
	phony: string[];
	/** Literal file names from `include` lines (no variables or wildcards) */
	includes: string[];
}

/* A rule line: targets before a single or double colon that isn't an assignment (`:=`, `::=`) */
const ruleLine = /^([^\s:=#][^:=#]*?)\s*::?(?![:=])(.*)$/;

const splitNames = (text: string) => text.split(/\s+/).filter(Boolean);

/** Reads rules from Makefile text: targets, `.PHONY` names and literal includes. Recipes, `define` blocks and assignments are skipped. */
function makeRulesFromText(text: string): MakeRules {
	const rules: MakeRules = { targets: [], phony: [], includes: [] };
	let inDefine = false;

	text
		.replace(/\\\n/g, ' ')
		.split('\n')
		.forEach((line) => {
			if (line.startsWith('\t')) return;
			const trimmed = line.replace(/#.*/, '').trim();
			if (/^define\b/.test(trimmed)) inDefine = true;
			if (inDefine) {
				if (/^endef\b/.test(trimmed)) inDefine = false;
				return;
			}

			const include = trimmed.match(/^-?s?include\s+(.+)$/);
			if (include) {
				rules.includes.push(...splitNames(include[1]).filter((name) => !/[$*?[%]/.test(name)));
				return;
			}

			const rule = trimmed.match(ruleLine);
			if (!rule) return;
			const names = splitNames(rule[1]);
			if (names.includes('.PHONY')) rules.phony.push(...splitNames(rule[2].replace(/;.*/, '')));
			else rules.targets.push(...names);
		});

	return rules;
}

/** Reads rules from `make -pRrq` output (make's database). Rules marked `# Not a target:` are skipped; targets are sorted. */
function makeRulesFromDatabase(output: string): MakeRules {
	const rules: MakeRules = { targets: [], phony: [], includes: [] };
	let notATarget = false;

	output.split('\n').forEach((line) => {
		if (line.startsWith('# Not a target')) {
			notATarget = true;
			return;
		}
		if (line.startsWith('#') || line.startsWith('\t') || line.trim() === '') {
			if (line.trim() === '') notATarget = false;
			return;
		}

		const rule = line.match(ruleLine);
		if (!rule) return;
		const names = splitNames(rule[1]);
		if (names.includes('.PHONY')) rules.phony.push(...splitNames(rule[2]));
		else if (!notATarget) rules.targets.push(...names);
		notATarget = false;
	});

	/* the database isn't in file order */
	rules.targets.sort();
	return rules;
}

/**
 * Targets worth listing: the `.PHONY` ones if any are declared, otherwise name-like targets
 * (no `/`, `.`, `%` or `$`; not starting with `_`). Special targets (`.DEFAULT`, `.SUFFIXES`…) and pattern rules are always dropped.
 */
function makeTargets({ targets, phony }: MakeRules): string[] {
	const unique = [...new Set(targets)].filter((name) => !name.startsWith('.') && !/[%$]/.test(name));
	if (phony.length > 0) return unique.filter((name) => phony.includes(name));
	return unique.filter((name) => !/[/.]/.test(name) && !name.startsWith('_'));
}

/** Words of a flags setting, e.g. `--concurrency 1`; tasks run through the shell, which reads quotes and `$(…)` in them. */
const flagWords = (value: unknown): string[] => (typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : []);

/* One job per CPU core, counted by the shell when the task runs */
const MAKE_JOBS_AUTO = '-j$(sysctl -n hw.ncpu)';

/* -O / --output-sync: needs GNU make 4.0 or later, and only matters with -j */
const isOutputSync = (word: string) => /^(-O\S*|--output-sync(=\S*)?)$/.test(word);

/** Major version from `make --version` ("GNU Make 3.81"); undefined if it isn't GNU make's output. */
function makeMajorVersion(output: string): number | undefined {
	const match = /^GNU Make (\d+)/m.exec(output);
	return match ? Number(match[1]) : undefined;
}

/**
 * Arguments before a Make target: `-j` per core when parallel, then the flags. Output sync is dropped
 * when it can't help (no `-j`) or would stop make running (make before 4.0, e.g. macOS's 3.81).
 */
function makeArgs(flags: string[], parallel: boolean, makeVersion?: number): string[] {
	const sync = parallel && (makeVersion === undefined || makeVersion >= 4);
	return [...(parallel ? [MAKE_JOBS_AUTO] : []), ...flags.filter((word) => sync || !isOutputSync(word))];
}

/* Laravel artisan */

type ArtisanMode = 'common' | 'all';

/* Commands that need a real terminal (REPL, tabbed UI, interactive prompts) or only describe artisan itself */
const artisanExcluded = new Set(['tinker', 'dev', 'docs', 'completion', 'help', 'list']);

/* The "Common" list, plus every `app:` command */
const artisanCommon = new Set([
	'serve',
	'test',
	'migrate',
	'migrate:fresh',
	'migrate:rollback',
	'migrate:status',
	'db:seed',
	'queue:work',
	'queue:listen',
	'schedule:work',
	'schedule:run',
	'pail',
	'optimize',
	'optimize:clear',
	'route:list',
	'about',
	'storage:link',
]);

/** Runnable commands from `php artisan list --format=json`: not hidden, no required arguments, filtered by mode. */
function artisanCommands(json: ArtisanList | undefined, mode: ArtisanMode): string[] {
	const commands: ArtisanCommand[] = Array.isArray(json?.commands) ? json.commands : [];
	return commands
		.filter((command) => typeof command?.name === 'string' && !command.hidden && !artisanExcluded.has(command.name))
		.filter((command) => {
			/* PHP encodes "no arguments" as [] and arguments as { name: { is_required } } */
			const args = command.definition?.arguments;
			return !(args && !Array.isArray(args) && Object.values(args).some((arg) => arg?.is_required));
		})
		.map((command) => command.name as string)
		.filter((name) => mode === 'all' || artisanCommon.has(name) || name.startsWith('app:'));
}

export {
	justRecipes,
	parseJsonc,
	denoTasks,
	makeRulesFromText,
	makeRulesFromDatabase,
	makeTargets,
	flagWords,
	isOutputSync,
	makeMajorVersion,
	makeArgs,
	artisanCommands,
};
export type { ListedTask, JustConfirmMode, MakeRules, ArtisanMode };
