## Version 7.5

- **VS Code tasks:** projects with a `.vscode/tasks.json` get its `shell`, `process` and `npm` tasks, with `dependsOn`, top-level defaults, `osx` overrides and the build group (⌘B). Variables such as `${workspaceFolder}` are filled in, and the open file's (`${file}`, `${fileDirname}`…) when the task runs. Tasks that need VS Code itself are skipped ([#10](https://github.com/little-green-man/nova-taskfinder/issues/10))
- **Tasks sidebar:** every task in one list, grouped by source. Double-click to run; each task shows its status in its icon, and output streams into a log file named after the task, with Stop and Stop All. Several can run at once ([#11](https://github.com/little-green-man/nova-taskfinder/issues/11))
- Needs Nova 12 or later
- The extension now asks for write access to files, only to save the sidebar's output logs in Nova's storage for the extension

## Version 7.4.1

- A clearer extension page: the Extension Library description has been rewritten, with a table of supported tools, a feature list, the tools each source needs and a tidier Settings guide
- For contributors: the GitHub README has a step-by-step guide to adding a new task source, with a worked example

## Version 7.4

- **Monorepos:** a new **Workspace Packages** setting (off by default) also lists tasks from workspace packages, named `<package>: <script>` and run in the package's folder. It reads npm, Yarn and bun `workspaces`, `pnpm-workspace.yaml` and Deno `workspace` members, with `*`, `**` and `!` patterns
- **maid Path** setting, to use theMackabu's maid when another `maid` comes first on your `PATH`; the maid notifications have a Settings button for it
- Tasks menu headings now match the settings' names, e.g. "Node (package.json)", "Laravel (artisan)"

## Version 7.3

- Internal: moved to TypeScript 7, and tightened types for the files and tool output each source reads (a just recipe without a name is now skipped rather than listed as "undefined")
- No changes to how the extension behaves

## Version 7.2.1

- Fixed: a tool that hangs while listing tasks (for example `make` asking to install Apple's command-line tools, or a Laravel app waiting on its database) is now stopped after 15 seconds, with a notification offering Refresh, instead of that source's tasks never appearing
- Listing processes still running are stopped when the extension stops
- A problem that's fixed and later comes back (e.g. `package.json` broken again) now shows its notification again
- Internal tidying: a shared pipeline for all task sources, more tests (including start-up and shutdown), consistent formatting, and automated checks on every pull request

## Version 7.2

- Tidier settings: sources are listed once under **Task Sources** with short names (e.g. "Node (package.json)"), and each tool with options has its own short section (Node and Composer, just, Make, Laravel). Descriptions are shorter, with a (?) button linking to the new Settings section of the README. Two-choice options use radio buttons
- Project Settings: **Use Global Setting** now shows your preference's current value, e.g. "Use Global Setting (On)", and sources are On/Off
- New **Refresh Tasks** command, in the Extensions menu and in both settings panes, to re-read every source, e.g. after installing a missing tool
- Your existing settings are kept

## Version 7.1

- New sources:
  - [just](https://just.systems) recipes from a `justfile` (any case) or `.justfile`, including module recipes (`just sub::lint`). Private recipes and recipes that need arguments are skipped; `[confirm]` recipes are excluded unless "[confirm] Recipes" is set to "Run with --yes"
  - [Deno](https://deno.com) tasks from `deno.json` or `deno.jsonc` (comments and trailing commas allowed), run with `deno task`
  - Make targets from `GNUmakefile`, `makefile` or `Makefile`: the `.PHONY` targets, or name-like targets if none are declared. "List Targets From" chooses between make's database (default; complete, including included files, but runs the Makefile's `$(shell …)`) and reading the Makefile (runs nothing)
  - Laravel artisan commands, when a project has `artisan`. "Artisan Commands" lists a common set (serve, test, migrate, queue, pail and `app:*` commands) or all commands that need no arguments. Listing starts the Laravel app
- Each new source can be turned off in the extension's preferences or Project Settings, and shows a notification when its tool is missing or its file has an error
- Fixed: the root file is now matched by exact name, so a `Makefile` or `taskfile.yml` is no longer reported under another case (e.g. `makefile`)
- Fixed: files are now closed after reading. Previously each read left a file open; over many reloads and windows this could stop the extension reading any files, so no tasks were listed until Nova restarted
- Parsers are now covered by automated tests

## Version 7.0

- **The Node package manager is now detected automatically.** The Package Manager setting defaults to "Automatic", which uses the `packageManager` field in `package.json`, then `devEngines.packageManager`, then the lockfile (`bun.lock`/`bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`), falling back to npm. To keep the previous behaviour, set Package Manager to npm in the extension's preferences
- Added pnpm and bun support
- Scripts now always run with `<package manager> run <script>`. Previously yarn ran `yarn <script>`, so scripts named like a yarn built-in command (e.g. `info`, `init`, `pack`) ran yarn's command instead of the script
- Lifecycle scripts: `pre`/`post` scripts are hidden for pnpm 9+ and bun (which run them automatically) and listed for pnpm 7–8 and Yarn 2+ (which don't); pnpm's `enable-pre-post-scripts` / `enablePrePostScripts` setting is respected
- Problems are now shown as notifications, with buttons to fix them, instead of only in the Extension Console: a package manager, Composer, Task or maid that isn't installed (Composer is newly checked); npm's unrelated `maid` or a Task older than 3.19.1; errors in `package.json`, `composer.json`, a Taskfile or maidfile; lockfiles for several package managers. Each shows once per window and clears itself once fixed
- A missing `task` or `maid` is no longer reported as an outdated or wrong tool
- Adding or removing a lockfile updates the package manager used, without reopening the project

## Version 6.1.0

- Build and Clean: scripts named `build`, `compile` (or `build:*`, `compile:*`) now also run with Nova's Build (⌘B), and `clean` (or `clean:*`) with Clean (⇧⌘K), for every task type. Every task still runs with Run (⌘R), which also fixes Maidfile `build` tasks that couldn't be run with Run
- Lifecycle scripts are now hidden by default: npm hooks (e.g. `postinstall`, `prepare`, and `pre`/`post` scripts for other scripts) and Composer event scripts (e.g. `post-install-cmd`). They run automatically, so rarely need running by hand. Turn on "Show Lifecycle Scripts" in the extension's preferences or Project Settings to list them again
- With Yarn 2+ (detected from `.yarnrc.yml` or `packageManager`), `pre`/`post` scripts stay listed, as Yarn 2+ doesn't run them automatically
- Several quick file changes (e.g. switching branches) now cause a single task reload
- Added unit tests (`yarn test`)

## Version 6.0.1

- Taskfile tasks from included Taskfiles (e.g. `db:migrate`) and names containing `.` now appear and run correctly
- Lowercase (`taskfile.yml`) and `.dist` Taskfiles are now detected
- Wildcard Taskfile tasks (e.g. `start:*`) are no longer listed, as they need an argument
- Maidfile support works with current [maid](https://github.com/theMackabu/maid) versions (`maidfile`, `.toml`, `.yaml`, `.yml` and `.json`)
- A clear message is logged when the `maid` command isn't theMackabu/maid
- Taskfile and Maid tasks now only come from the project root, not parent folders, and `task`/`maid` only run when the project has one
- Tasks only reload when a project's root files change, not files in `node_modules` or `vendor`
- Updated esbuild to 0.28

## Version 6.0

- Task type and package manager settings now apply immediately, without restarting the workspace - [Toni Förster](https://github.com/stonerl)
- Project settings now default to "Global Setting", following the extension's preferences unless overridden - [Toni Förster](https://github.com/stonerl)
- Maidfile parsing errors no longer break the task list - [Toni Förster](https://github.com/stonerl)
- Task providers and file watchers are now cleaned up when the extension is deactivated
- Updated Nova type definitions to 5.1.7

## Version 5.0

- Rebuilt Automatic Tasks in TypeScript - [Sajjaad Farzad](https://github.com/theMackabu)

## Version 4.0

- Added [Maidfile](https://github.com/exact-labs/maid) support, thanks to [Sajjaad Farzad](https://github.com/theMackabu)

## Version 3.1

- Added Taskfile (taskfile.dev) support
- Enabled shell for npm/yarn, so should use your PATH automatically
- Refreshed extension icon

## Version 3.0

- Removed the side bar, and associated overheads
- Refined the UI
- Renamed the extension
- Improved overall performance

## Version 2.2

- Added funding link to extension definition.

## Version 2.1

- Fixed Bug #6: `TypeError: undefined is not an object (evaluating 'nova.fs.stat(this.packageJsonPath).isFile')`

## Version 2.0

- Provides tasks found at the root-level to Nova automatically (auto-populates the Tasks dropdown)
- Added support for composer tasks as well as node ones
- Allows the user to specify the path to NPM/Yarn (workaround as Nova doesn't provide shell environment)

## Version 1.7

- The icon for each task now reflects the running state.
- The package is re-listed under the Tasks category, thanks to Panic changing their validation criteria.

Note: The whole tree is refreshed for now, as asking the element to reload isn't working.

## Version 1.6

- Implemented the "Show in Finder" feature, for a given task. Thanks go to [Reüel van der Steege](https://github.com/rvdsteege).
- Removed the "Tasks" category, as it requires pre-determined tasks to be provided. This extension determines them automatically.

## Version 1.4

- Sidebar image fixed

## Version 1.3

- Several bugs fixed.
- Configuration added (see Readme).
- Made into Treeware.

## Version 1.0

Initial release based on how Nova Version 1.0b7 (145647) works.

I can't work out how to make custom images work for sidebars yet 🤯 - it'll get an icon once I've figured that out.
