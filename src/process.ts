/**
 * Process and file helpers shared by the parsers.
 */

interface RunResult {
	status: number;
	stdout: string;
	stderr: string;
	/** Set when the command was stopped for taking too long */
	timedOut?: boolean;
}

/** How long a listing command may run before it's stopped */
const LIST_TIMEOUT = 15000;
/** After terminate(), how long to wait before kill() */
const KILL_DELAY = 2000;

/* Nova's output callbacks are line-based; rejoin lines so the output can be parsed as a whole. */
const join = (lines: string[]) => lines.map((line) => (line.endsWith('\n') ? line : `${line}\n`)).join('');

/* Listing processes still running, so deactivate() can stop them */
const running = new Set<Process>();

/**
 * Runs a command through the user's shell in the workspace root and collects its output.
 * Never rejects: failures come back as a non-zero status. A command still running after `timeout` ms is terminated
 * (then killed if it ignores that) and resolves with `timedOut: true`, so a hung tool can't stop a source listing forever.
 */
function run(command: string, args: string[], { timeout = LIST_TIMEOUT } = {}): Promise<RunResult> {
	return new Promise((resolve) => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		let proc: Process | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let timedOut = false;
		let done = false;

		const finish = (status: number, error?: string) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			clearTimeout(killTimer);
			if (proc) running.delete(proc);
			resolve({ status, stdout: join(stdout), stderr: error ?? join(stderr), ...(timedOut ? { timedOut } : {}) });
		};

		try {
			proc = new Process(command, {
				args,
				cwd: nova.workspace.path ?? undefined,
				shell: true,
			});
			proc.onStdout((line) => stdout.push(line));
			proc.onStderr((line) => stderr.push(line));
			proc.onDidExit((status) => finish(status));
			proc.start();
			running.add(proc);

			timer = setTimeout(() => {
				timedOut = true;
				stop(proc, 'terminate');
				killTimer = setTimeout(() => {
					stop(proc, 'kill');
					finish(-1);
				}, KILL_DELAY);
			}, timeout);
		} catch (e) {
			finish(-1, String(e));
		}
	});
}

const stop = (proc: Process | undefined, how: 'terminate' | 'kill') => {
	try {
		proc?.[how]();
	} catch (e) {
		console.error(`Couldn't ${how} ${proc?.command}: ${e}`);
	}
};

/** Stops every listing process still running (on deactivate). */
function stopAll() {
	running.forEach((proc) => stop(proc, 'terminate'));
	running.clear();
}

/**
 * Whether a file exists. Nova's stat() returns null for a missing file; treat a throw (e.g. when the extension
 * has run out of file handles) as missing too, so one failing check doesn't stop a source.
 */
function fileExists(path: string): boolean {
	try {
		return nova.fs.stat(path)?.isFile() ?? false;
	} catch {
		return false;
	}
}

/**
 * Reads a text file and always closes it. Unclosed handles from nova.fs.open() pile up across reloads and windows until
 * every file operation fails (NSCocoaErrorDomain 256/512), so never call nova.fs.open() without closing.
 */
function readTextFile(path: string): string {
	const file = nova.fs.open(path);
	try {
		return file.read() as string;
	} finally {
		file.close();
	}
}

let listdirFailed = false;

/**
 * The first of the given filenames that exists at the workspace root.
 * Matched by exact name via listdir(): macOS file systems usually ignore case, so stat() alone would report `makefile` for a `Makefile`.
 * If listdir() fails, fall back to stat(), which reports the name as listed here; list the most common spelling first.
 */
function firstRootFile(files: string[]): string | undefined {
	const root = nova.workspace.path;
	if (!root) return undefined;

	const exists = (file: string) => fileExists(nova.path.join(root, file));

	let names: string[] | undefined;
	try {
		names = nova.fs.listdir(root);
	} catch (e) {
		if (!listdirFailed) console.info(`Couldn't list the project folder (${e}); matching root files without checking their case.`);
		listdirFailed = true;
	}
	return files.find((file) => (names ? names.includes(file) : true) && exists(file));
}

const installed = new Map<string, Promise<boolean>>();

/** Whether a command is on the user's PATH. Checked once per window (`command -v`, 5 s limit), then cached. */
function isInstalled(command: string): Promise<boolean> {
	/* a check that times out counts as installed: the listing that follows reports its own problem, rather than a false "isn't installed" */
	if (!installed.has(command)) installed.set(command, run('command', ['-v', command], { timeout: 5000 }).then(({ status, timedOut }) => timedOut === true || status === 0));
	return installed.get(command) as Promise<boolean>;
}

/** Forgets install checks (Refresh Tasks, and between unit tests). */
const resetState = () => {
	installed.clear();
	listdirFailed = false;
};

export { run, stopAll, fileExists, readTextFile, firstRootFile, isInstalled, resetState, LIST_TIMEOUT };
