/**
 * Process helpers shared by the CLI-based parsers (Taskfile, Maid).
 */

interface RunResult {
	status: number;
	stdout: string;
	stderr: string;
}

/* Nova's output callbacks are line-based; rejoin lines so the output can be parsed as a whole. */
const join = (lines: string[]) => lines.map((line) => (line.endsWith('\n') ? line : `${line}\n`)).join('');

/**
 * Runs a command through the user's shell in the workspace root and collects its output.
 * Never rejects: failures come back as a non-zero status.
 */
function run(command: string, args: string[]): Promise<RunResult> {
	return new Promise((resolve) => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		try {
			const proc = new Process(command, {
				args,
				cwd: nova.workspace.path ?? undefined,
				shell: true,
			});
			proc.onStdout((line) => stdout.push(line));
			proc.onStderr((line) => stderr.push(line));
			proc.onDidExit((status) => resolve({ status, stdout: join(stdout), stderr: join(stderr) }));
			proc.start();
		} catch (e) {
			resolve({ status: -1, stdout: '', stderr: String(e) });
		}
	});
}

/** Parses JSON, returning null instead of throwing. */
function parseJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Whether any of the given filenames exists at the workspace root. */
function rootHasFile(files: string[]): boolean {
	const root = nova.workspace.path;
	if (!root) return false;

	return files.some((file) => nova.fs.stat(nova.path.join(root, file))?.isFile());
}

const logged = new Set<string>();

/** Logs a warning once per session, so repeated task reloads don't flood the console. */
function warnOnce(message: string) {
	if (logged.has(message)) return;
	logged.add(message);
	console.warn(message);
}

export { run, parseJson, rootHasFile, warnOnce };
