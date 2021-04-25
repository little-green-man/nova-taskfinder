module.exports.ComposerTaskAssistant = class ComposerTaskAssistant {
  constructor() {
    this.packageProcessName = "composer";
    this.packageJsonPath = nova.workspace.path + "/composer.json";
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

        if (pack.hasOwnProperty("scripts")) {
          for (var key in pack.scripts) {
            if (pack.scripts.hasOwnProperty(key)) {
              // Add Task
              let task = new Task(key);

              task.setAction(
                Task.Run,
                new TaskProcessAction(this.packageProcessName, {
                  args: ["run", key],
                  shell: true,
                  cwd: nova.workspace.path,
                })
              );
              tasks.push(task);
              task = null;
            }
          }
        }
      } catch (e) {
        console.log(e);
      }
    }

    return tasks;
  }
};
