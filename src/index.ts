import { getConfigWithWorkspaceOverride, observeConfigWithWorkspaceOverride } from './config';
import { ComposerParser, PackageJsonParser, TaskfileParser, MaidfileParser, taskfileFiles, maidfileFiles } from './parsers';

interface Feature {
	key: string;
	Parser: any;
	name: string;
	glob: string;
	files: Array<string>;
	id: string;
}

const features: Array<Feature> = [
	{
		key: 'taskfinder.auto-node',
		Parser: PackageJsonParser,
		name: 'package.json',
		glob: '*package.json',
		files: ['package.json'],
		id: 'taskfinder-tasks-node',
	},
	{
		key: 'taskfinder.auto-composer',
		Parser: ComposerParser,
		name: 'composer.json',
		glob: '*composer.json',
		files: ['composer.json'],
		id: 'taskfinder-tasks-composer',
	},
	{
		key: 'taskfinder.auto-taskfile',
		Parser: TaskfileParser,
		name: 'Taskfile',
		glob: '*askfile*',
		files: taskfileFiles,
		id: 'taskfinder-tasks-taskfile',
	},
	{
		key: 'taskfinder.auto-maidfile',
		Parser: MaidfileParser,
		name: 'Maidfile',
		glob: '*aidfile*',
		files: maidfileFiles,
		id: 'taskfinder-tasks-maidfile',
	},
];

const active = new Map<string, Array<Disposable>>();

/* Pending debounced reloads, per feature id */
const reloadTimers = new Map<string, number>();
const RELOAD_DELAY = 300;

/* Collapse bursts of file changes (saves, branch switches) into one reload */
const scheduleReload = (id: string) => {
	cancelReload(id);
	reloadTimers.set(
		id,
		setTimeout(() => {
			reloadTimers.delete(id);
			nova.workspace.reloadTasks(id);
		}, RELOAD_DELAY)
	);
};

const cancelReload = (id: string) => {
	const timer = reloadTimers.get(id);
	if (timer !== undefined) clearTimeout(timer);
	reloadTimers.delete(id);
};

const isAutoEnabled = (key: string): boolean => {
	const value = getConfigWithWorkspaceOverride(key);
	return value === null || value === undefined ? true : Boolean(value);
};

/* Only root-level project files are read, so ignore changes elsewhere (e.g. node_modules). The watcher may pass relative or absolute paths. */
const isRootFile = (feature: Feature, path: string): boolean => {
	const root = nova.workspace.path;
	let relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
	relative = relative.replace(/^\.\//, '');
	return feature.files.includes(relative);
};

const enable = (feature: Feature) => {
	if (active.has(feature.key)) return;

	console.info(`Reading ${feature.name}...`);

	const assistant = nova.assistants.registerTaskAssistant(new feature.Parser(), {
		identifier: feature.id,
		name: feature.name,
	});
	nova.workspace.reloadTasks(feature.id);

	const watcher = nova.fs.watch(feature.glob, (path) => {
		if (isRootFile(feature, path)) scheduleReload(feature.id);
	});

	active.set(feature.key, [assistant, watcher]);
};

const disable = (feature: Feature) => {
	const disposables = active.get(feature.key);
	if (!disposables) return;

	disposables.forEach((d) => d.dispose());
	active.delete(feature.key);
	cancelReload(feature.id);

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
	console.info('Deactivating TaskFinder');

	active.forEach((disposables) => disposables.forEach((d) => d.dispose()));
	active.clear();
	reloadTimers.forEach((timer) => clearTimeout(timer));
	reloadTimers.clear();
};

const activate = async () => {
	console.log(`Starting TaskFinder (nova v${nova.extension.version})`);

	features.forEach((feature) => {
		const disposables = observeConfigWithWorkspaceOverride(feature.key, () => toggle(feature));
		disposables.forEach((d) => nova.subscriptions.add(d));

		toggle(feature);
	});

	/* package manager changes re-register the node assistant */
	observeConfigWithWorkspaceOverride('taskfinder.package-manager', () => {
		const feature = features.find((f) => f.id === 'taskfinder-tasks-node');
		if (!feature || !active.has(feature.key)) return;

		disable(feature);
		enable(feature);
	}).forEach((d) => nova.subscriptions.add(d));

	/* the lifecycle setting is read on each provideTasks(), so a reload is enough */
	observeConfigWithWorkspaceOverride('taskfinder.show-lifecycle-scripts', () => {
		['taskfinder-tasks-node', 'taskfinder-tasks-composer'].forEach((id) => {
			if (features.some((f) => f.id === id && active.has(f.key))) nova.workspace.reloadTasks(id);
		});
	}).forEach((d) => nova.subscriptions.add(d));
};

export { activate, deactivate };
