import { getConfigWithWorkspaceOverride, observeConfigWithWorkspaceOverride } from './config';
import { features } from './features';
import type { Feature } from './features';
import { createReloader, isWatchedFile } from './watch';
import { choices, projectChoices, resolveCommand } from './settings';
import { resetState as resetProcessState, stopAll } from './process';
import { resetState as resetNotifyState } from './notify';
import { createSidebar, disposeSidebar } from './sidebar';
import { forgetLatest } from './source';

const active = new Map<string, Array<Disposable>>();

/* Debounced reloads after file changes, per feature id */
const reloader = createReloader((id) => nova.workspace.reloadTasks(id));

const isAutoEnabled = (key: string): boolean => {
	const value = getConfigWithWorkspaceOverride(key);
	return value === null || value === undefined ? true : Boolean(value);
};

const enable = (feature: Feature) => {
	if (active.has(feature.key)) return;

	console.info(`Reading ${feature.name}...`);

	const assistant = nova.assistants.registerTaskAssistant(new feature.Parser(), {
		identifier: feature.id,
		name: feature.name,
	});
	nova.workspace.reloadTasks(feature.id);

	/* one failing watcher shouldn't stop the source, or the rest of the extension, from working */
	const watchers: Disposable[] = [];
	feature.globs.forEach((glob) => {
		try {
			watchers.push(
				nova.fs.watch(glob, (path) => {
					if (isWatchedFile(feature.files, path, nova.workspace.path)) reloader.schedule(feature.id);
				})
			);
		} catch (e) {
			console.error(`${feature.name}: couldn't watch "${glob}": ${e}`);
		}
	});

	active.set(feature.key, [assistant, ...watchers]);
};

const disable = (feature: Feature) => {
	const disposables = active.get(feature.key);
	if (!disposables) return;

	disposables.forEach((d) => d.dispose());
	active.delete(feature.key);
	reloader.cancel(feature.id);
	forgetLatest(feature.key);

	nova.workspace.reloadTasks(feature.id);
};

const toggle = (feature: Feature) => {
	if (isAutoEnabled(feature.key)) {
		enable(feature);
	} else {
		disable(feature);
	}
};

const deactivate = () => {
	console.info('Stopping Automatic Tasks');

	active.forEach((disposables) => disposables.forEach((d) => d.dispose()));
	active.clear();
	reloader.cancelAll();
	stopAll();
	disposeSidebar();
};

const activate = async () => {
	console.log(`Starting Automatic Tasks ${nova.extension.version}`);

	/* Commands first: Project Settings may already be open and asking for its choices (resolve) while the sources start */

	/* Refresh Tasks: forget install checks and shown notifications, then re-read every source */
	nova.subscriptions.add(
		nova.commands.register('taskfinder.refresh', () => {
			resetProcessState();
			resetNotifyState();
			features.forEach((feature) => {
				if (active.has(feature.key)) nova.workspace.reloadTasks(feature.id);
			});
		})
	);

	/* Project Settings pop-ups name the current preference: "Use Global Setting (On)" */
	Object.keys(choices).forEach((key) =>
		nova.subscriptions.add(nova.commands.register(resolveCommand(key), () => projectChoices(key, nova.config.get(key))))
	);

	/* the sidebar is optional: if it can't start, tasks still work from the Tasks menu */
	try {
		createSidebar().forEach((d) => nova.subscriptions.add(d));
	} catch (e) {
		console.error(`Sidebar: couldn't start: ${e}`);
	}

	/* each source starts independently, so one failure doesn't stop the others */
	features.forEach((feature) => {
		const safeToggle = () => {
			try {
				toggle(feature);
			} catch (e) {
				console.error(`${feature.name}: couldn't start: ${e}`);
			}
		};
		observeConfigWithWorkspaceOverride(feature.key, safeToggle).forEach((d) => nova.subscriptions.add(d));
		safeToggle();
	});

	/* listing settings are read on each provideTasks(), so a change just reloads the sources that use them */
	const listingSettings = [...new Set(features.flatMap((feature) => feature.settings ?? []))];
	listingSettings.forEach((key) =>
		observeConfigWithWorkspaceOverride(key, () =>
			features
				.filter((feature) => feature.settings?.includes(key) && active.has(feature.key))
				.forEach((feature) => nova.workspace.reloadTasks(feature.id))
		).forEach((d) => nova.subscriptions.add(d))
	);
};

export { activate, deactivate };
