# Design

Architecture, design decisions and Nova knowledge needed to maintain Automatic Tasks (`littlegreenman.TaskFinder`). For user-facing docs see `README.md`; for history see `CHANGELOG.md`.

## What it does

Reads task definitions from project files and offers them in Nova's Tasks menu without the user writing task configs. Sources:

| Source   | Root files (`Feature.files`)                                   | How tasks are read                                                                                                         | Command run                                 |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Node     | `package.json`                                                 | Parse `scripts` in `package.json`                                                                                          | `<pm> run <s>` (npm, yarn, pnpm, bun)       |
| Composer | `composer.json`                                                | Parse `scripts` in `composer.json`                                                                                         | `composer run <s>`                          |
| Taskfile | `[Tt]askfile[.dist].{yml,yaml}` (8 names)                      | Spawn `task --list-all --json`, use each task's `name` (skip `*` wildcards)                                                | `task <name>`                               |
| Maidfile | `maidfile`, `maidfile.{toml,yaml,yml,json}`, `Maidfile[.toml]` | Spawn `maid --system json` (fallback `maid butler json`); skip `hide = true` and `_`-prefixed tasks                        | `maid <name>`                               |
| just     | `justfile`, `Justfile`, `JUSTFILE`, `.justfile`                | Spawn `just --dump --dump-format json`; walk modules; skip private, required-argument and (by default) `[confirm]` recipes | `just <namepath>` (`--yes` for `[confirm]`) |
| Deno     | `deno.json`, `deno.jsonc`                                      | Read `tasks` (JSONC); string, object or dependency-only tasks                                                              | `deno task <name>`                          |
| Make     | `GNUmakefile`, `makefile`, `Makefile` (+ literal includes)     | Spawn `make -pRrq -f <file> :` (default) or read the file as text; `.PHONY` targets, else name-like                        | `make <target>`                             |
| artisan  | `artisan` (+ `routes/console.php`, `composer.lock` watched)    | Spawn `php artisan list --format=json`; Common or All commands                                                             | `php artisan <name>`                        |

Only root-level files are read. `task`, `maid` and `just` search parent folders, so their parsers check a root file exists before spawning; otherwise a parent folder's tasks would leak in and the tools would run in every project (tested: `tests/projects/root-only/child`). `firstRootFile()` matches **exact** names via `nova.fs.listdir`: macOS file systems usually ignore case, so `stat('makefile')` succeeds for a `Makefile` and the wrong name would reach `make -f` and notifications. If `listdir` throws it falls back to `stat()` and logs once; candidate lists put the usual spelling first (`Makefile` before `makefile`) so the fallback reports the likely name.

**Listing that runs project code:** Make's database mode evaluates the Makefile (`$(shell …)`), and artisan boots the Laravel app. Both are on by default (decided in 7.1.0: the same trust as running the project's scripts); README tells users how to turn them off or use Make's "Read Makefile" mode. just's dump doesn't evaluate backticks; Task and maid read their own files.

## Repository layout

```
src/                         TypeScript source (the only code you edit)
  index.ts                   activation and lifecycle: enable/disable/toggle, commands, setting observers
  features.ts                the feature registry: each source's setting, Task Assistant, watched files, listing settings
  source.ts                  the shared source pipeline (find root file → check tool → list → notify → tasks)
  config.ts                  workspace-over-global config helpers
  process.ts                 run() (with timeouts), stopAll(), isInstalled() (cached `command -v`), firstRootFile(), readRootFile()
  scripts.ts                 pure naming rules (Build/Clean, npm hooks, Composer events, package manager) — unit-tested
  recipes.ts                 pure listing rules for just, Deno (JSONC), Make and artisan — unit-tested
  diagnose.ts                pure rules interpreting tool output (errors, old/wrong tool) — unit-tested
  watch.ts                   isWatchedFile() and the debounced reloader — unit-tested
  settings.ts                each setting's choice labels; Project Settings choices ("Use Global Setting (On)") — unit-tested
  notify.ts                  user notifications and their actions
  tasks.ts                   createTask() and the lifecycle setting
  formats.ts                 types for the JSON the sources read (package.json, tool output…); all fields optional
  workspaces.ts              pure monorepo rules: workspace patterns per format, glob expansion, member task names — unit-tested
  parsers/                   one source definition per file (run by source.ts)
  images/                    source artwork (Acorn)
build/taskfinder.novaextension/
  extension.json             manifest — hand-edited, tracked in git
  README.md                  README shown in the Extension Library — hand-edited, tracked
  CHANGELOG.md               copied from ./CHANGELOG.md by `yarn build` — don't edit here
  Images/, extension.png     icons — tracked
  Scripts/main.dist.js       esbuild output — gitignored
README.md                    GitHub README (developer-facing)
CHANGELOG.md                 source of truth for the changelog
tests/projects/              manual test projects to open in Nova, one per case (expected results in tests/README.md)
tests/unit/                  unit tests (node:test); parsers/ runs each parser against nova.ts (stand-in Nova globals)
tests/fixtures/              captured real tool output used by the tests (anonymised)
IMPROVEMENTS.md              backlog of open work (gitignored, local only)
SPRINT.md                    current sprint plan (gitignored, local only)
```

The bundle is a Nova extension folder, so `build/taskfinder.novaextension` _is_ the shipped extension. Everything in it except `Scripts/` is source-controlled and edited by hand.

## Architecture

### Sources (`src/source.ts`, `src/parsers/`)

Each source is a small **definition** run by one shared pipeline. A definition gives:

- `id`: the log name and notification-id prefix;
- `names`: the phrases used in messages;
- `rootFiles`: the files that mark a project as using the source, most common spelling first;
- `settingKey`: its on/off setting, for Turn Off;
- `installKey`: its install link;
- `tool`: the command and whether listing or only running needs it; it can be a function (Make needs `make` only in database mode);
- optional custom notification `ids` and messages;
- `list(rootFile)`, which returns a `Listing`: `ok` with tasks, `old-version`, `wrong-tool`, `timeout`, or `error` with details.

`cliAssistant(source)` and `fileAssistant(source)` turn a definition into Nova's Task Assistant class.

- **CLI sources** (Taskfile, Maid, just, Make, artisan; `provideCli`):
  - find the root file; tools that search parent folders only run when it exists;
  - check the tool (`isInstalled`), showing `<id>-missing` if needed;
  - `await list()`;
  - show the notification for any problem, or clear earlier ones on success;
  - build tasks with `createTask()` and log `<id>: N <noun> (X ms)`.
- **File sources** (Node, Composer, Deno; `provideFile`) list synchronously from the file. The tool is only needed to run the tasks, so it's checked in the background once the listing succeeds, and the tasks are listed either way.
- **Source-specific logic** stays in the definition, or in the pure modules where it can be tested: Node's package-manager detection and its own `node-pm-missing`/`node-lockfiles` notifications, Maid's command fallback, Make's two listing modes and include watching, and artisan's error location.

### Feature registry (`src/features.ts`)

Each source is registered as a `Feature`: `{ key, Parser, name, globs, files, id, settings? }`.

- `key` — config key that turns the source on/off (`taskfinder.auto-<source>`).
- `Parser` — the source's Task Assistant class (`new () => { provideTasks() }`).
- Entries are built with `feature(source, Parser, details)`, which takes `key` from the source definition's `settingKey`, so it isn't repeated. Task Assistant `id`s (`taskfinder-tasks-<x>`) stay explicit and must not change: Nova may remember state per assistant (Maid's is `taskfinder-tasks-maidfile`).
- `settings` — the listing settings it reads (e.g. `taskfinder.make-listing`); changing one reloads only the sources that list it.
- `globs` — patterns for `nova.fs.watch`, one watcher each. Deliberately broad (`*askfile*`, `*aidfile*`, `*ustfile` cover both cases); the callback reloads only when `isWatchedFile()` (`src/watch.ts`) finds the changed path in `files`, relative to the workspace root, which also ignores `node_modules`/`vendor`. Node watches lockfiles and package-manager config as well as `package.json`.
- `files` — paths relative to the root that trigger a reload (Node: `package.json` plus `packageManagerFiles` from `src/scripts.ts`). Entries may be nested (artisan watches `routes/console.php`). Parsers export theirs (`taskfileFiles`, `maidfileFiles`, `justFiles`, `denoFiles`, `makeFiles`, `artisanFiles`). `makeFiles` is updated in place with the Makefile's literal includes on each read (only `*.mk` includes match a watch glob). Keep `activationEvents` in `extension.json` in sync (root files only).
- `id` — Task Assistant identifier.

Lifecycle:

- `activate()` — for each feature, observe its config key (workspace and global) and call `toggle()`, each in its own `try` so one failing source doesn't stop the others; register Refresh Tasks and the Project Settings resolvers; observe every listing setting in `features[].settings`.
- `toggle()` — `enable()` or `disable()` based on the resolved config value.
- `enable()` — registers the Task Assistant and file watcher, stores both disposables in the module-level `active` map, and reloads tasks. No-op if already enabled.
- `disable()` — disposes that feature's assistant and watcher, removes it from `active`, reloads tasks.
- Listing setting change — reload the sources whose `settings` include it (sources read settings, and Node detects its package manager, on every `provideTasks()`, because lockfiles change).
- File changes — `createReloader()` (`src/watch.ts`) debounces per feature (300 ms), so bursts (saves, branch switches) cause one reload. `disable()` and `deactivate()` cancel pending reloads.
- `deactivate()` — disposes everything in `active`, cancels pending reloads and stops listing processes still running (`stopAll()`). Nova disposes `nova.subscriptions` itself.

**Why an `active` map instead of `nova.subscriptions`:** features must be disposed and re-registered individually at runtime when settings change. `nova.subscriptions` has no per-item removal, so it only holds the config observers, which live for the whole session. Anything in `active` must be disposed in `deactivate()` or it leaks and can double-register on reload.

### Adding a source

1. **Definition:** `src/parsers/<source>.ts` exporting a `CliSource` or `FileSource` (see Sources) and `export default cliAssistant(…)` / `fileAssistant(…)`. Export it and its watched files from `src/parsers/index.ts`.
2. **Pure rules:** listing and diagnosis rules go in `src/recipes.ts` / `src/diagnose.ts`, with unit tests. Capture real tool output (success and failure) into `tests/fixtures/`, anonymising paths and never including environment variables.
3. **Registry:** add a `Feature` to `src/features.ts` (key, Assistant, watch globs, watched files, listing settings).
4. **`extension.json`:**
   - `activationEvents`: one `onWorkspaceContains:<filename>` per root file. `tests/unit/index.test.ts` checks this.
   - Settings: `taskfinder.auto-<source>` in **Task Sources** in both `config` (boolean, default `true`) and `configWorkspace` (enum with `resolve`); any listing settings in a section named after the tool.
   - Add the setting's choices to `src/settings.ts` (the settings test checks both panes against it), and update `description`.
5. **Notifications:** an install link in `installUrls`. The pipeline supplies `<id>-missing`, `-old`, `-wrong`, `-timeout` and `-error`; add them to the table below.
6. **Tests:** a parser test in `tests/unit/parsers/` using the stand-in Nova from `tests/unit/nova.ts` and scripted processes; a test project in `tests/projects/` (and a `broken-…` one) with a row in `tests/README.md`.
7. **Docs:** `README.md` (Settings section), `build/.../README.md`, `CHANGELOG.md`.

### Source conventions

- **Reading files:** use `readRootFile()` (safe, closes the file) and `firstRootFile()` (exact-name match) from `src/process.ts`. Never call `nova.fs.open`/`stat` directly (see Nova platform notes).
- **Running tools:** use `run()` from `src/process.ts`.
  - It spawns with `shell: true` (so the user's `PATH` is used) in the workspace root, collects all output and resolves on exit, never rejecting.
  - It stops the command after 15 s (`terminate()`, then `kill()` 2 s later) and resolves with `timedOut: true`. The pipeline shows `<id>-timeout` with a Refresh button.
  - `isInstalled()` uses a 5 s limit, and a timeout counts as installed.
  - Interpret the output with the pure `diagnose…()` functions; each returns `timeout` for a timed-out result.
- **Check the output, not just the exit status:** an unrelated `maid` exits 0 on errors.
- **Types:** parsed JSON and tool output use the interfaces in `src/formats.ts` (every field optional), never `any`; values are still checked before use.
- **Return a `Listing`, never throw:** the pipeline turns problems into notifications and returns `[]`.
- **Build/Clean:** `createTask(name, command, args)` (`src/tasks.ts`) makes a `TaskProcessAction` with `shell: true` and `cwd: nova.workspace.path`. It's always bound to Run, plus Build for `build`/`compile`/`build:*`/`compile:*` and Clean for `clean`/`clean:*` (`actionsFor()` in `src/scripts.ts`). Never bind Build/Clean _instead of_ Run: Nova disables any action a task doesn't set.
- Keep naming decisions in `src/scripts.ts` (no imports, no Nova globals) so they can be unit-tested.
- **Lifecycle scripts** are hidden unless `taskfinder.show-lifecycle-scripts` is on:
  - npm's fixed lifecycle names, always;
  - `pre<x>`/`post<x>`, only when `<x>` exists and the package manager runs them (`runsPrePostHooks()`, see below);
  - Composer command, installer and package events, but not plugin events (`init`, `command`), which are likely real scripts.

### Workspace packages (monorepos, 7.4.0)

Off by default (`taskfinder.workspace-packages`). When on, the Node and Deno sources also list their workspace members:

- **Patterns** (`src/workspaces.ts`):
  - `packageJsonWorkspaces()` reads `workspaces`, an array (npm, Yarn 2+, bun) or `{ packages }` (Yarn 1);
  - `pnpmWorkspaces()` reads `pnpm-workspace.yaml`'s `packages:` list, using a small reader for that key rather than a YAML parser;
  - `denoWorkspaces()` reads `workspace`, an array or `{ members }`.
- **Expansion:** `expandWorkspaces(patterns, list)` matches folders using a listing function (`listRootFolders()` in Nova, a plain object in tests). It supports literal paths, `*`/`?` in a segment, `**` (at most 5 levels deep) and `!` exclusions. It skips `node_modules`, dot folders, `..` and the root. Folders without a manifest are dropped.
- **Tasks:** each is named `memberTaskName()`, i.e. `<manifest name>: <script>` or `<folder>: <script>`. It runs in the member folder (`ListedTask.cwd`, joined to the root in `createTask`) with the root's package manager. Build and Clean bind by the script's own name (`ListedTask.script`). The same lifecycle-hook rules apply.
- **Watching:** `nodeFiles` and `denoFiles` are updated in place with each member's manifest, as `makeFiles` is with includes. `firstRootFile()` accepts nested paths and lists each file's own folder for the exact-name match. Root detection uses separate constant lists, so a member's file never counts as the project's.
- **Composer** has no workspace standard, so it's not included.
- **pnpm** checks the whole workspace's dependencies before `pnpm run`, even in a member folder, so running a member's task creates `node_modules/` at the workspace root. That's pnpm, not the task's `cwd` (the script itself runs in the member folder).

### Node package manager

`taskfinder.package-manager` is `auto` (default), `npm`, `yarn`, `pnpm` or `bun`. A concrete value overrides detection. `detectPackageManager()` (`src/scripts.ts`) checks, in order:

1. `packageManager` field (Corepack, `name@version[+hash]`).
2. `devEngines.packageManager` (object, or the first entry of an array).
3. Root lockfile: `bun.lock`, `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `npm-shrinkwrap.json`. npm last: a stray `package-lock.json` is the usual accident. Lockfiles for different managers show the `node-lockfiles` notification.
4. npm.

Unknown names fall through to the next signal. Scripts always run as `<pm> run <script>`: yarn, pnpm and bun all let built-in commands win over same-named scripts (`yarn info`, `pnpm test`, `bun build`). `isInstalled()` checks the chosen manager with `command -v` (cached per window) and notifies if it's missing.

Who runs `pre<x>`/`post<x>` automatically (`runsPrePostHooks()`): npm, Yarn 1, bun — yes; Yarn 2+ (`.yarnrc.yml` or `packageManager` yarn@2+) — no; pnpm — yes from v9 (pnpm PR #7634), no in 7–8 (from the `packageManager` version), and an explicit `enablePrePostScripts` in `pnpm-workspace.yaml` or `enable-pre-post-scripts` in `.npmrc` wins (workspace file first).

### Notifications (`src/notify.ts`)

Problems that stop tasks being listed or run are shown as Nova notifications, because most users never open the Extension Console. `notify(id, title, body, actions)`:

- Shows each situation (`id`) at most once per window **while it persists**; once it's cleared (fixed), it can notify again if it recurs; the request identifier (`taskfinder.<id>`) means a repeat replaces rather than stacks. Also logs to the console.
- Always adds Dismiss. Nova's buttons are small, so titles are one or two words (Install, Update, Open File, Settings, Use npm, Turn Off); the body explains what Turn Off does (sets that source to Disabled in Project Settings). Actions: `howToInstall()` / `openUrl()` (`nova.openURL`), `openRootFile()` (`nova.workspace.openFile`), `setProjectSetting()` (`nova.workspace.config.set`), `openProjectSettings` (`nova.workspace.openConfig`).
- `clearNotification(id)` cancels it when a later reload finds the problem gone (file fixed, lockfile removed, different package manager chosen).
- No "don't show again": once per window is quiet enough.

| id                                                   | Situation                                                                           | Actions                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `node-pm-missing`                                    | Chosen package manager not on `PATH`                                                | Install · Use npm (detected; sets this project to npm) or Settings (set in settings) |
| `node-lockfiles`                                     | Lockfiles for different managers                                                    | Settings                                                                             |
| `node-invalid-json` / `composer-invalid-json`        | `package.json` / `composer.json` isn't valid JSON                                   | Open File                                                                            |
| `composer-missing`                                   | `composer` not on `PATH` (tasks still listed)                                       | Install · Turn Off                                                                   |
| `taskfile-missing` / `maid-missing`                  | `task` / `maid` not on `PATH`                                                       | Install · Turn Off                                                                   |
| `taskfile-old`                                       | Task < 3.19.1 (`unknown flag: --json`)                                              | Update                                                                               |
| `taskfile-error` / `maidfile-error`                  | The tool failed; body has the first line of its error                               | Open File                                                                            |
| `maid-wrong`                                         | `maid` exits 0 without JSON (npm's unrelated maid)                                  | Install · Turn Off                                                                   |
| `just-missing` / `make-missing` / `php-missing`      | `just` / `make` (database mode) / `php` not on `PATH`                               | Install · Turn Off                                                                   |
| `deno-missing`                                       | `deno` not on `PATH` (tasks still listed; they're read from the file)               | Install · Turn Off                                                                   |
| `just-old`                                           | just < 1.15 (no stable JSON dump)                                                   | Update                                                                               |
| `<id>-timeout` (taskfile, maid, just, make, artisan) | Listing took more than 15 s and was stopped                                         | Refresh (runs Refresh Tasks)                                                         |
| `justfile-error` / `makefile-error`                  | The tool failed; body has the first line of its error                               | Open File                                                                            |
| `deno-invalid-json`                                  | `deno.json(c)` isn't valid JSONC                                                    | Open File                                                                            |
| `artisan-error`                                      | `php artisan list` failed (errors are on stdout); body is the exception and message | Open File at the line, when the error names a project file                           |

Diagnosis rules live in `src/diagnose.ts` (pure, unit-tested with captured tool output); every notification is also asserted in `tests/unit/parsers/`. Test projects: `broken-json`, `broken-taskfile`, `broken-maidfile`, `broken-justfile`, `broken-deno`, `broken-makefile`, `broken-laravel`, `bun-lockfile`, `package-manager-field`.

## Configuration design

Every setting exists at two scopes with the same key:

- **Global** (`config` in `extension.json`, Extensions → Automatic Tasks → Settings): concrete defaults (`true`, `"auto"`).
- **Workspace** (`configWorkspace`, Project Settings): enum whose first value is `null` labelled "Use Global Setting", default `null`. (Until 7.2.0 the manifest used the undocumented `config-workspace`, which also worked; stored values are keyed by setting, so the rename kept them — confirmed in Nova.)

**Layout (7.2.0, extended in 7.4.0):** both panes share one layout — a **Task Sources** section of the eight `auto-<source>` settings titled "Tool (file)", with a **Refresh Tasks** `command` button as its last item, then one section per tool or topic with options (Node and Composer, Monorepos, Maid, just, Make, Laravel). Non-enum fields (maid Path is a `path` field) have no `resolve` and aren't in `src/settings.ts`. (A top-level item after the last section renders as if it belonged to that section, so the button lives inside Task Sources.) Each section's `link` (the (?) button) points to the matching subsection of the GitHub README's Settings section, which holds the detail kept out of descriptions. Two-choice options use `radio: true`; the eight sources and Package Manager stay pop-ups (`radio: false`). Titles are Title Case, descriptions one line.

**Project Settings labels:** every Project Settings enum has `resolve: "<key>.choices"`. `index.ts` registers one command per setting that returns `projectChoices(key, nova.config.get(key))` from `src/settings.ts`, so the first choice reads "Use Global Setting (On)" (confirmed working in Project Settings, 7.2.0). The static `values` (plain "Use Global Setting") are the fallback. `src/settings.ts` is the source of truth for choice labels; `tests/unit/settings.test.ts` checks the manifest against it (same keys and order in both panes, matching values, `resolve` names, no "Include …" titles, Refresh present).

**Refresh Tasks** (`taskfinder.refresh`, Extensions menu, command palette and both panes) calls each module's `resetState()` — forgetting `isInstalled()` results and cancelling/forgetting notifications — then reloads every active source. Without it, a tool installed after the window opened isn't noticed until the window is reopened.

`getConfigWithWorkspaceOverride()` (`src/config.ts`) returns the workspace value unless it's `null`, in which case the global value. `observeConfigWithWorkspaceOverride()` subscribes to both scopes, so either changing re-runs `toggle()`. Changes apply immediately — no workspace restart (introduced in 6.0.0; earlier versions said "Requires workspace restart").

**Decision:** workspace settings default to "Global Setting" rather than a concrete value, so users set preferences once globally and only override per project when needed. This changed behaviour for existing users in 6.0.0 (hence the major version).

**Decision (7.0.0):** the package manager defaults to `auto` (was `npm`); a major version because existing users' behaviour changes.

Settings: `auto-<source>` for node, composer, taskfile, maidfile, just, deno, make, artisan (default on); `package-manager` (`auto`); `show-lifecycle-scripts` (off); `workspace-packages` (off); `maid-path` (a `path` field, empty for `maid` on `PATH`; a blank Project Settings value follows the preference; quoted with `shellQuote()` and `~`-expanded); `just-confirm-recipes` (`exclude` | `yes`); `make-listing` (`database` | `file`); `artisan-commands` (`common` | `all`).

**Decision (7.2.0):** settings were reorganised for clarity (layout above) without changing keys or stored values.

**Decisions (7.1.0):** new sources are on by default (minor version). Make lists from its database by default (complete) with "Read Makefile" as the no-execution alternative; `.PHONY` targets if declared, else name-like targets. Artisan lists a curated Common set plus `app:*` by default (custom commands with other names need All). just `[confirm]` recipes are excluded by default.

## Nova platform notes

Things learnt the hard way or not obvious from the docs.

- **Docs:** https://docs.nova.app. Many URLs guessed from API names 404; start from https://docs.nova.app/extensions/ and follow links. Useful: `/api-reference/task/`, `/api-reference/task-process-action/`, `/api-reference/notification-request/`, `/extensions/preferences/`, `/extensions/run-configurations/` (task templates), `/extensions/issue-matchers/`, `/extensions/images/` (image folders, `@2x`, template images and built-in `__filetype.`/`__builtin.` names; not usable for extension-listed tasks, see below), `/extensions/getting-started/` (activation events).
- **Types:** `@types/nova-editor-node` (`node_modules/@types/nova-editor-node/index.d.ts`, one file) is the quickest API reference. Keep it current with `yarn install`.
- **Preferences** (https://docs.nova.app/extensions/preferences/): types `boolean`, `enum`, `string`, `text`, `number`, `path`, `stringArray`, `pathArray`, `section`, `command` (a button running an extension command). Every item takes `title`, `description`, `default`, `required`, `placeholder` and `link` (a (?) help button). Enums take `values` (strings or `[value, label]`), `radio` (Nova uses radio buttons for ≤ 3 choices unless `radio: false`), `resolve` (a command returning the choices when the pane is shown) and `allowsCustom`. The documented workspace key is `configWorkspace`.
- **Enum values needn't be strings.** The preferences docs say enum `values` are strings, but `null`, `true` and `false` work as stored values (tested in Nova, 6.0.0). The workspace settings rely on this.
- **`onWorkspaceContains` takes a glob.** An exact name (e.g. `maidfile`) won't match variants like `maidfile.toml`. The docs don't say whether matching is case-sensitive, so activation events list exact filenames in each case (tested in Nova, 6.0.1: `taskfile.yml`, `Taskfile.dist.yml`, `maidfile`, `maidfile.toml` activate; `maidfile.md` doesn't).
- **`nova.fs.watch`** docs don't say what path the callback receives (absolute or relative) or how the glob is matched. Confirmed (7.2.1): `*.mk` fires for an included `extra.mk`. `isWatchedFile()` in `src/watch.ts` handles both path forms; tested in Nova (6.0.1): root edits reload, `npm install` doesn't cause a burst of reloads.
- **`TaskProcessAction` defaults:** `cwd` defaults to the project folder; if `matchers` is omitted Nova applies its standard issue matchers. Passing `matchers` replaces that set.
- **`Task`** has only `name`, `image`, `buildBeforeRunning` and actions (`Task.Build`, `Task.Run`, `Task.Clean`). No description field. Any action not set disables that button/menu item for the task.
- **Tasks menu headings** are the Task Assistant `name` (`Feature.name`). Since 7.4.0 they match the settings' Task Sources titles ("Node (package.json)"…); `tests/unit/settings.test.ts` checks this. Assistant `id`s are unchanged.
- **Task icons can't be set for extension-listed tasks.** `Task.image` is ignored for Task Assistant tasks: the Tasks menu shows the same Run icon for every task, and the toolbar shows the extension's icon for whichever task is selected. Tested in 7.4.0 with built-in names (`__filetype.js`, `__builtin.action`…) and a bundled `Images/<name>/` PNG. Panic staff say task icons appear in the Project Settings sidebar and the toolbar for **task templates** a user adds, which Task Assistant tasks aren't (https://devforum.nova.app/t/task-template-icon-question/2223). What does distinguish sources is the Tasks menu's section heading, which is the `name` passed to `registerTaskAssistant` (`Feature.name`).
- **Notifications:** `NotificationRequest` has `title`, `body`, `actions` (buttons) and a `type` only for text input; a request with the same identifier replaces the previous one; `nova.notifications.cancel(id)` removes it. The buttons are small, so keep labels to a word or two. Confirmed in Nova (7.2.1): notifications stay until dismissed, each window has its own extension instance (so "once per window" holds), and `cancel()` removes a showing notification.
- **Timers:** `setTimeout`/`clearTimeout` exist in Nova's runtime. The main `tsconfig` limits `types` to `nova-editor-node` so Node's types (used by tests) don't change them.
- **Always close files.** `nova.fs.open()` returns a handle that stays open until `close()`. Until 7.1.0 every read leaked one; with more reads per reload, many windows and many reloads, the extension ran out of handles and **every** file operation failed (`open`/`listdir` with NSCocoaErrorDomain 512/256) in every window, until Nova restarted (confirmed in 7.1.0 testing: closing files and restarting Nova fixed it). Symptoms: every source lists 0 tasks and the Extension Console shows NSCocoaErrorDomain 256/512 from reads or `listdir`. Read through `readTextFile()` (`src/process.ts`, closes in `finally`); a test (`state.openFiles`) fails if any parser leaves a file open.
- **Defensive file checks:** `fileExists()` treats a throwing `stat()` as missing, and `firstRootFile()` falls back from `listdir` to `stat()`. Both were added while chasing the leak (its errors first looked like a quirk of this repo's `*.novaextension` folder); they're harmless and keep one bad call from emptying a source. Tests simulate both (`state.listdirFails`, `state.statThrowsIfMissing`).
- **`Process.onStdout` is line-based.** Buffer output and parse on exit rather than parsing each line as a complete document (`run()` in `src/process.ts` does this). Very long lines may arrive in pieces (a real Laravel app prints ~335 KB of JSON on one line with no trailing newline), and `run()` rejoins pieces with newlines, so JSON is parsed with all line breaks removed (`parse()` in `src/diagnose.ts`; safe because JSON strings can't contain raw line breaks). Tests can deliver output in pieces (`state.chunkSize`).
- **Shell and PATH.** Nova doesn't inherit the login shell environment by default; `shell: true` on `Process`/`TaskProcessAction` makes tools like `npm`, `task` and `maid` resolve from the user's `PATH`. The first match on `PATH` wins, so when debugging, check `zsh -lc 'which -a <tool>'` and restart Nova after changing `PATH`.
- **Command name collisions.** npm's `maid` package (egoist's markdown task runner, reads `maidfile.md`) is unrelated and exits 0 on errors. This extension targets theMackabu's `maid` (formerly exact-labs; `cargo install maid`).
- **maid versions.** ≤ 1.2 used `maid butler json`; 2.0 and the 0.4+ TypeScript rewrite (versions went down) use `maid --system json`, pretty-printed. Every crates.io release ≤ 2.0 is yanked.
- **just:** `--dump --dump-format json` is stable from 1.15 (`--json` only from 1.48). One line of JSON: `recipes` (`namepath`, `private` — covers `[private]` and `_` names, `parameters` with `default: null` meaning required unless `kind: "star"`, `attributes` including `"confirm"`), nested `modules`, `aliases` (skipped). The dump doesn't evaluate backticks. Module recipes run as `just mod::recipe`. `[confirm]` needs a terminal answer; `--yes` confirms.
- **Deno:** tasks are read from `deno.json(c)` directly (`parseJsonc()` handles comments and trailing commas, leaving strings alone). A task is a string or `{ command?, description?, dependencies? }`; dependency-only tasks run. Without `deno.json`, `deno task` falls back to `package.json` scripts, which the Node source already covers. Workspaces aren't read.
- **Make:** GNU make's file order is `GNUmakefile`, `makefile`, `Makefile`. `make -pRrq -f <file> :` prints the database on stdout (the `:` goal stops it choosing a default goal; it always exits 2 with `No rule to make target ':'`, which isn't an error). The database lists every rule including includes, file targets, `.PHONY` and `# Not a target:` entries, and evaluates `$(shell …)`. It also prints the whole environment, so never commit raw output. On a Mac without the Xcode command-line tools, `/usr/bin/make` is a shim that offers to install them.
- **artisan:** `php artisan list --format=json` → `{ application, commands: [{ name, description, definition: { arguments }, hidden }], namespaces }`; `arguments` is `[]` when empty (PHP) or `{ name: { is_required } }`. A fresh app has ~126 commands, ~87 runnable without arguments. Errors print to **stdout** as `ExceptionName` then the message and `at <file>:<line>`. `tinker` and `dev` need a real terminal. Sail users' `php` runs on the host.
- **Task `--json`** needs Task v3.19.1+. Output: `{ tasks: [{ name, task, desc, summary, aliases, up_to_date, location }], location }`, flat unless `--nested`. Use `name` (full namespaced name, e.g. `db:migrate` from `includes:`); the `task` field only exists from v3.44. `--list-all` omits `internal: true` tasks. Wildcard tasks (`start:*`, v3.35+) need an argument, so they're skipped.
- **Composer events** (full list: https://getcomposer.org/doc/articles/scripts.md#event-names). Command, installer and package events are hidden as lifecycle scripts; plugin events aren't. Custom Composer scripts get no automatic pre/post hooks. `scripts-descriptions` exists but Nova's `Task` can't show it.
- **Entitlements:** `filesystem: readonly` and `process: true` (to spawn `task`/`maid`). Adding write access or network would need new entitlements in `extension.json` and would show to users.
- **`min_runtime`** is `2.0`. The docs mark some APIs as added in later Nova versions (e.g. `Task.buildBeforeRunning`, Nova 5); check the version notes and consider raising `min_runtime` when using them.

## TypeScript quirks

- **TypeScript 7** (the native compiler, since 7.3.0). It dropped `moduleResolution: "node"`, so `tsconfig.json` uses `"bundler"`, which suits esbuild bundling. A full type check takes about 0.3 s.
- `tsconfig.json` sets `"lib": ["es2020"]` (no DOM) and `"types": ["nova-editor-node"]`. Without DOM, TypeScript's own `FileSystem` interface no longer hides Nova's, so the old `src/globals.d.ts` workaround was removed in 7.2.1. Node's types are only in `tests/unit/tsconfig.json`.
- `tsc` is only used for type checking (`yarn lint`); esbuild does the build and ignores type errors, so run `yarn lint` before releasing.

## Testing

- **Manual:** `tests/projects/` has one small project per case (each source, filename variants, wildcard/hidden tasks, root-only, the `maidfile.md` collision, all sources for settings toggles). Open each as its own project with the dev build; expected results are in `tests/README.md`. Every task only echoes.
- **Unit:** `yarn test` bundles `tests/unit/*.test.ts` and `tests/unit/parsers/*.test.ts` with esbuild (`--platform=node`, output in gitignored `tests/.build`) and runs them with `node --test`. Bundling (rather than Node's own TypeScript support) keeps extensionless imports working and matches how the extension is built. Tests type-check via `tests/unit/tsconfig.json` (Node and Nova types; part of `yarn lint`). `yarn release` runs them first.
  - Pure rules: `src/scripts.ts`, `src/recipes.ts`, `src/diagnose.ts`, `src/watch.ts` (fake timers via `node:test`'s `mock.timers`).
  - **Sources:** `tests/unit/nova.ts` installs stand-in Nova globals. No tools need to be installed.
    - Real file reads from `tests/projects/<name>` (`useProject()`).
    - In-memory settings with observers (`setConfig()`).
    - Recorded notifications, URLs, tasks, reloads, Task Assistants, commands, watchers and subscriptions.
    - **Scripted processes** (`script()`, and `install()` for `command -v`), fed from `tests/fixtures/`. They can `hang` (and `ignoresTerminate`) for timeout tests; `terminate()`/`kill()` calls are recorded in `state.signals`.
    - Import it before any `src/` module (`src/tasks.ts` reads `Task.Run` on load). `useProject()` also calls each module's `resetState()`.
  - **Lifecycle:** `tests/unit/index.test.ts` activates the real `index.ts` against the stand-in and covers:
    - registration, turning a source off and on, the debounced watcher, and listing settings;
    - Refresh Tasks, and `deactivate()` (disposing, and stopping processes);
    - activation events versus each source's root files.
      Call `deactivate()` and then dispose `state.subscriptions`, as Nova would.
  - **Timeouts:** `tests/unit/process.test.ts` covers the timeout, kill and single-resolve behaviour, with fake timers.

## Build and tooling

- `yarn build` — clean `Scripts/`, bundle `src/index.ts` → `Scripts/main.dist.js` (CJS, minified; flags inline in `package.json`), copy `CHANGELOG.md` into the bundle.
- `yarn watch` — rebuild on change.
- `yarn clear-scripts` — delete `Scripts/` (used by `build`/`watch`). Deliberately not called `clean`: this repo's own scripts appear as tasks in its Nova window, and a `clean` script would be bound to Clean (⇧⌘K), which would delete the dev build and stop the extension in every window.
- `yarn lint` — `tsc --noEmit` for `src` and `tests/unit`.
- `yarn test` — unit tests (see Testing).
- `yarn activate` — open the bundle in Nova as a dev extension. Disable the Extension Library copy first, and leave the window that opens minimised.
- `yarn release` — build, then `nova extension publish` (validates, asks to confirm, publishes). Don't name it `publish`: that's a built-in Yarn 1 command and would try to publish to npm.
- `nova extension validate build/taskfinder.novaextension` — validate without publishing.
- `yarn format` / `yarn format:check`: Prettier (`.prettierrc.toml`: tabs, single quotes, width 150). It formats `src`, tests, docs and `extension.json`. `.prettierignore` leaves out the deliberately broken files in `tests/projects/` and the captured output in `tests/fixtures/`.
- **CI** (`.github/workflows/ci.yml`, GitHub Actions, Ubuntu, Node 24) runs `format:check`, `lint`, `test` and `build` on pull requests and pushes to `master`. It's a **required check** for merging into `master`. Actions is limited to GitHub-owned actions. `nova extension validate` needs Nova, so it stays in the local release steps.
- Yarn 1 (via Corepack). esbuild 0.28.
- Extension logs: Nova → Extensions → Extension Console.

## Releasing

1. Update `CHANGELOG.md` (new `## Version X.Y` at the top, credit contributors with GitHub links).
2. Bump `version` in both `package.json` and `build/taskfinder.novaextension/extension.json` — they must match.
3. Update both READMEs if features or settings changed; add contributors to Acknowledgements in both.
4. `yarn format:check`, `yarn lint`, `yarn test`, `yarn build`, `nova extension validate build/taskfinder.novaextension`, then test with `yarn activate` against `tests/projects/` (see `tests/README.md`). CI must pass on the PR.
5. Merge to `master`, then `yarn release` (needs `nova extension login`; check with `nova extension whoami`).

Versioning: bump major when existing users' behaviour changes (e.g. setting defaults), minor for new sources/features, patch for fixes.

## Contributing workflow

- `master` requires a PR (no direct pushes) and a passing CI check, but no approving reviews, as there's a single maintainer. Merge your own PRs with `gh pr merge <n> --merge` once CI is green.
- Contributor PRs usually come from the contributor's fork. With "Allow edits by maintainers" on, you can push follow-up commits to that branch; use the SSH URL (`git@github.com:<user>/nova-taskfinder.git`).
- Don't add AI attribution to commits, PRs or docs.
