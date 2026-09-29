import { getConfigWithWorkspaceOverride, observeConfigWithWorkspaceOverride } from './config';
import { ComposerParser, PackageJsonParser, TaskfileParser, MaidfileParser } from './parsers';

interface Feature {
	key: string;
	Parser: any;
	name: string;
	glob: string;
	id: string;
}

const features: Array<Feature> = [
	{
		key: 'taskfinder.auto-node',
		Parser: PackageJsonParser,
		name: 'package.json',
		glob: '*package.json',
		id: 'taskfinder-tasks-node',
	},
	{
		key: 'taskfinder.auto-composer',
		Parser: ComposerParser,
		name: 'composer.json',
		glob: '*composer.json',
		id: 'taskfinder-tasks-composer',
	},
	{
		key: 'taskfinder.auto-taskfile',
		Parser: TaskfileParser,
		name: 'Taskfile',
		glob: '*Taskfile.*',
		id: 'taskfinder-tasks-taskfile',
	},
	{
		key: 'taskfinder.auto-maidfile',
		Parser: MaidfileParser,
		name: 'Maidfile',
		glob: '*maidfile*',
		id: 'taskfinder-tasks-maidfile',
	},
];

const active = new Map<string, Array<Disposable>>();

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

	const watcher = nova.fs.watch(feature.glob, () => nova.workspace.reloadTasks(feature.id));

	active.set(feature.key, [assistant, watcher]);
};

const disable = (feature: Feature) => {
	const disposables = active.get(feature.key);
	if (!disposables) return;

	disposables.forEach((d) => d.dispose());
	active.delete(feature.key);

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
};

export { activate, deactivate };
