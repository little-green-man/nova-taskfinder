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

- Install and activate the extension
- Optional: in the extension's preferences, set your node package manager, which task types to include, whether to show lifecycle scripts, and options for just, Make and artisan
- Optional: in Project Settings, override any of these for the current project

_Project settings default to "Global Setting", which follows the extension's preferences. Choose another value to override them for that project._

The rest is automatic! Tasks will refresh when files and settings change.

Taskfile, Maidfile, just, Make and artisan tasks are listed using `task` (v3.19.1+), `maid`, `just` (1.15+), `make` and `php` on your `PATH`; Deno tasks are read from the file and need `deno` to run. For Maidfiles, install theMackabu's maid (`cargo install maid`); the npm package called `maid` is an unrelated tool. If something's missing, a notification explains it.

Listing Make targets from make's database (the default) and listing artisan commands run the project's own code (the Makefile's `$(shell …)`, and Laravel's service providers). For projects you don't trust, turn those sources off, or set "List Targets From" to "Read Makefile".

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
