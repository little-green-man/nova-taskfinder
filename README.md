<a name="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/little-green-man/nova-taskfinder">
    <img src=".github/images/screenshot.png" alt="Screenshot">
  </a>

  <h3 align="center">Automatic Tasks - The ~~missing feature~~ best extension for Panic's Nova editor</h3>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#settings">Settings</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

This project is the source code for Little Green Man's [Automatic Tasks](https://extensions.panic.com/extensions/littlegreenman/littlegreenman.TaskFinder/) extension for Panic's Nova editor (phew). It was first established to plug holes that we had in our workflow, but addresses a key feature offered by most editors, and a great extension for Nova.
As the feature set grows, it becomes more obvious why Panic may leave this functionality out of Nova itself, but we'd sure appreciate support, review and PRs from them to make it the best it can be.

What does it do? In short, **auto-populate the editors tasklist with tasks from your project files** (Node, Composer, Taskfile, Maidfile, just, Deno, Make and Laravel artisan at the moment). But also:

- Binds `build`/`compile` scripts to Build (⌘B) and `clean` to Clean (⇧⌘K)
- Hides lifecycle scripts that run automatically (npm hooks, Composer events), with a setting to show them
- Detects the Node package manager (npm, yarn, pnpm, bun), or lets you choose one globally or per project (see [Settings](#settings))
- Allows you to choose which features to enable (per-project also)
- Applies setting changes immediately, without restarting the workspace
- Watches files to automatically update the task list on file changes

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

This project was built with the following libraries and helpers.

- [TypeScript](https://www.typescriptlang.org/)
- [ESBuild](https://esbuild.github.io/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

If you just want to install the extension in Nova, then load Nova, load the Extension Library (shift-cmd-2), search for "Automatic Tasks" and press install.

Otherwise, to hack on it, develop it and/or load a local copy in Nova, carry on reading.

### Prerequisites

- nodejs
- yarn
- Nova

### Developing the Extension

1. Clone the repo
   ```sh
   git clone https://github.com/little-green-man/nova-taskfinder.git
   ```
2. Install NPM packages
   ```sh
   yarn
   ```
3. Build the extension
   ```sh
   yarn watch # or yarn build
   ```
4. Activate the extension
   Disable the formal extension from Panic, by unchecking it in the Extension Library.
   ```sh
   yarn activate
   ```
   Finally, minimise the window that opens for `./build/taskfinder.novaextension`, as you don't want to edit these files.
5. Edit the files in the `src`, run `yarn build`, and Nova will automatically reload the extension (from your minimised window)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

The [extension](https://extensions.panic.com/extensions/littlegreenman/littlegreenman.TaskFinder/) is submitted to the Panic Extension store by Little Green Man Ltd, following merged pull requests.

You just need to load Nova, load the Extension Library (shift-cmd-2), search for "Automatic Tasks" and press install.

Of course, if you fork the extension or prefer to submit your own variant, then you may do (having first modified the name, `build/extension.js` file, readme, changelog and more, choose `Extension > Submit to the Extension Library...` from Nova's menu).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->

## Roadmap

- [x] Move to TypeScript
- [ ] Build testing in
- [ ] Find a solution to [#10](https://github.com/little-green-man/nova-taskfinder/issues/10)

See the [open issues](https://github.com/little-green-man/nova-taskfinder/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`), make and test your changes
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->

## Contact

Elliot - [@elliot](https://social.lgm.ltd/@elliot), or hello [at] lgm.ltd

Project Link: [https://github.com/little-green-man/nova-taskfinder](https://github.com/little-green-man/nova-taskfinder)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

So many thanks go to:

- [Sajjaad Farzad](https://github.com/theMackabu)
- [Reüel van der Steege](https://github.com/rvdsteege)
- [Toni Förster](https://github.com/stonerl)

<p align="right">(<a href="#readme-top">back to top</a>)</p>
