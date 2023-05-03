import { ComposerParser, PackageJsonParser, TaskfileParser, MaidfileParser } from './parsers';

const deactivate = () => console.info('Deactivating TaskFinder');

const activate = async () => {
	console.log(`Starting TaskFinder (nova v${nova.extension.version})`);

	/* package.json */
	if (nova.workspace.config.get('taskfinder.auto-node', 'boolean')) {
		console.info('Reading package.json...');

		const watcher = nova.fs.watch('*package.json', () => nova.workspace.reloadTasks('taskfinder-tasks-node'));
		const nodeTask = nova.assistants.registerTaskAssistant(new PackageJsonParser(), {
			identifier: 'taskfinder-tasks-node',
			name: 'package.json',
		});

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(nodeTask);
	}

	/* composer.json */
	if (nova.workspace.config.get('taskfinder.auto-composer', 'boolean')) {
		console.info('Reading composer.json...');

		const watcher = nova.fs.watch('*composer.json', () => nova.workspace.reloadTasks('taskfinder-tasks-composer'));
		const composerTask = nova.assistants.registerTaskAssistant(new ComposerParser(), {
			identifier: 'taskfinder-tasks-composer',
			name: 'composer.json',
		});

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(composerTask);
	}

	/* Taskfile.* */
	if (nova.workspace.config.get('taskfinder.auto-taskfile', 'boolean')) {
		console.info('Reading Taskfile.*...');

		const watcher = nova.fs.watch('*Taskfile.*', () => nova.workspace.reloadTasks('taskfinder-tasks-taskfile'));
		const taskfileTask = nova.assistants.registerTaskAssistant(new TaskfileParser(), {
			identifier: 'taskfinder-tasks-taskfile',
			name: 'Taskfile',
		});

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(taskfileTask);
	}

	/* maidfile(.*) */
	if (nova.workspace.config.get('taskfinder.auto-maidfile', 'boolean')) {
		console.info('Reading maidfile(.*)...');

		const watcher = nova.fs.watch('*maidfile*', () => nova.workspace.reloadTasks('taskfinder-tasks-maidfile'));
		const maidfileTask = nova.assistants.registerTaskAssistant(new MaidfileParser(), {
			identifier: 'taskfinder-tasks-maidfile',
			name: 'Maidfile',
		});

		nova.subscriptions.add(watcher);
		nova.subscriptions.add(maidfileTask);
	}
};

export { activate, deactivate };
