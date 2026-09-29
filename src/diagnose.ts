/**
 * Pure rules for interpreting CLI results (Taskfile, Maid). No Nova globals or imports, so it can be unit-tested in Node.
 */

interface CommandResult {
	status: number;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
}

type Diagnosis<T> = { kind: 'ok'; value: T } | { kind: 'old-version' } | { kind: 'wrong-tool' } | { kind: 'timeout' } | { kind: 'error'; detail: string };

/**
 * Parses JSON printed by a tool. Nova delivers output line by line, and a very long line (a real Laravel app prints ~300 KB
 * on one line) can arrive in pieces that run() rejoins with newlines. Valid JSON never has a raw line break inside a string,
 * so removing them all is safe whichever way the output was split.
 */
const parse = (text: string): any => {
	try {
		return JSON.parse(text.replace(/\r?\n/g, ''));
	} catch {
		return null;
	}
};

/**
 * A short, readable error from a tool's output: the first non-empty line, without `error:`/`task:`/`make:` prefixes.
 * The next line is added when the first ends with a colon (Task) or is a bare heading such as an exception name (Laravel).
 */
function errorDetail(stderr: string, fallback: string): string {
	const lines = stderr
		.split('\n')
		.map((line) => line.trim().replace(/^(error|task|make):\s*/i, ''))
		.filter((line) => line !== '');
	const heading = lines.length > 1 && (lines[0].endsWith(':') || !lines[0].includes(' '));
	const detail = heading ? `${lines[0]} ${lines[1]}` : (lines[0] ?? '');
	return detail === '' ? fallback : detail.length > 300 ? `${detail.slice(0, 299)}…` : detail;
}

/** Interprets `task --list-all --json`. Task before v3.19.1 doesn't know `--json`. */
function diagnoseTaskfile(result: CommandResult): Diagnosis<Array<{ name?: unknown }>> {
	if (result.timedOut) return { kind: 'timeout' };
	const json = result.status === 0 ? parse(result.stdout) : null;
	if (Array.isArray(json?.tasks)) return { kind: 'ok', value: json.tasks };

	if (/unknown flag: --json|flag provided but not defined: -json/.test(result.stderr)) return { kind: 'old-version' };
	return { kind: 'error', detail: errorDetail(result.stderr, `task exited with status ${result.status}`) };
}

/**
 * Interprets the attempts to list a Maidfile (`maid --system json`, then `maid butler json`).
 * npm's unrelated `maid` exits 0 with non-JSON output; theMackabu/maid exits non-zero with a message for a broken maidfile.
 */
function diagnoseMaid(results: CommandResult[]): Diagnosis<{ tasks: Record<string, any> }> {
	if (results.some((result) => result.timedOut)) return { kind: 'timeout' };
	for (const result of results) {
		const json = parse(result.stdout);
		if (json && typeof json.tasks === 'object' && json.tasks !== null) return { kind: 'ok', value: json };
	}

	if (results.some((result) => result.status === 0)) return { kind: 'wrong-tool' };
	return { kind: 'error', detail: errorDetail(results[0]?.stderr ?? '', 'maid failed to read the maidfile') };
}

/** Interprets `just --dump --dump-format json`. just before 1.15 didn't have a stable JSON dump. */
function diagnoseJust(result: CommandResult): Diagnosis<any> {
	if (result.timedOut) return { kind: 'timeout' };
	const json = result.status === 0 ? parse(result.stdout) : null;
	if (json && typeof json.recipes === 'object' && json.recipes !== null) return { kind: 'ok', value: json };

	if (/dump-format|--unstable|unstable/i.test(result.stderr)) return { kind: 'old-version' };
	return { kind: 'error', detail: errorDetail(result.stderr, `just exited with status ${result.status}`) };
}

/* The `:` goal used to stop make building anything always fails like this; it isn't an error in the Makefile */
const noRuleForColon = /No rule to make target [`'"]:['"]/;

/** Interprets `make -pRrq -f <file> :`. It always exits non-zero, so errors are `***` lines other than the `:` goal's. */
function diagnoseMake(result: CommandResult): Diagnosis<string> {
	if (result.timedOut) return { kind: 'timeout' };
	const errors = result.stderr.split('\n').filter((line) => line.includes('*** ') && !noRuleForColon.test(line));
	if (errors.length > 0) return { kind: 'error', detail: errorDetail(errors.join('\n'), 'make failed to read the Makefile') };
	return { kind: 'ok', value: result.stdout };
}

/** Interprets `php artisan list --format=json`. Laravel prints errors to stdout, so fall back to it. */
function diagnoseArtisan(result: CommandResult): Diagnosis<any> {
	if (result.timedOut) return { kind: 'timeout' };
	const json = result.status === 0 ? parse(result.stdout) : null;
	if (Array.isArray(json?.commands)) return { kind: 'ok', value: json };
	return { kind: 'error', detail: errorDetail(result.stderr.trim() ? result.stderr : result.stdout, `artisan exited with status ${result.status}`) };
}

/** A project file and line from a Laravel error (`at routes/console.php:9`), ignoring vendor files. */
function artisanErrorLocation(output: string): { file: string; line: number } | null {
	const match = output.match(/\bat ((?!vendor\/)[^\s:]+\.php):(\d+)/);
	return match ? { file: match[1], line: Number(match[2]) } : null;
}

export { errorDetail, diagnoseTaskfile, diagnoseMaid, diagnoseJust, diagnoseMake, diagnoseArtisan, artisanErrorLocation };
export type { CommandResult, Diagnosis };
