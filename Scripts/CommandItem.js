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
    
    startProcess(element){
        
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
                nova.commands.invoke("taskfinder.reload-element", this);
            });
            
            this.process.onStderr(function(line) {
                console.log(`Error: ${line}`);
            });
            
            this.process.start();
            notify("Process Started", this.script);
            this.running = true;
            
            nova.commands.invoke("taskfinder.reload-element", this);
            
        } catch (e) {
            notify("Process Error", e);
            nova.commands.invoke("taskfinder.reload-element", this);
            console.log(e);
        }
    }
}