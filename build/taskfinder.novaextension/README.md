# Automatically populate Tasks from package.json, composer.json, Taskfile and Maidfiles

![Screenshot](https://raw.githubusercontent.com/little-green-man/nova-taskfinder/master/.github/images/screenshot.png)

## Features

- _Nova Tasks_ automatically populated from top-level
  - `package.json`, `composer.json`, a [Taskfile](https://taskfile.dev) (`Taskfile.yml`, `taskfile.yaml`, `.dist` variants, …), and a [Maidfile](https://github.com/theMackabu/maid) (`maidfile`, `maidfile.toml`, `.yaml`, `.yml`, `.json`).
- Choose Yarn/NPM for task execution, globally or per project
- Choose which task types to include, globally or per project
- Settings apply immediately, without restarting the workspace

## Usage

- Install and activate the extension
- Optional: in the extension's preferences, set your node package manager and which task types to include
- Optional: in Project Settings, override any of these for the current project

_Project settings default to "Global Setting", which follows the extension's preferences. Choose another value to override them for that project._

The rest is automatic! Tasks will refresh when files and settings change.

Taskfile and Maidfile tasks need the `task` (v3.19.1+) and `maid` commands on your `PATH`. For Maidfiles, install theMackabu's maid (`cargo install maid`); the npm package called `maid` is an unrelated tool.

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
