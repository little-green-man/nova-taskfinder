module.exports.VSCodeTaskAssistant = class VSCodeTaskAssistant {
  constructor() {
	this.packageProcessName = "code";
	this.packageJsonPath = nova.workspace.path + "/.vscode/tasks.json";
  }

  provideTasks() {
	let tasks = [];
	let tasksFile = nova.fs.stat(this.packageJsonPath);

	/*
	 * tasks.json
	 */
	if (tasksFile && tasksFile.isFile()) {
	  try {
		const commentRegex = /^( *\/\/.*\n)/gm;
		const trailingCommaRegex = /\,(?!\s*?[\{\[\"\'\w])/gm;
		let fileContents = nova.fs.open(this.packageJsonPath).read().replace(commentRegex, "").replace(trailingCommaRegex, "");
		let pack = JSON.parse(fileContents);
		
		pack.tasks.forEach((vsTask) => {
			if (vsTask.command === undefined) { return }
			
			let task = new Task(vsTask.label)
			
			let args = vsTask.command.split(' ');
			let command = args.shift();
			
			let cwd = nova.workspace.path
			
			task.setAction(
				vsTask.group == "build" || vsTask.group.kind == "build" ? Task.Build : Task.Run, 
				new TaskProcessAction(command, {
					args: args,
					shell: true,
					cwd: cwd
				})
			);
		
			tasks.push(task)
		})
	  } catch (e) {
		console.info("error");
		console.log(e);
	  }
	}

	return tasks;
  }
};
