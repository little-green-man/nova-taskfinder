
var treeView = null;

function notify(title, body)
{
    let request = new NotificationRequest(`processes`);

    request.title = nova.localize(title);
    request.body = nova.localize(body);
    
    //request.actions = [nova.localize("OK")];
    
    let promise = nova.notifications.add(request);
}

function cancelNotification()
{
    nova.notifications.cancel(`processes`);
}

exports.activate = function() {
    // Do work when the extension is activated
    
    // Create the TreeView
    treeView = new TreeView("taskfinder", {
        dataProvider: new CommandDataProvider()
    });
    
    treeView.onDidChangeSelection((selection) => {
        // console.log("New selection: " + selection.map((e) => e.name));
    });
    
    treeView.onDidExpandElement((element) => {
        // console.log("Expanded: " + element.name);
        //TODO: Save to config
    });
    
    treeView.onDidCollapseElement((element) => {
        // console.log("Collapsed: " + element.name);
        //TODO: Save to config
    });
    
    treeView.onDidChangeVisibility(() => {
        // console.log("Visibility Changed");
    });
    
    // TreeView implements the Disposable interface
    nova.subscriptions.add(treeView);
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
}


nova.commands.register("taskfinder.refresh", () => {
    treeView.reload();
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
    })
});

nova.commands.register("taskfinder.run", () => {
   let selection = treeView.selection;
    // console.log("DoubleClick: " + selection.map((e) => `${e.name}: ${e.path}`));
    selection.map((e) => {
        console.log(`Run script "${e.script}" at "${e.path}"`);
        e.startProcess();
    })
});


class CommandItem {
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
    
    startProcess(){
        
        if (this.running == true){
            console.log(`Process already running.`);
            return;
        }
        
        let self = this;
        
        let packageManager = nova.workspace.config.get('taskfinder.package-manager', "String");
        let packageProcessName = '';
        let args = [];
        
        switch(packageManager){
            case 'yarn':
                packageProcessName = 'yarn';
                args = [self.name];
                break;
            default:
                packageProcessName = 'npm';
                args = ['run', self.name];
        }
        
        console.log(`Attempting "${this.script}" at "${this.path}"`);
        
        try
        {
            var options = {
                cwd: this.path,
                shell: true,
                args: args
            };
            
            this.process = new Process(packageProcessName, options); //this.script
            
            this.process.onStdout(function(line) {
                console.log(`Output: ${line}`);
            });
            
            this.process.onDidExit(function(line) {
                console.log(`Exited: ${line}`);
                cancelNotification();
                notify("Process Ended", this.script);
                self.running = false;
            });
            
            this.process.onStderr(function(line) {
                console.log(`Error: ${line}`);
            });
            
            this.process.start();
            notify("Process Started", this.script);
            this.running = true;
            
        } catch (e) {
            notify("Process Error", e);
            console.log(e);
        }
    }
}


class CommandDataProvider {
    constructor() {
        this.refreshCommands()
        
        let fileWatcher = nova.fs.watch("*package.json", (e) => {
            this.refreshCommands();
        });
        
        let configWatcher = nova.workspace.config.observe('taskfinder.recursive-search', () => {
            this.refreshCommands();
            console.log('recursive watcher triggered');
        })
        
        let pathWatcher = nova.workspace.onDidChangePath(() => {
            this.refreshCommands();
            console.log('path watcher triggered');
        });
        
        nova.subscriptions.add(fileWatcher);
        nova.subscriptions.add(configWatcher);
        nova.subscriptions.add(pathWatcher);
    }
    
    inspectDirectory(dir){
        nova.fs.listdir(dir).forEach((currentFileName) => {
            let currentFilePath = dir + '/' + currentFileName;
            
            let ignoredDirectories = nova.workspace.config.get('taskfinder.ignored-files').split(/\s/);
            
            if(ignoredDirectories.includes(currentFileName))
            {
                //
            }
            else if(nova.fs.stat(currentFilePath).isFile())
            {
                if( currentFileName == "package.json") {
                    
                    try{
                        let pack = JSON.parse(nova.fs.open(currentFilePath).read());
                        let name = pack.name || currentFileName;
                        
                        let element = new CommandItem(name, currentFilePath);
                        
                        if(pack.hasOwnProperty('scripts'))
                        {
                            for (var key in pack.scripts) {
                                if (pack.scripts.hasOwnProperty(key)) {
                                    element.addChild(new CommandItem(
                                        key, 
                                        dir, 
                                        pack.scripts[key]
                                    ));
                                }
                            }
                        } else {
                            element.addChild(new CommandItem('None'));
                        }
                        
                        this.rootItems.push(element);
                    } catch(e)
                    {
                        console.log(e);
                    }
                }   
            } else if (nova.fs.stat(currentFilePath).isDirectory() && nova.workspace.config.get('taskfinder.recursive-search', "Boolean") == true)
            {
                this.inspectDirectory(currentFilePath);
            }
        })
    }
    
    refreshCommands()
    {
        this.rootItems = [];
        this.inspectDirectory(nova.workspace.path);
        if(treeView != null) treeView.reload();
    }

    
    getChildren(element) {
        // Requests the children of an element
        if (!element) {
            return this.rootItems;
        }
        else {
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
            item.collapsibleState = TreeItemCollapsibleState.Collapsed;
            //item.image = "__builtin.path";
            item.tooltop = element.path + '/package.json';
            item.path = element.path + '/package.json';
            item.contextValue = 'fileable';
        }
        else {
            if (element.running)
            {
                item.image = "__builtin.next";
            } else {
                item.image = "__builtin.action";
            }
            item.command = "taskfinder.doubleClick";
            item.contextValue = element.running;
            item.descriptiveText = element.script;
            item.tooltip = element.path;
        }
        return item;
    }
}

