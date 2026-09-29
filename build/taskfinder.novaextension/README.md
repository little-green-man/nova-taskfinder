**Your project's scripts, in Nova's Tasks menu.**

Automatic Tasks reads your project's task runners and lists their scripts in Nova's Tasks menu, ready to run with ⌘R. Open a project and the tasks are there; change a file or a setting and the list updates.

![Nova's Tasks menu listing scripts found by Automatic Tasks](https://raw.githubusercontent.com/little-green-man/nova-taskfinder/master/.github/images/screenshot.png)

## Supported tools

| Source   | Reads                                                         | Runs                                   |
| -------- | ------------------------------------------------------------- | -------------------------------------- |
| Node     | `package.json` scripts                                        | `npm`, `yarn`, `pnpm` or `bun` (`run`) |
| Composer | `composer.json` scripts                                       | `composer run`                         |
| Task     | `Taskfile.yml` and its variants, including included Taskfiles | `task`                                 |
| Maid     | `maidfile`, `maidfile.toml`, `.yaml`, `.yml`, `.json`         | `maid`                                 |
| just     | `justfile` or `.justfile`, including modules                  | `just`                                 |
| Deno     | `deno.json` or `deno.jsonc` tasks                             | `deno task`                            |
| Make     | `Makefile` targets                                            | `make`                                 |
| Laravel  | `artisan` commands                                            | `php artisan`                          |

## Features

- **Nothing to configure.** Tasks are read from the project's own files, at the top level of the project, and refresh when those files change.
- **Build and Clean shortcuts.** Scripts named `build` or `compile` also run with Build (⌘B), and `clean` with Clean (⇧⌘K).
- **The right package manager.** Node projects use npm, Yarn, pnpm or bun, detected from `packageManager`, `devEngines` or the lockfile, or chosen in Settings.
- **Monorepos.** Optionally list tasks from npm, Yarn, pnpm, bun and Deno workspace packages, each run in its own folder.
- **Only the tasks you run.** Lifecycle hooks such as `postinstall`, Composer events, private recipes and tasks that need arguments are left out.
- **Clear notifications.** A missing tool, a broken file or a task list that hangs is explained, with a button to fix it: Install, Open File, Settings or Turn Off.
- **Global or per project.** Every setting can be set once for all projects or overridden in Project Settings, and applies straight away.

## Requirements

Each source needs its tool on your `PATH`: `task` (v3.19.1 or later), `maid`, `just` (1.15 or later), `make` or `php` to list tasks. Node, Composer and Deno tasks are read from their files, and need `npm` (or your package manager), `composer` or `deno` to run. For Maidfiles, use [theMackabu's maid](https://github.com/theMackabu/maid) (`cargo install maid`); npm's `maid` package is an unrelated tool.

> **Note:** listing Make targets (by default) and Laravel commands runs some of the project's own code: the Makefile's `$(shell …)` and Laravel's service providers. For projects you don't trust, turn those sources off, or set Make to read the Makefile instead (see Make, below).

## Settings

Set preferences in **Extensions → Automatic Tasks → Settings**. Project Settings has the same settings for one project: each starts on **Use Global Setting**, which follows your preferences and shows their current value, e.g. "Use Global Setting (On)".

**Refresh Tasks** (a button in both panes, and in the Extensions menu) re-reads every source. Use it after installing a missing tool, such as `just` or `deno`.

### Task Sources

Turn each kind of task on or off. A source is only read when the project has its file at the top level. If the tool a source needs isn't installed, or its file has an error, a notification explains what to do.

### Node and Composer

- **Package Manager:** **Automatic** uses the `packageManager` field in `package.json`, then `devEngines.packageManager`, then the lockfile (bun, pnpm, Yarn, then npm), and otherwise npm. Choose one to always use it.
- **Show Lifecycle Scripts:** off by default. npm and Composer run some scripts for you: npm's install, publish and version hooks, `pre`/`post` scripts for another script (when your package manager runs them), and Composer events such as `post-install-cmd`. Turn this on to list them too.

### Monorepos

- **Workspace Packages:** off by default. When on, tasks from workspace packages are listed as `<package>: <script>`, e.g. `@acme/api: build` (or the folder, if a package has no name), and run in the package's folder with the project's package manager.
  - Workspaces are read from `package.json` `workspaces` (npm, Yarn, bun), `pnpm-workspace.yaml` `packages` and `deno.json` `workspace`.
  - Patterns can use `*`, `**` and `!` exclusions; `node_modules` and hidden folders are skipped.
  - A package's `build` and `clean` scripts also run with Build and Clean.

### Maid

- **maid Path:** leave empty to use `maid` from your `PATH`. If a different `maid` comes first on your `PATH`, set this to theMackabu's maid, e.g. `~/.cargo/bin/maid`. The "A different maid is installed" notification's **Settings** button opens this.

### just

- **Recipes That Ask to Confirm:** recipes marked `[confirm]` ask a question before running, which a Nova task can't answer. **Hide** leaves them out; **Show, and confirm when run** lists them and runs them with `just --yes`.

### Make

- **Find Targets By:**
  - **Asking make** (the default) uses make's own list, so it finds every target, including those in included files. To do this, make evaluates the Makefile, running any `$(shell …)` in it.
  - **Reading the Makefile** reads the Makefile and the files it includes by name, and runs nothing.
  - Either way, `.PHONY` targets are listed if the Makefile declares any; otherwise, targets that look like names rather than files or patterns.

### Laravel

- **Artisan Commands:**
  - **Common** lists everyday commands (`serve`, `test`, `migrate`, `migrate:fresh`, `migrate:rollback`, `migrate:status`, `db:seed`, `queue:work`, `queue:listen`, `schedule:work`, `schedule:run`, `pail`, `optimize`, `optimize:clear`, `route:list`, `about`, `storage:link`) plus every `app:` command.
  - **All** lists every command that needs no arguments.
  - Commands that need a terminal (`tinker`, `dev`) are never listed.
  - Listing starts the Laravel app, which runs your project's code; turn the source off for projects you don't trust.

## Feedback and source code

Automatic Tasks is open source under the MIT licence. Bug reports, ideas and pull requests are welcome on [GitHub](https://github.com/little-green-man/nova-taskfinder), where you'll also find [planned work and known issues](https://github.com/little-green-man/nova-taskfinder/issues).

## Acknowledgements

Made by [Little Green Man](https://lgm.ltd), with thanks to:

- [Sajjaad Farzad](https://github.com/theMackabu)
- [Reüel van der Steege](https://github.com/rvdsteege)
- [Toni Förster](https://github.com/stonerl)

Questions or feedback: Elliot, on Mastodon ([@elliot@rtsn.dev](https://rtsn.dev/@elliot)) or Bluesky ([@elliotali.com](https://bsky.app/profile/elliotali.com)), or hello [at] lgm.ltd.
