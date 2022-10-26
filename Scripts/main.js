const { NodeTaskAssistant } = require("./NodeTaskAssistant.js");
const { ComposerTaskAssistant } = require("./ComposerTaskAssistant.js");

exports.activate = function () {
  // Do work when the extension is activated

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
};

exports.deactivate = function () {
  console.info("Deactivating Task Finder");
};