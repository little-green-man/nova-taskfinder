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
function justRecipes(dump: any, confirm: JustConfirmMode): ListedTask[] {
	const tasks: ListedTask[] = [];

	const walk = (module: any) => {
		Object.values<any>(module?.recipes ?? {}).forEach((recipe) => {
			if (recipe.private) return;
			/* a parameter without a default needs an argument, unless it's `*` variadic (zero or more) */
			if ((recipe.parameters ?? []).some((p: any) => p.default === null && p.kind !== 'star')) return;

			const needsConfirm = (recipe.attributes ?? []).some((a: any) => a === 'confirm' || (typeof a === 'object' && a !== null && 'confirm' in a));
			if (needsConfirm && confirm === 'exclude') return;

			const name = recipe.namepath ?? recipe.name;
			tasks.push({ name, args: needsConfirm ? ['--yes', name] : [name] });
		});
		Object.values<any>(module?.modules ?? {}).forEach(walk);
	};

	walk(dump);
	return tasks;
}

/* Deno */

/**
 * Parses JSONC (as used by deno.json/deno.jsonc): `//` and `/* *\/` comments and trailing commas are allowed.
 * Comment markers inside strings are left alone. Throws like JSON.parse on invalid input.
 */
function parseJsonc(text: string): any {
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
function denoTasks(json: any): string[] {
	const tasks = json?.tasks;
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
function artisanCommands(json: any, mode: ArtisanMode): string[] {
	const commands: any[] = Array.isArray(json?.commands) ? json.commands : [];
	return commands
		.filter((command) => typeof command?.name === 'string' && !command.hidden && !artisanExcluded.has(command.name))
		.filter((command) => {
			/* PHP encodes "no arguments" as [] and arguments as { name: { is_required } } */
			const args = command.definition?.arguments;
			return !(args && !Array.isArray(args) && Object.values<any>(args).some((arg) => arg?.is_required));
		})
		.map((command) => command.name as string)
		.filter((name) => mode === 'all' || artisanCommon.has(name) || name.startsWith('app:'));
}

export { justRecipes, parseJsonc, denoTasks, makeRulesFromText, makeRulesFromDatabase, makeTargets, artisanCommands };
export type { ListedTask, JustConfirmMode, MakeRules, ArtisanMode };
