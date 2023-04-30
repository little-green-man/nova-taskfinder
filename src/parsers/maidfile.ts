class Maidfile {
	packageProcessName: string = 'maid';
	options: {
		args: string[];
		cwd: string;
		shell: true | string;
	};

	constructor() {
		this.options = {
			cwd: nova.workspace.path as string,
			args: ['butler', 'json'],
			shell: true,
		};
	}

	async provideTasks() {
		let tasks: Array<TaskProcessAction>;
		tasks = [];

		try {
			const maid = new Process('maid', this.options);
			maid.onStdout((line) => {
				const json = JSON.parse(line).tasks;
				const keys = Object.keys(JSON.parse(line).tasks);
				keys.forEach((key) => {
					if (json[key].hide != true && !key.startsWith('_')) {
						let task = new Task(key);
						if (key.includes('build') || key.includes('compile')) {
							task.setAction(
								Task.Build,
								new TaskProcessAction(this.packageProcessName, {
									cwd: nova.workspace.path ?? undefined,
									args: [key],
									shell: true,
								})
							);
							tasks.push(task);
						} else {
							task.setAction(
								Task.Run,
								new TaskProcessAction(this.packageProcessName, {
									cwd: nova.workspace.path ?? undefined,
									args: [key],
									shell: true,
								})
							);
							tasks.push(task);
						}
					}
				});
			});

			maid.onStderr((line) => console.warn(`finder (maidfile) extraction error: ${line}`));
			const onExit = new Promise((resolve, reject) => {
				maid.onDidExit((status) => {
					console.log(`exited: finder (Maidfile) with code ${status}`);
					const action = status == 0 ? resolve : reject;
					action(status);
				});
			});

			maid.start();
			await onExit;
			console.info(`maidfile has ${tasks.length} task(s)`);

			return tasks;
		} catch (e) {
			console.log(e);
		}
	}
}

export default Maidfile;
