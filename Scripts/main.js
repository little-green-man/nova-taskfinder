const { NodeTaskAssistant } = require("./TaskAssistants/Node.js");
const { ComposerTaskAssistant } = require("./TaskAssistants/Composer.js");
const { TaskfileTaskAssistant } = require("./TaskAssistants/Taskfile.js");
const { MaidFileTaskAssistant } = require('./TaskAssistants/Maidfile.js');

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
  
  // Maidfile
  if (nova.workspace.config.get('taskfinder.auto-maidfile', 'boolean')) {
    console.info('Initialising MaidfileTaskAssistant');
    nodeTaskAssistantDisposable = nova.assistants.registerTaskAssistant(new MaidFileTaskAssistant(), {
      name: 'Maid',
      identifier: 'taskfinder-tasks-maidfile',
    });
    let nodeFileWatcher = nova.fs.watch('*maidfile', (e) => {
      nova.workspace.reloadTasks();
    });
    nova.subscriptions.add(nodeFileWatcher);
    nova.subscriptions.add(nodeTaskAssistantDisposable);
  }
};

exports.deactivate = function () {
  console.info("Deactivating Task Finder");
};