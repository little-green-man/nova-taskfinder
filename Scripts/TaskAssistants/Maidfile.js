module.exports.MaidFileTaskAssistant = class MaidFileTaskAssistant {
	constructor() {
		this.packageProcessName = 'maid';
		this.tasks = [];
	}

	async findTasks() {
		this.tasks = [];

		/*
		 * Maid entries prep
		 */
		try {
			const options = {
				args: ['json'],
				cwd: nova.workspace.path,
				shell: true,
			};

			let maidprocess = new Process('maid', options);

			maidprocess.onStdout((line) => {
				const tasks = Object.keys(JSON.parse(line).tasks);

				tasks.forEach((key) => {
					console.log(key);
					let task = new Task(key);

					if (key.includes('build') || key.includes('compile')) {
						task.setAction(
							Task.Build,
							new TaskProcessAction(this.packageProcessName, {
								args: [key],
								shell: true,
								cwd: nova.workspace.path,
							})
						);
						this.tasks.push(task);
						task = null;
					} else {
						task.setAction(
							Task.Run,
							new TaskProcessAction(this.packageProcessName, {
								args: [key],
								shell: true,
								cwd: nova.workspace.path,
							})
						);
						this.tasks.push(task);
						task = null;
					}
				});

				console.log(this.tasks);
			});

			maidprocess.onStderr((line) => {
				console.warn(`Maidfile extraction ERROR: ${line}`);
			});

			const onExit = new Promise((resolve, reject) => {
				maidprocess.onDidExit((status) => {
					console.log(`Exited MaidfileFinder with code ${status}`);
					const action = status == 0 ? resolve : reject;
					action(status);
				});
			});

			maidprocess.start();

			return onExit;
		} catch (e) {
			console.log(e);
		}
	}

	async provideTasks() {
		await this.findTasks();
		console.info(`Maidfile extraction found ${this.tasks.length} task(s)`);
		return this.tasks;
	}
};
