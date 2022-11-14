const { NodeTaskAssistant } = require("./NodeTaskAssistant.js");
const { ComposerTaskAssistant } = require("./ComposerTaskAssistant.js");
const { TaskfileTaskAssistant } = require("./TaskfileTaskAssistant.js");

exports.activate = function () {
  // Do work when the extension is activated

  // Node
  if (nova.workspace.config.get("taskfinder.auto-node", "boolean")) {
    console.info("Initialising NodeTaskAssistant");
    nodeTaskAssistantDisposable = nova.assistants.registerTaskAssistant(
      new NodeTaskAssistant(),
      {
        name: "Node",
        identifier: "taskfinder-tasks-node",
      }
    );
    let nodeFileWatcher = nova.fs.watch("*package.json", (e) => {
      nova.workspace.reloadTasks();
    });
    nova.subscriptions.add(nodeFileWatcher);
    nova.subscriptions.add(nodeTaskAssistantDisposable);
  }


  // Composer
  if (nova.workspace.config.get("taskfinder.auto-composer", "boolean")) {
    console.info("Initialising ComposerTaskAssistant");
    composerTaskDisposable = nova.assistants.registerTaskAssistant(
      new ComposerTaskAssistant(),
      {
        name: "Composer",
        identifier: "taskfinder-tasks-composer",
      }
    );
    let composerFileWatcher = nova.fs.watch("*composer.json", (e) => {
      nova.workspace.reloadTasks();
    });
    nova.subscriptions.add(composerFileWatcher);
    nova.subscriptions.add(composerTaskDisposable);
  }
  
  
  // Taskfile
  if(nova.workspace.config.get("taskfinder.auto-taskfile", "boolean")) {
    console.info("Initialising TaskfileTaskAssistant");
    taskfileTaskDisposable = nova.assistants.registerTaskAssistant(
      new TaskfileTaskAssistant(),
      {
        name: "Taskfile",
        identifier: "taskfinder-tasks-taskfile",
      }
    );
    let taskfileFileWatcher = nova.fs.watch("*Taskfile.*", (e) => {
      nova.workspace.reloadTasks();
    });
    nova.subscriptions.add(taskfileFileWatcher);
    nova.subscriptions.add(taskfileTaskDisposable);
  }
};

exports.deactivate = function () {
  console.info("Deactivating Task Finder");
};