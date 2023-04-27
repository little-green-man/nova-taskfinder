class NodeTaskAssistant {
	tasks: any[];
	packageManager: string;
	packageJsonPath: string;

	constructor() {
		this.tasks = [];
		this.packageManager = nova.workspace.config.get('taskfinder.package-manager', 'String') as string;
		this.packageJsonPath = `${nova.workspace.path}/package.json`;
	}

	findTasks() {
		const nodeFile = nova.fs.stat(this.packageJsonPath);
		if (nodeFile && nodeFile.isFile()) {
			try {
				const contents = nova.fs.open(this.packageJsonPath).read() as string;
				const json = JSON.parse(contents);
				if (json.hasOwnProperty('scripts')) {
					for (var key in json.scripts) {
						if (json.scripts.hasOwnProperty(key)) {
							let args = [];
							const task = new Task(key);
							switch (this.packageManager) {
								case 'yarn':
									args = [key];
									break;
								default:
									args = ['run', key];
							}
							task.setAction(
								Task.Run,
								new TaskProcessAction(this.packageManager, {
									shell: true,
									args: args,
								})
							);
							this.tasks.push(task);
							args = [];
						}
					}
				}
			} catch (e) {
				console.log(e);
			}
		}
	}

	provideTasks() {
		this.statusUpdate();
		this.findTasks();
		console.info(`${this.packageJsonPath} has ${this.tasks.length} task(s)`);
		return this.tasks;
	}

	statusUpdate = () => console.info(`Node settings: Using ${this.packageManager}`);
}

export default NodeTaskAssistant;
