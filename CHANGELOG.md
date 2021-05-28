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
