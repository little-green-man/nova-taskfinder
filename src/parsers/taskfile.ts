class Taskfile {
	tasks: any[];
	packageProcessName: string;
	options: {
		args: string[];
		cwd: string;
		shell: boolean;
	};

	constructor() {
		this.packageProcessName = 'task';
		this.tasks = [];
		this.options = {
			cwd: nova.workspace.path as string,
			args: ['--list-all'],
			shell: true,
		};
	}

	async findTasks() {
		try {
			const taskfile = new Process('task', this.options);
			taskfile.onStdout((line) => {
				const regex = /\* ([A-Za-z0-9-_]+)\:/;
				const match = line.match(regex);
				if (match) {
					const key = match[1];
					const task = new Task(key);
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
			});

			taskfile.onStderr((line) => console.warn(`finder (taskfile) extraction error: ${line}`));
			const onExit = new Promise((resolve, reject) => {
				taskfile.onDidExit((status) => {
					console.log(`exited: finder (taskfile) with code ${status}`);
					const action = status == 0 ? resolve : reject;
					action(status);
				});
			});

			taskfile.start();
			return onExit;
		} catch (e) {
			console.log(e);
		}
	}

	async provideTasks() {
		await this.findTasks();
		console.info(`taskfile has ${this.tasks.length} task(s)`);
		return this.tasks;
	}
}

export default Taskfile;
