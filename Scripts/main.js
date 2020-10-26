const { NodeTaskAssistant } = require("./NodeTaskAssistant.js");
const { ComposerTaskAssistant } = require("./ComposerTaskAssistant.js");
const { CommandDataProvider } = require("./CommandDataProvider.js");

var treeView = null;

exports.activate = function () {
  // Do work when the extension is activated

  if (nova.workspace.config.get("taskfinder.use-sidebar", "boolean")) {
    // Create the TreeView
    treeView = new TreeView("taskfinder", {
      dataProvider: new CommandDataProvider(),
    });
    nova.subscriptions.add(treeView);
    let recursiveConfigWatcher = nova.workspace.config.observe(
      "taskfinder.recursive-search",
      () => {
        if (treeView != null) treeView.reload();
      }
    );

    nova.subscriptions.add(recursiveConfigWatcher);
  }

  if (nova.workspace.config.get("taskfinder.auto-node", "boolean")) {
    console.info("Initialising NodeTaskAssistant");
    nodeTaskAssistantDisposable = nova.assistants.registerTaskAssistant(
      new NodeTaskAssistant(),
      {
        name: "Node Tasks",
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
        name: "Composer Tasks",
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

nova.commands.register("taskfinder.refresh", () => {
  if (treeView != null) treeView.reload();
  nova.workspace.reloadTasks();
});

nova.commands.register("taskfinder.reload-element", (element) => {
  if (treeView != null) treeView.reload(element);
});

nova.commands.register("taskfinder.loadOptions", () => {
  nova.workspace.openConfig();
});

nova.commands.register("taskfinder.doubleClick", () => {
  // Invoked when an item is double-clicked
  let selection = treeView.selection;
  // console.log("DoubleClick: " + selection.map((e) => `${e.name}: ${e.path}`));
  selection.map((e) => {
    console.log(`Run script "${e.script}" at "${e.path}"`);
    e.startProcess();
  });
});

nova.commands.register("taskfinder.run", () => {
  let selection = treeView.selection;
  // console.log("DoubleClick: " + selection.map((e) => `${e.name}: ${e.path}`));
  selection.map((e) => {
    console.log(`Run script "${e.script}" at "${e.path}"`);
    e.startProcess(e);
  });
});

nova.commands.register("taskfinder.terminate", () => {
  let selection = treeView.selection;
  // console.log("DoubleClick: " + selection.map((e) => `${e.name}: ${e.path}`));
  selection.map((e) => {
    console.log(`Run script "${e.script}" at "${e.path}"`);
    e.process.terminate();
  });
});

nova.commands.register("taskfinder.kill", () => {
  let selection = treeView.selection;
  // console.log("DoubleClick: " + selection.map((e) => `${e.name}: ${e.path}`));
  selection.map((e) => {
    console.log(`Run script "${e.script}" at "${e.path}"`);
    e.process.kill();
  });
});

nova.commands.register("taskfinder.showInFinder", () => {
  let selection = treeView.selection;
  // console.log("ShowInFinder: " + selection.map((e) => `${e.name}: ${e.path}`));
  selection.map((e) => {
    console.log(`Reveal "${e.path}"`);
    nova.fs.reveal(e.path);
  });
});
