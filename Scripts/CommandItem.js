function notify(title, body) {
  let request = new NotificationRequest(`processes`);

  request.title = nova.localize(title);
  request.body = nova.localize(body);

  //request.actions = [nova.localize("OK")];

  let promise = nova.notifications.add(request);
}

function cancelNotification() {
  nova.notifications.cancel(`processes`);
}

module.exports.CommandItem = class CommandItem {
  constructor(name, path = null, script = null) {
    this.name = name;
    this.children = [];
    this.parent = null;
    this.path = path;
    this.script = script;
    this.process = null;
    this.running = false;
  }

  addChild(element) {
    element.parent = this;
    this.children.push(element);
  }

  startProcess() {
    if (this.running == true) {
      console.log(`Process already running.`);
      return;
    }

    let self = this;

    let packageManager = nova.workspace.config.get(
      "taskfinder.package-manager",
      "String"
    );
    let packageProcessName = "";
    let args = [];

    switch (packageManager) {
      case "yarn":
        packageProcessName = "yarn";
        args = [self.name];
        break;
      default:
        packageProcessName = "npm";
        args = ["run", self.name];
    }

    console.log(`Attempting "${this.script}" at "${this.path}"`);

    try {
      var options = {
        cwd: this.path,
        shell: true,
        args: args,
      };

      this.process = new Process(packageProcessName, options); //this.script

      this.process.onStdout(function (line) {
        console.log(`Output: ${line}`);
      });

      this.process.onDidExit(function (line) {
        console.log(`Exited: ${line}`);
        cancelNotification();
        notify("Process Ended", this.script);
        self.running = false;
        // This is not working, it looks like a bug in Nova
        // nova.commands.invoke("taskfinder.reload-element", self);
        // Refreshing the whole tree instead for now
        nova.commands.invoke("taskfinder.refresh");
      });

      this.process.onStderr(function (line) {
        console.log(`Error: ${line}`);
      });

      this.process.start();
      notify("Process Running", this.script);
      this.running = true;

      // This is not working, it looks like a bug in Nova
      // nova.commands.invoke("taskfinder.reload-element", self);
      // Refreshing the whole tree instead for now
      console.log(self);
      nova.commands.invoke("taskfinder.refresh");
    } catch (e) {
      notify("Process Error", e);
      // This is not working, it looks like a bug in Nova
      // nova.commands.invoke("taskfinder.reload-element", self);
      // Refreshing the whole tree instead for now
      nova.commands.invoke("taskfinder.refresh");
      console.log(e);
    }
  }
};
