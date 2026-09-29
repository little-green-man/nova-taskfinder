# Automatically populate Tasks from package.json, composer.json, Taskfiles, Maidfiles, justfiles, deno.json, Makefiles and Laravel artisan

![Screenshot](https://raw.githubusercontent.com/little-green-man/nova-taskfinder/master/.github/images/screenshot.png)

## Features

- _Nova Tasks_ automatically populated from top-level
  - `package.json`, `composer.json`, a [Taskfile](https://taskfile.dev) (`Taskfile.yml`, `taskfile.yaml`, `.dist` variants, …), and a [Maidfile](https://github.com/theMackabu/maid) (`maidfile`, `maidfile.toml`, `.yaml`, `.yml`, `.json`)
  - a [justfile](https://just.systems) (including module recipes), [Deno](https://deno.com)'s `deno.json`/`deno.jsonc`, a `Makefile` (`.PHONY` targets), and Laravel's `artisan` (common commands, or all)
- Scripts named `build`/`compile` also run with Build (⌘B), and `clean` with Clean (⇧⌘K)
- Lifecycle scripts that run automatically (npm hooks such as `postinstall`, Composer events such as `post-install-cmd`) are hidden; turn on "Show Lifecycle Scripts" to list them
- Detects your package manager (npm, yarn, pnpm or bun) from `packageManager`, `devEngines` or the lockfile, or choose one globally or per project
- Choose which task types to include, globally or per project
- Settings apply immediately, without restarting the workspace

## Usage

Install the extension. The rest is automatic: tasks appear in the Tasks menu and refresh when files and settings change.

Taskfile, Maidfile, just, Make and artisan tasks are listed using `task` (v3.19.1+), `maid`, `just` (1.15+), `make` and `php` on your `PATH`; Deno tasks are read from the file and need `deno` to run. For Maidfiles, install theMackabu's maid (`cargo install maid`); the npm package called `maid` is an unrelated tool. If something's missing, a notification explains it.

## Settings

Set preferences in Extensions → Automatic Tasks → Settings. Project Settings has the same settings for one project: each starts on **Use Global Setting**, which follows your preferences and shows their current value, e.g. "Use Global Setting (On)". Changes apply straight away.

**Refresh Tasks** (a button in both panes, and in the Extensions menu) re-reads every source. Use it after installing a missing tool, such as `just` or `deno`.

### Task Sources

Turn each kind of task on or off. A source is only read when the project has its file at the top level: `package.json`, `composer.json`, a Taskfile, a maidfile, a justfile, `deno.json`, a Makefile or Laravel's `artisan`. If the tool a source needs isn't installed, or its file has an error, a notification explains what to do.

### Node and Composer

- **Package Manager:** Automatic uses the `packageManager` field in `package.json`, then `devEngines.packageManager`, then the lockfile (bun, pnpm, yarn, then npm), and otherwise npm. Choose one to always use it.
- **Show Lifecycle Scripts:** off by default. npm and Composer run some scripts for you: npm's install, publish and version hooks, `pre`/`post` scripts for another script (when your package manager runs them), and Composer events such as `post-install-cmd`. These are hidden unless this is on.

### just

- **Recipes That Ask to Confirm:** recipes marked `[confirm]` ask a question before running, which a Nova task can't answer. **Hide** leaves them out; **Show, and confirm when run** lists them and runs them with `just --yes`.

### Make

- **Find Targets By:** **Asking make** (the default) uses make's own list, so it finds every target, including those from included files, but make evaluates the Makefile to do this, running any `$(shell …)` in it. **Reading the Makefile** reads the Makefile and the files it includes by name, and runs nothing. Either way, `.PHONY` targets are listed if the Makefile declares any; otherwise, targets that look like names (not files or patterns).

### Laravel

- **Artisan Commands:** **Common** lists everyday commands (`serve`, `test`, `migrate`, `migrate:fresh`, `migrate:rollback`, `migrate:status`, `db:seed`, `queue:work`, `queue:listen`, `schedule:work`, `schedule:run`, `pail`, `optimize`, `optimize:clear`, `route:list`, `about`, `storage:link`) plus every `app:` command. **All** lists every command that needs no arguments. Commands that need a terminal (`tinker`, `dev`) are never listed. Listing starts the Laravel app, which runs your project's code; turn the source off for projects you don't trust.

## To Do

Issues and planned features can be seen (and added to) in the [issues log](https://github.com/little-green-man/nova-taskfinder/issues).

This software is open source - pull requests are welcome.

## License

Distributed under the MIT License. See [LICENSE.txt](https://github.com/little-green-man/nova-taskfinder/blob/master/LICENSE.txt) for more information.

## Contact

Elliot - [@elliot](https://social.lgm.ltd/@elliot), or hello [at] lgm.ltd

Project Link: [https://github.com/little-green-man/nova-taskfinder](https://github.com/little-green-man/nova-taskfinder)

## Acknowledgments

So many thanks go to:

- [Sajjaad Farzad](https://github.com/theMackabu)
- [Reüel van der Steege](https://github.com/rvdsteege)
- [Toni Förster](https://github.com/stonerl)
