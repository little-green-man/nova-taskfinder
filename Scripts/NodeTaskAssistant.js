module.exports.NodeTaskAssistant = class NodeTaskAssistant {
  constructor() {
    this.packageManager = nova.workspace.config.get(
      "taskfinder.package-manager",
      "String"
    );

    this.packageProcessName =
      this.packageManager == "yarn"
        ? nova.workspace.config.get("taskfinder.yarn.path", "String")
        : nova.workspace.config.get("taskfinder.npm.path", "String");

    this.packageJsonPath = nova.workspace.path + "/package.json";

    this.statusUpdate();
  }

  provideTasks() {
    this.statusUpdate();

    let tasks = [];
    
    let nodeFile = nova.fs.stat(this.packageJsonPath);

    /*
     * package.json
     */
    if (nodeFile && nodeFile.isFile()) {
      try {
        let pack = JSON.parse(nova.fs.open(this.packageJsonPath).read());

        if (pack.hasOwnProperty("scripts")) {
          for (var key in pack.scripts) {
            if (pack.scripts.hasOwnProperty(key)) {
              // Add Task
              let task = new Task(key);
              let args = [];

              switch (this.packageManager) {
                case "yarn":
                  args = [key];
                  break;
                default:
                  args = ["run", key];
              }

              task.setAction(
                Task.Run,
                new TaskProcessAction(this.packageProcessName, {
                  args: args,
                  // shell: true,
                })
              );

              console.log("Adding ", task.name);
              tasks.push(task);
              task = null;
              args = [];
            }
          }
        }
      } catch (e) {
        console.log(e);
      }
    }

    return tasks;
  }

  statusUpdate() {
    console.info(
      "NodeTaskAssistant settings: Using " +
        this.packageManager +
        "; at " +
        this.packageProcessName
    );
  }
};
