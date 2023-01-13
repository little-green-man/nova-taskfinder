module.exports.ComposerTaskAssistant = class VSCodeTaskAssistant {
  constructor() {
	this.packageProcessName = "code";
	this.packageJsonPath = nova.workspace.path + "/.vscode/tasks.json";
  }

  provideTasks() {
	let tasks = [];
	
	let composerFile = nova.fs.stat(this.packageJsonPath);

	/*
	 * composer.json
	 */
	if (composerFile && composerFile.isFile()) {
	  try {
		let pack = JSON.parse(nova.fs.open(this.packageJsonPath).read());
		console.log(pack);
// 		if (pack.hasOwnProperty("tasks")) {
// 		  for (var vsTask in pack.tasks) {
// 			if (pack.scripts.hasOwnProperty(vsTask)) {
// 			  // Add Task
// 			  let task = new Task(vsTask);
// 
// 			  task.setAction(
// 				Task.Run,
// 				new TaskProcessAction(this.packageProcessName, {
// 				  args: [],
// 				  shell: true,
// 				  cwd: nova.workspace.path,
// 				})
// 			  );
// 			  tasks.push(task);
// 			  task = null;
// 			}
// 		  }
// 		}
	  } catch (e) {
		console.log(e);
	  }
	}

	return tasks;
  }
};
