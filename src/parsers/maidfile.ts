class Maidfile {
	tasks: any[];
	packageProcessName: string;
	options: {
		args: string[];
		cwd: string;
		shell: boolean;
	};

	constructor() {
		this.tasks = [];
		this.packageProcessName = 'maid';
		this.options = {
			cwd: nova.workspace.path as string,
			args: ['butler', 'json'],
			shell: true,
		};
	}

	async findTasks() {
		try {
			const maid = new Process('maid', this.options);
			maid.onStdout((line) => {
				this.tasks = [];

				const tasks = JSON.parse(line).tasks;
				const keys = Object.keys(JSON.parse(line).tasks);
				keys.forEach((key) => {
					if (tasks[key].hide != true && !key.startsWith('_')) {
						let task = new Task(key);
						if (key.includes('build') || key.includes('compile')) {
							task.setAction(
								Task.Build,
								new TaskProcessAction(this.packageProcessName, {
									cwd: nova.workspace.path,
									args: [key],
									shell: true,
								})
							);
							this.tasks.push(task);
						} else {
							task.setAction(
								Task.Run,
								new TaskProcessAction(this.packageProcessName, {
									cwd: nova.workspace.path,
									args: [key],
									shell: true,
								})
							);
							this.tasks.push(task);
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
			return onExit;
		} catch (e) {
			console.log(e);
		}
	}

	async provideTasks() {
		await this.findTasks();
		console.info(`maidfile has ${this.tasks.length} task(s)`);
		return this.tasks;
	}
}

export default Maidfile;
