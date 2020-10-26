const { CommandItem } = require("./CommandItem.js");

module.exports.CommandDataProvider = class CommandDataProvider {
  constructor() {
    this.refreshCommands();

    let fileWatcher = nova.fs.watch("*package.json", (e) => {
      this.refreshCommands();
    });

    let configWatcher = nova.workspace.config.observe(
      "taskfinder.recursive-search",
      () => {
        this.refreshCommands();
        console.log("recursive watcher triggered");
      }
    );

    let pathWatcher = nova.workspace.onDidChangePath(() => {
      this.refreshCommands();
      console.log("path watcher triggered");
    });

    nova.subscriptions.add(fileWatcher);
    nova.subscriptions.add(configWatcher);
    nova.subscriptions.add(pathWatcher);
  }

  inspectDirectory(dir) {
    nova.fs.listdir(dir).forEach((currentFileName) => {
      let currentFilePath = dir + "/" + currentFileName;

      let ignoredDirectories = nova.workspace.config
        .get("taskfinder.ignored-files")
        .split(/\s/);

      if (
        ignoredDirectories.includes(currentFileName) ||
        nova.fs.stat(currentFilePath) == null
      ) {
        console.log("Ignored: " + currentFileName);
      } else if (nova.fs.stat(currentFilePath).isFile()) {
        if (currentFileName == "package.json") {
          try {
            let pack = JSON.parse(nova.fs.open(currentFilePath).read());
            let name = pack.name || currentFileName;

            let element = new CommandItem(name, currentFilePath);

            if (pack.hasOwnProperty("scripts")) {
              for (var key in pack.scripts) {
                if (pack.scripts.hasOwnProperty(key)) {
                  element.addChild(
                    new CommandItem(key, dir, pack.scripts[key])
                  );
                }
              }
            } else {
              element.addChild(new CommandItem("None"));
            }

            this.rootItems.push(element);
          } catch (e) {
            console.log(e);
          }
        }
      } else if (nova.fs.stat(currentFilePath).isDirectory()) {
        if (
          nova.workspace.config.get("taskfinder.recursive-search", "Boolean") ==
          true
        ) {
          this.inspectDirectory(currentFilePath);
        }
      }
    });
  }

  refreshCommands() {
    this.rootItems = [];
    this.inspectDirectory(nova.workspace.path);
    nova.commands.invoke("taskfinder.refresh");
  }

  getChildren(element) {
    // Requests the children of an element
    if (!element) {
      return this.rootItems;
    } else {
      return element.children;
    }
  }

  getParent(element) {
    // Requests the parent of an element, for use with the reveal() method
    return element.parent;
  }

  getTreeItem(element) {
    // Converts an element into its display (TreeItem) representation
    let item = new TreeItem(element.name);

    if (element.children.length > 0) {
      item.collapsibleState = TreeItemCollapsibleState.Expanded;
      //item.image = "__builtin.path";
      item.tooltip = element.path + "/package.json";
      item.path = element.path + "/package.json";
      item.contextValue = "fileable";
    } else {
      item.image = element.running ? "__builtin.next" : "__builtin.action";
      item.command = "taskfinder.doubleClick";
      item.contextValue = element.running;
      item.descriptiveText = element.script;
      item.tooltip = element.path;
    }

    item.identifier = `${element.path}${element.name}`;

    return item;
  }
};
