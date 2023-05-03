class Composer {
	packageProcessName: string;
	packageJsonPath: string;
	tasks: any[];

	constructor() {
		this.tasks = [];
		this.packageProcessName = 'composer';
		this.packageJsonPath = `${nova.workspace.path}/composer.json`;
	}

	findTasks() {
		const composerFile = nova.fs.stat(this.packageJsonPath);
		if (composerFile && composerFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				const json = JSON.parse(contents);
				if (json.hasOwnProperty('scripts')) {
					for (var key in json.scripts) {
						if (json.scripts.hasOwnProperty(key)) {
							const task = new Task(key);
							task.setAction(
								Task.Run,
								new TaskProcessAction(this.packageProcessName, {
									cwd: nova.workspace.path as string,
									args: ['run', key],
									shell: true,
								})
							);
							this.tasks.push(task);
						}
					}
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	provideTasks() {
		this.tasks = [];
		this.findTasks();
		console.info(`${this.packageJsonPath} has ${this.tasks.length} task(s)`);
		return this.tasks;
	}
}

export default Composer;
