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
			
			let words = vsTask.command.split(' ');
			let command = words.shift();
			let args = words.join(' ');
			let action = new TaskProcessAction(command, {
				args: [args],
				shell: true,
				cwd: nova.workspace.path
			});
			
			if (vsTask.group == "build" || vsTask.group.kind == "build") {
				task.setAction(Task.Build, action)				
			} else {
				task.setAction(Task.Run, action)
			}
		
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
