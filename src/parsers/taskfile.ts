class Taskfile {
	packageProcessName: string = 'task';
	options: {
		args: string[];
		cwd: string;
		shell: true | string;
	};

	constructor() {
		this.options = {
			cwd: nova.workspace.path as string,
			args: ['--list-all'],
			shell: true,
		};
	}

	async provideTasks() {
		let tasks: Array<TaskProcessAction>;
		tasks = [];

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
							cwd: nova.workspace.path ?? undefined,
							args: [key],
							shell: true,
						})
					);
					tasks.push(task);
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
			await onExit;
			console.info(`taskfile has ${tasks.length} task(s)`);

			return tasks;
		} catch (e) {
			console.log(e);
			return [];
		}
	}
}

export default Taskfile;
