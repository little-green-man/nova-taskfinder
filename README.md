# This extension automatically populates Nova Tasks from project `package.json` and `composer.json` files.

![Screenshot](https://raw.githubusercontent.com/little-green-man/nova-taskfinder/master/Images/docs/screenshot.png)

## Features

- _Nova Tasks_ automatically populated from top-level `package.json` and `composer.json` files
- _Sidebar Tasks_ that allows inspection of subfolder files, too
- Per-workspace setting to allow
  - Specific directories to be ignored (Sidebar only)
  - Choice between NPM/Yarn package managers for task execution
  - To choose whether to recursively search for `package.json` in subfolders (Sidebar only)
- Reveal the file in which the task was found in Finder (Sidebar only)

## Usage

- Install and activate the extension
- Check the global settings for your package manager and their path(s)
- Check the project settings for which package manager to use
  - Project settings will override global ones, if you wish to customise package manager paths on a per-project basis.

The rest is pretty much automatic. Tasks will refresh on appropriate file or settings changes.

## To Do

Issues and planned features can be seen (and added to) in the [issues log](https://github.com/little-green-man/nova-taskfinder/issues).

This software is open source - pull requests are welcome.

## Treeware

[![Buy us a tree](https://img.shields.io/badge/Treeware-%F0%9F%8C%B3-lightgreen?style=for-the-badge)](https://offset.earth/treeware?gift-trees)

You're free to use this package, but if it makes it to your production environment you are requested to buy the world a tree.

It’s now common knowledge that one of the best tools to tackle the climate crisis and keep our temperatures from rising above 1.5C is to <a href="https://www.bbc.co.uk/news/science-environment-48870920">plant trees</a>. If you support this package and contribute to the Treeware forest you’ll be creating employment for local families and restoring wildlife habitats.

You can buy trees here [offset.earth/treeware](https://offset.earth/treeware?gift-trees)

Read more about Treeware at [treeware.earth](http://treeware.earth)
