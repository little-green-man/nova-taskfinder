/**
 * Pure rules for interpreting CLI results (Taskfile, Maid). No Nova globals or imports, so it can be unit-tested in Node.
 */

interface CommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

type Diagnosis<T> = { kind: 'ok'; value: T } | { kind: 'old-version' } | { kind: 'wrong-tool' } | { kind: 'error'; detail: string };

const parse = (text: string): any => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

/** A short, readable error from a tool's stderr: the first non-empty line (plus the next when it ends with a colon), without `error:`/`task:` prefixes. */
function errorDetail(stderr: string, fallback: string): string {
	const lines = stderr
		.split('\n')
		.map((line) => line.trim().replace(/^(error|task):\s*/i, ''))
		.filter((line) => line !== '');
	const detail = lines.length > 1 && lines[0].endsWith(':') ? `${lines[0]} ${lines[1]}` : (lines[0] ?? '');
	return detail === '' ? fallback : detail.length > 300 ? `${detail.slice(0, 299)}…` : detail;
}

/** Interprets `task --list-all --json`. Task before v3.19.1 doesn't know `--json`. */
function diagnoseTaskfile(result: CommandResult): Diagnosis<Array<{ name?: unknown }>> {
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
	for (const result of results) {
		const json = parse(result.stdout);
		if (json && typeof json.tasks === 'object' && json.tasks !== null) return { kind: 'ok', value: json };
	}

	if (results.some((result) => result.status === 0)) return { kind: 'wrong-tool' };
	return { kind: 'error', detail: errorDetail(results[0]?.stderr ?? '', 'maid failed to read the maidfile') };
}

export { errorDetail, diagnoseTaskfile, diagnoseMaid };
export type { CommandResult, Diagnosis };
