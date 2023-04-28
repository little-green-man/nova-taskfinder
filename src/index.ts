import { ComposerParser, PackageJsonParser, TaskfileParser, MaidfileParser } from './parsers';

const deactivate = () => console.info('Deactivating TaskFinder');
const activate = async () => {
	console.log(`Starting TaskFinder (nova v${nova.extension.version})`);

	/* package.json */
	if (nova.workspace.config.get('taskfinder.auto-node', 'boolean')) {
		console.info('Reading package.json...');

		const nodeTask = nova.assistants.registerTaskAssistant(new PackageJsonParser(), {
			identifier: 'taskfinder-tasks-node',
			name: 'package.json',
		});
		const watcher = nova.fs.watch('*package.json', () => nova.workspace.reloadTasks('taskfinder-tasks-node'));

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(nodeTask);
	}

	/* composer.json */
	if (nova.workspace.config.get('taskfinder.auto-composer', 'boolean')) {
		console.info('Reading composer.json...');

		const composerTask = nova.assistants.registerTaskAssistant(new ComposerParser(), {
			identifier: 'taskfinder-tasks-composer',
			name: 'composer.json',
		});
		const watcher = nova.fs.watch('*composer.json', () => nova.workspace.reloadTasks('taskfinder-tasks-composer'));

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(composerTask);
	}

	/* Taskfile.* */
	if (nova.workspace.config.get('taskfinder.auto-taskfile', 'boolean')) {
		console.info('Reading Taskfile.*...');

		const taskfileTask = nova.assistants.registerTaskAssistant(new TaskfileParser(), {
			identifier: 'taskfinder-tasks-taskfile',
			name: 'Taskfile',
		});
		const watcher = nova.fs.watch('*Taskfile.*', () => nova.workspace.reloadTasks('taskfinder-tasks-taskfile'));

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(taskfileTask);
	}

	/* maidfile(.*) */
	if (nova.workspace.config.get('taskfinder.auto-maidfile', 'boolean')) {
		console.info('Reading maidfile(.*)...');

		const maidfileTask = nova.assistants.registerTaskAssistant(new MaidfileParser(), {
			identifier: 'taskfinder-tasks-maidfile',
			name: 'Maidfile',
		});
		const extensionWatcher = nova.fs.watch('*maidfile.*', () => nova.workspace.reloadTasks('taskfinder-tasks-maidfile'));
		const watcher = nova.fs.watch('*maidfile', () => nova.workspace.reloadTasks('taskfinder-tasks-maidfile'));

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(extensionWatcher);
		nova.subscriptions.add(maidfileTask);
	}
};

export { activate, deactivate };
