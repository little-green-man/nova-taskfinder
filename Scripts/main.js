
const {CommandDataProvider} = require( "./CommandDataProvider.js" );

var treeView = null;

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
        //
    });
    
    treeView.onDidCollapseElement((element) => {
        //
    });
    
    treeView.onDidChangeVisibility(() => {
        // console.log("Visibility Changed");
    });
    
    // TreeView implements the Disposable interface
    nova.subscriptions.add(treeView);
}

exports.deactivate = function() {
    treeView = null;
    //TODO: stop any running processes?
}


nova.commands.register("taskfinder.refresh", () => {
    if (treeView != null) treeView.reload();
});

nova.commands.register("taskfinder.reload-element", (element) => {
    treeView.reload(element);
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
