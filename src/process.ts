/**
 * Process and file helpers shared by the parsers.
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

/** The first of the given filenames that exists at the workspace root. */
function firstRootFile(files: string[]): string | undefined {
	const root = nova.workspace.path;
	if (!root) return undefined;

	return files.find((file) => nova.fs.stat(nova.path.join(root, file))?.isFile());
}

const installed = new Map<string, Promise<boolean>>();

/** Whether a command is on the user's PATH. Checked once per window (`command -v`), then cached. */
function isInstalled(command: string): Promise<boolean> {
	if (!installed.has(command)) installed.set(command, run('command', ['-v', command]).then(({ status }) => status === 0));
	return installed.get(command) as Promise<boolean>;
}

export { run, firstRootFile, isInstalled };
