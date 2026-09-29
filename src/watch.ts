/**
 * File-watching helpers. No Nova globals, so they can be unit-tested in Node.
 */

/**
 * Whether a changed path is one of a source's files, relative to the workspace root.
 * Entries may be nested (e.g. `routes/console.php`); anything else (e.g. node_modules) is ignored.
 * The watcher may pass relative or absolute paths.
 */
function isWatchedFile(files: string[], path: string, root: string | null | undefined): boolean {
	let relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
	relative = relative.replace(/^\.\//, '');
	return files.includes(relative);
}

/** Collapses bursts of changes (saves, branch switches) into one reload per id, `delay` ms after the last change. */
function createReloader(reload: (id: string) => void, delay = 300) {
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	const cancel = (id: string) => {
		const timer = timers.get(id);
		if (timer !== undefined) clearTimeout(timer);
		timers.delete(id);
	};

	const schedule = (id: string) => {
		cancel(id);
		timers.set(
			id,
			setTimeout(() => {
				timers.delete(id);
				reload(id);
			}, delay)
		);
	};

	const cancelAll = () => {
		timers.forEach((timer) => clearTimeout(timer));
		timers.clear();
	};

	return { schedule, cancel, cancelAll };
}

export { isWatchedFile, createReloader };
