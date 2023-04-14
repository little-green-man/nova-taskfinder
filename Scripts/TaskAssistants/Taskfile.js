module.exports.TaskfileTaskAssistant = class TaskfileTaskAssistant {
  constructor() {
    this.packageProcessName = "task";
    this.tasks = [];
  }
  
  async findTasks() {
    this.tasks = [];
    
    /*
     * Taskfile entries prep
     */
    try {
      const options = {
          args: ["--list-all"],
          cwd: nova.workspace.path,
          shell: true
      };
      
      let taskfileprocess = new Process("task", options);
      let rawIssues = []
      let issues = [];
      
      taskfileprocess.onStdout((line) => {
        const regex = /\* ([A-Za-z0-9-_]+)\:/;
        const match = line.match(regex)
        
        if(match)
        {
          const key = match[1];
          console.log(key);
          let task = new Task(key);
          
          task.setAction(
            Task.Run,
            new TaskProcessAction(this.packageProcessName, {
              args: [key],
              shell: true,
              cwd: nova.workspace.path
            })
          );
          this.tasks.push(task);
          task = null;
        }
        console.log(this.tasks);
      });
      
      taskfileprocess.onStderr((line) => { console.warn(`Taskfile extraction ERROR: ${line}`); });
      
      const onExit = new Promise((resolve, reject) => {
        taskfileprocess.onDidExit(status => {
          console.log(`Exited TaskfileFinder with code ${status}`);
          const action = status == 0 ? resolve : reject;
          action(status);
        });
      });
      
      taskfileprocess.start();
      
      return onExit;
      
    } catch (e) {
      console.log(e);
    }
  }

  async provideTasks() {
    await this.findTasks();
    console.info(`Taskfile extraction found ${this.tasks.length} task(s)`);
    return this.tasks;
  }
};
