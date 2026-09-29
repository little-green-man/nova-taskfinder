import { getConfigWithWorkspaceOverride, observeConfigWithWorkspaceOverride } from './config';
import {
	ComposerParser,
	PackageJsonParser,
	TaskfileParser,
	MaidfileParser,
	JustParser,
	DenoParser,
	MakeParser,
	ArtisanParser,
	taskfileFiles,
	maidfileFiles,
	justFiles,
	denoFiles,
	makeFiles,
	artisanFiles,
} from './parsers';
import { packageManagerFiles } from './scripts';
import { createReloader, isWatchedFile } from './watch';
import { choices, projectChoices, resolveCommand } from './settings';
import { resetState as resetProcessState, stopAll } from './process';
import { resetState as resetNotifyState } from './notify';

interface Feature {
	key: string;
	Parser: any;
	name: string;
	globs: Array<string>;
	files: Array<string>;
	id: string;
}

const features: Array<Feature> = [
	{
		key: 'taskfinder.auto-node',
		Parser: PackageJsonParser,
		name: 'package.json',
		/* lockfiles and package manager config change which package manager runs the scripts */
		globs: ['*package.json', '*.lock', '*.lockb', '*lock.yaml', '*-lock.json', '*shrinkwrap.json', '*.yarnrc.yml', '*.npmrc', '*pnpm-workspace.yaml'],
		files: ['package.json', ...packageManagerFiles],
		id: 'taskfinder-tasks-node',
	},
	{
		key: 'taskfinder.auto-composer',
		Parser: ComposerParser,
		name: 'composer.json',
		globs: ['*composer.json'],
		files: ['composer.json'],
		id: 'taskfinder-tasks-composer',
	},
	{
		key: 'taskfinder.auto-taskfile',
		Parser: TaskfileParser,
		name: 'Taskfile',
		globs: ['*askfile*'],
		files: taskfileFiles,
		id: 'taskfinder-tasks-taskfile',
	},
	{
		key: 'taskfinder.auto-maidfile',
		Parser: MaidfileParser,
		name: 'Maidfile',
		globs: ['*aidfile*'],
		files: maidfileFiles,
		id: 'taskfinder-tasks-maidfile',
	},
	{
		key: 'taskfinder.auto-just',
		Parser: JustParser,
		name: 'justfile',
		globs: ['*ustfile', '*USTFILE'],
		files: justFiles,
		id: 'taskfinder-tasks-just',
	},
	{
		key: 'taskfinder.auto-deno',
		Parser: DenoParser,
		name: 'deno.json',
		globs: ['*deno.json*'],
		files: denoFiles,
		id: 'taskfinder-tasks-deno',
	},
	{
		key: 'taskfinder.auto-make',
		Parser: MakeParser,
		name: 'Makefile',
		/* makeFiles also gains the Makefile's literal includes; only *.mk includes are watched */
		globs: ['*akefile', '*.mk'],
		files: makeFiles,
		id: 'taskfinder-tasks-make',
	},
	{
		key: 'taskfinder.auto-artisan',
		Parser: ArtisanParser,
		name: 'artisan',
		globs: ['*artisan', '*console.php', '*composer.lock'],
		files: artisanFiles,
		id: 'taskfinder-tasks-artisan',
	},
];

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
	reloader.cancelAll();
	stopAll();
};

const activate = async () => {
	console.log(`Starting TaskFinder (nova v${nova.extension.version})`);

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

	/* these settings are read on each provideTasks(), so a reload is enough */
	const reloadIfActive = (ids: string[]) =>
		ids.forEach((id) => {
			if (features.some((f) => f.id === id && active.has(f.key))) nova.workspace.reloadTasks(id);
		});

	observeConfigWithWorkspaceOverride('taskfinder.package-manager', () => reloadIfActive(['taskfinder-tasks-node'])).forEach((d) =>
		nova.subscriptions.add(d)
	);
	observeConfigWithWorkspaceOverride('taskfinder.show-lifecycle-scripts', () =>
		reloadIfActive(['taskfinder-tasks-node', 'taskfinder-tasks-composer'])
	).forEach((d) => nova.subscriptions.add(d));
	(
		[
			['taskfinder.just-confirm-recipes', 'taskfinder-tasks-just'],
			['taskfinder.make-listing', 'taskfinder-tasks-make'],
			['taskfinder.artisan-commands', 'taskfinder-tasks-artisan'],
		] as const
	).forEach(([key, id]) => observeConfigWithWorkspaceOverride(key, () => reloadIfActive([id])).forEach((d) => nova.subscriptions.add(d)));
};

export { activate, deactivate };
