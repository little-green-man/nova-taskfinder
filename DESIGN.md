# Design

Architecture, design decisions and Nova knowledge needed to maintain Automatic Tasks (`littlegreenman.TaskFinder`). For user-facing docs see `README.md`; for history see `CHANGELOG.md`.

## What it does

Reads task definitions from project files and offers them in Nova's Tasks menu without the user writing task configs. Sources:

| Source   | Root files (`Feature.files`)                                  | How tasks are read                                              | Command run                |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| Node     | `package.json`                                                | Parse `scripts` in `package.json`                               | `<pm> run <s>` (npm, yarn, pnpm, bun) |
| Composer | `composer.json`                                               | Parse `scripts` in `composer.json`                              | `composer run <s>`         |
| Taskfile | `[Tt]askfile[.dist].{yml,yaml}` (8 names)                     | Spawn `task --list-all --json`, use each task's `name` (skip `*` wildcards) | `task <name>`              |
| Maidfile | `maidfile`, `maidfile.{toml,yaml,yml,json}`, `Maidfile[.toml]` | Spawn `maid --system json` (fallback `maid butler json`); skip `hide = true` and `_`-prefixed tasks | `maid <name>`              |
| just     | `justfile`, `Justfile`, `JUSTFILE`, `.justfile`                | Spawn `just --dump --dump-format json`; walk modules; skip private, required-argument and (by default) `[confirm]` recipes | `just <namepath>` (`--yes` for `[confirm]`) |
| Deno     | `deno.json`, `deno.jsonc`                                      | Read `tasks` (JSONC); string, object or dependency-only tasks    | `deno task <name>`         |
| Make     | `GNUmakefile`, `makefile`, `Makefile` (+ literal includes)     | Spawn `make -pRrq -f <file> :` (default) or read the file as text; `.PHONY` targets, else name-like | `make <target>`            |
| artisan  | `artisan` (+ `routes/console.php`, `composer.lock` watched)    | Spawn `php artisan list --format=json`; Common or All commands   | `php artisan <name>`       |

Only root-level files are read. `task`, `maid` and `just` search parent folders, so their parsers check a root file exists before spawning; otherwise a parent folder's tasks would leak in and the tools would run in every project (tested: `tests/projects/root-only/child`). `firstRootFile()` matches **exact** names via `nova.fs.listdir`: macOS file systems usually ignore case, so `stat('makefile')` succeeds for a `Makefile` and the wrong name would reach `make -f` and notifications. If `listdir` throws it falls back to `stat()` and logs once; candidate lists put the usual spelling first (`Makefile` before `makefile`) so the fallback reports the likely name.

**Listing that runs project code:** Make's database mode evaluates the Makefile (`$(shell …)`), and artisan boots the Laravel app. Both are on by default (decided in 7.1.0: the same trust as running the project's scripts); README tells users how to turn them off or use Make's "Read Makefile" mode. just's dump doesn't evaluate backticks; Task and maid read their own files.

## Repository layout

```
src/                         TypeScript source (the only code you edit)
  index.ts                   activation, feature registry, enable/disable/toggle
  config.ts                  workspace-over-global config helpers
  process.ts                 run(), isInstalled() (cached `command -v`), firstRootFile()
  scripts.ts                 pure naming rules (Build/Clean, npm hooks, Composer events, package manager) — unit-tested
  recipes.ts                 pure listing rules for just, Deno (JSONC), Make and artisan — unit-tested
  diagnose.ts                pure rules interpreting tool output (errors, old/wrong tool) — unit-tested
  watch.ts                   isWatchedFile() and the debounced reloader — unit-tested
  notify.ts                  user notifications and their actions
  tasks.ts                   createTask() and the lifecycle setting, shared by all parsers
  globals.d.ts               FileSystem type fix (see "TypeScript quirks")
  parsers/                   one Task Assistant class per source
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

The bundle is a Nova extension folder, so `build/taskfinder.novaextension` *is* the shipped extension. Everything in it except `Scripts/` is source-controlled and edited by hand.

## Architecture

### Feature registry (`src/index.ts`)

Each source is a `Feature`: `{ key, Parser, name, globs, files, id }`.

- `key` — config key that turns the source on/off (`taskfinder.auto-<source>`).
- `Parser` — class implementing Nova's `TaskAssistant` (`provideTasks()`).
- `globs` — patterns for `nova.fs.watch`, one watcher each. Deliberately broad (`*askfile*`, `*aidfile*`, `*ustfile` cover both cases); the callback reloads only when `isWatchedFile()` (`src/watch.ts`) finds the changed path in `files`, relative to the workspace root, which also ignores `node_modules`/`vendor`. Node watches lockfiles and package-manager config as well as `package.json`.
- `files` — paths relative to the root that trigger a reload (Node: `package.json` plus `packageManagerFiles` from `src/scripts.ts`). Entries may be nested (artisan watches `routes/console.php`). Parsers export theirs (`taskfileFiles`, `maidfileFiles`, `justFiles`, `denoFiles`, `makeFiles`, `artisanFiles`). `makeFiles` is updated in place with the Makefile's literal includes on each read (only `*.mk` includes match a watch glob). Keep `activationEvents` in `extension.json` in sync (root files only).
- `id` — Task Assistant identifier.

Lifecycle:

- `activate()` — for each feature, observe its config key (workspace and global) and call `toggle()`; also observe `taskfinder.package-manager` and `taskfinder.show-lifecycle-scripts`.
- `toggle()` — `enable()` or `disable()` based on the resolved config value.
- `enable()` — registers the Task Assistant and file watcher, stores both disposables in the module-level `active` map, and reloads tasks. No-op if already enabled.
- `disable()` — disposes that feature's assistant and watcher, removes it from `active`, reloads tasks.
- Package manager or lifecycle setting change — reload the affected tasks (Node; Node and Composer). Parsers read both settings, and detect the package manager, on every `provideTasks()`, because lockfiles change.
- Listing settings (`just-confirm-recipes`, `make-listing`, `artisan-commands`) — reload that source only.
- File changes — `createReloader()` (`src/watch.ts`) debounces per feature (300 ms), so bursts (saves, branch switches) cause one reload. `disable()` and `deactivate()` cancel pending reloads.
- `deactivate()` — disposes everything in `active`.

**Why an `active` map instead of `nova.subscriptions`:** features must be disposed and re-registered individually at runtime when settings change. `nova.subscriptions` has no per-item removal, so it only holds the config observers, which live for the whole session. Anything in `active` must be disposed in `deactivate()` or it leaks and can double-register on reload.

### Adding a source

1. Parser in `src/parsers/<source>.ts` implementing `provideTasks()` (sync array or `Promise`); export it from `src/parsers/index.ts`.
2. Add a `Feature` to `features` in `src/index.ts`.
3. `extension.json`:
   - `activationEvents`: one `onWorkspaceContains:<filename>` per entry in `files`.
   - `config` (global): boolean `taskfinder.auto-<source>`, default `true`.
   - `config-workspace`: enum `taskfinder.auto-<source>` with `[null, "Global Setting"], [true, "Enabled"], [false, "Disabled"]`, default `null`.
   - Update `description`.
4. `README.md`, `build/.../README.md`, `CHANGELOG.md`.
5. Pure listing/diagnosis rules in `src/recipes.ts` / `src/diagnose.ts` with unit tests; capture real tool output (success and failure) into `tests/fixtures/`, anonymising paths and never including environment variables.
6. A parser test in `tests/unit/parsers/` (stand-in Nova from `tests/unit/nova.ts`, scripted processes).
7. A test project in `tests/projects/` (and a `broken-…` one) with a row in `tests/README.md`.
8. Notifications: `<source>-missing` (Install · Turn Off), file errors (Open File), an install link in `installUrls`; add them to the table below.

### Parser conventions

- File-based parsers (Node, Composer) read with `nova.fs.open(path).read()` and `JSON.parse`, inside `try/catch` that logs and returns what it has.
- CLI-based parsers (Taskfile, Maid) use `run()` from `src/process.ts`: spawns with `shell: true` (so the user's `PATH` is used) in the workspace root, collects all output and resolves on exit, never rejecting. Check the tool with `isInstalled()` first, then interpret the result with the pure `diagnoseTaskfile()`/`diagnoseMaid()` (`src/diagnose.ts`). On failure return `[]` — never `undefined`, never throw — and tell the user with `notify()` (see Notifications).
- Check the output, not just the exit status: an unrelated `maid` exits 0 on errors.
- Build tasks with `createTask(name, command, args)` (`src/tasks.ts`): a `TaskProcessAction` with `shell: true` and `cwd: nova.workspace.path`, always bound to Run, plus Build for `build`/`compile`/`build:*`/`compile:*` and Clean for `clean`/`clean:*` (`actionsFor()` in `src/scripts.ts`). Never bind Build/Clean *instead of* Run: Nova disables any action a task doesn't set.
- Keep naming decisions in `src/scripts.ts` (no imports, no Nova globals) so they can be unit-tested.
- Lifecycle scripts are hidden unless `taskfinder.show-lifecycle-scripts` is on: npm's fixed lifecycle names always; `pre<x>`/`post<x>` only when `<x>` exists and the package manager runs them (`runsPrePostHooks()`, see below); Composer command/installer/package events, but not plugin events (`init`, `command`), which are likely real scripts.

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

- Shows each situation (`id`) at most once per window; the request identifier (`taskfinder.<id>`) means a repeat replaces rather than stacks. Also logs to the console.
- Always adds Dismiss. Nova's buttons are small, so titles are one or two words (Install, Update, Open File, Settings, Use npm, Turn Off); the body explains what Turn Off does (sets that source to Disabled in Project Settings). Actions: `howToInstall()` / `openUrl()` (`nova.openURL`), `openRootFile()` (`nova.workspace.openFile`), `setProjectSetting()` (`nova.workspace.config.set`), `openProjectSettings` (`nova.workspace.openConfig`).
- `clearNotification(id)` cancels it when a later reload finds the problem gone (file fixed, lockfile removed, different package manager chosen).
- No "don't show again": once per window is quiet enough.

| id | Situation | Actions |
| -- | --------- | ------- |
| `node-pm-missing` | Chosen package manager not on `PATH` | Install · Use npm (detected; sets this project to npm) or Settings (set in settings) |
| `node-lockfiles` | Lockfiles for different managers | Settings |
| `node-invalid-json` / `composer-invalid-json` | `package.json` / `composer.json` isn't valid JSON | Open File |
| `composer-missing` | `composer` not on `PATH` (tasks still listed) | Install · Turn Off |
| `taskfile-missing` / `maid-missing` | `task` / `maid` not on `PATH` | Install · Turn Off |
| `taskfile-old` | Task < 3.19.1 (`unknown flag: --json`) | Update |
| `taskfile-error` / `maidfile-error` | The tool failed; body has the first line of its error | Open File |
| `maid-wrong` | `maid` exits 0 without JSON (npm's unrelated maid) | Install · Turn Off |
| `just-missing` / `make-missing` / `php-missing` | `just` / `make` (database mode) / `php` not on `PATH` | Install · Turn Off |
| `deno-missing` | `deno` not on `PATH` (tasks still listed; they're read from the file) | Install · Turn Off |
| `just-old` | just < 1.15 (no stable JSON dump) | Update |
| `justfile-error` / `makefile-error` | The tool failed; body has the first line of its error | Open File |
| `deno-invalid-json` | `deno.json(c)` isn't valid JSONC | Open File |
| `artisan-error` | `php artisan list` failed (errors are on stdout); body is the exception and message | Open File at the line, when the error names a project file |

Diagnosis rules live in `src/diagnose.ts` (pure, unit-tested with captured tool output); every notification is also asserted in `tests/unit/parsers/`. Test projects: `broken-json`, `broken-taskfile`, `broken-maidfile`, `broken-justfile`, `broken-deno`, `broken-makefile`, `broken-laravel`, `bun-lockfile`, `package-manager-field`.

## Configuration design

Every setting exists at two scopes with the same key:

- **Global** (`config` in `extension.json`, Extensions → Automatic Tasks → Settings): concrete defaults (`true`, `"auto"`).
- **Workspace** (`config-workspace`, Project Settings): enum whose first value is `null` labelled "Global Setting", default `null`.

`getConfigWithWorkspaceOverride()` (`src/config.ts`) returns the workspace value unless it's `null`, in which case the global value. `observeConfigWithWorkspaceOverride()` subscribes to both scopes, so either changing re-runs `toggle()`. Changes apply immediately — no workspace restart (introduced in 6.0.0; earlier versions said "Requires workspace restart").

**Decision:** workspace settings default to "Global Setting" rather than a concrete value, so users set preferences once globally and only override per project when needed. This changed behaviour for existing users in 6.0.0 (hence the major version).

**Decision (7.0.0):** the package manager defaults to `auto` (was `npm`); a major version because existing users' behaviour changes.

Settings: `auto-<source>` for node, composer, taskfile, maidfile, just, deno, make, artisan (default on); `package-manager` (`auto`); `show-lifecycle-scripts` (off); `just-confirm-recipes` (`exclude` | `yes`); `make-listing` (`database` | `file`); `artisan-commands` (`common` | `all`).

**Decisions (7.1.0):** new sources are on by default (minor version). Make lists from its database by default (complete) with "Read Makefile" as the no-execution alternative; `.PHONY` targets if declared, else name-like targets. Artisan lists a curated Common set plus `app:*` by default (custom commands with other names need All). just `[confirm]` recipes are excluded by default.

## Nova platform notes

Things learnt the hard way or not obvious from the docs.

- **Docs:** https://docs.nova.app. Many URLs guessed from API names 404; start from https://docs.nova.app/extensions/ and follow links. Useful: `/api-reference/task/`, `/api-reference/task-process-action/`, `/api-reference/notification-request/`, `/extensions/preferences/`, `/extensions/run-configurations/` (task templates), `/extensions/issue-matchers/`, `/extensions/images/` (`Task.image` sizes/@2x), `/extensions/getting-started/` (activation events).
- **Types:** `@types/nova-editor-node` (`node_modules/@types/nova-editor-node/index.d.ts`, one file) is the quickest API reference. Keep it current with `yarn install`.
- **Enum values needn't be strings.** The preferences docs say enum `values` are strings, but `null`, `true` and `false` work as stored values (tested in Nova, 6.0.0). The workspace settings rely on this.
- **`onWorkspaceContains` takes a glob.** An exact name (e.g. `maidfile`) won't match variants like `maidfile.toml`. The docs don't say whether matching is case-sensitive, so activation events list exact filenames in each case (tested in Nova, 6.0.1: `taskfile.yml`, `Taskfile.dist.yml`, `maidfile`, `maidfile.toml` activate; `maidfile.md` doesn't).
- **`nova.fs.watch`** docs don't say what path the callback receives (absolute or relative) or how the glob is matched. `isRootFile()` in `src/index.ts` handles both path forms; tested in Nova (6.0.1): root edits reload, `npm install` doesn't cause a burst of reloads.
- **`TaskProcessAction` defaults:** `cwd` defaults to the project folder; if `matchers` is omitted Nova applies its standard issue matchers. Passing `matchers` replaces that set.
- **`Task`** has only `name`, `image`, `buildBeforeRunning` and actions (`Task.Build`, `Task.Run`, `Task.Clean`). No description field. Any action not set disables that button/menu item for the task.
- **Notifications:** `NotificationRequest` has `title`, `body`, `actions` (buttons) and a `type` only for text input; a request with the same identifier replaces the previous one; `nova.notifications.cancel(id)` removes it. The buttons are small, so keep labels to a word or two. Docs don't say whether notifications persist or whether each window has its own extension instance (to verify).
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

- `src/globals.d.ts` re-declares `FileSystem.stat/open/watch`. TypeScript's DOM lib declares its own `FileSystem` interface, which wins the global binding and hides Nova's methods; re-declaring them as an interface merges them back. Keep this until the types or `tsconfig` `lib` change (setting `"lib": ["es2020"]` without DOM may make it unnecessary — test with `yarn lint`).
- `tsc` is only used for type checking (`yarn lint`); esbuild does the build and ignores type errors, so run `yarn lint` before releasing.

## Testing

- **Manual:** `tests/projects/` has one small project per case (each source, filename variants, wildcard/hidden tasks, root-only, the `maidfile.md` collision, all sources for settings toggles). Open each as its own project with the dev build; expected results are in `tests/README.md`. Every task only echoes.
- **Unit:** `yarn test` bundles `tests/unit/*.test.ts` and `tests/unit/parsers/*.test.ts` with esbuild (`--platform=node`, output in gitignored `tests/.build`) and runs them with `node --test`. Bundling (rather than Node's own TypeScript support) keeps extensionless imports working and matches how the extension is built. Tests type-check via `tests/unit/tsconfig.json` (Node and Nova types; part of `yarn lint`). `yarn release` runs them first.
  - Pure rules: `src/scripts.ts`, `src/recipes.ts`, `src/diagnose.ts`, `src/watch.ts` (fake timers via `node:test`'s `mock.timers`).
  - Parsers: `tests/unit/nova.ts` installs stand-in Nova globals — real file reads from `tests/projects/<name>` (`useProject()`), in-memory settings, recorded notifications/URLs/tasks, and **scripted processes** (`script()`, `install()` for `command -v`) fed from `tests/fixtures/`. No tools need to be installed. Import it before any `src/` module (`src/tasks.ts` reads `Task.Run` on load). `useProject()` also calls each module's `resetForTests()` (install-check cache, shown notifications).

## Build and tooling

- `yarn build` — clean `Scripts/`, bundle `src/index.ts` → `Scripts/main.dist.js` (CJS, minified; flags inline in `package.json`), copy `CHANGELOG.md` into the bundle.
- `yarn watch` — rebuild on change.
- `yarn clear-scripts` — delete `Scripts/` (used by `build`/`watch`). Deliberately not called `clean`: this repo's own scripts appear as tasks in its Nova window, and a `clean` script would be bound to Clean (⇧⌘K), which would delete the dev build and stop the extension in every window.
- `yarn lint` — `tsc --noEmit` for `src` and `tests/unit`.
- `yarn test` — unit tests (see Testing).
- `yarn activate` — open the bundle in Nova as a dev extension. Disable the Extension Library copy first, and leave the window that opens minimised.
- `yarn release` — build, then `nova extension publish` (validates, asks to confirm, publishes). Don't name it `publish`: that's a built-in Yarn 1 command and would try to publish to npm.
- `nova extension validate build/taskfinder.novaextension` — validate without publishing.
- Formatting: Prettier (`.prettierrc.toml`) — tabs, single quotes, width 150.
- Yarn 1 (via Corepack). esbuild 0.28.
- Extension logs: Nova → Extensions → Extension Console.

## Releasing

1. Update `CHANGELOG.md` (new `## Version X.Y` at the top, credit contributors with GitHub links).
2. Bump `version` in both `package.json` and `build/taskfinder.novaextension/extension.json` — they must match.
3. Update both READMEs if features or settings changed; add contributors to Acknowledgements in both.
4. `yarn lint`, `yarn test`, `yarn build`, `nova extension validate build/taskfinder.novaextension`, then test with `yarn activate` against `tests/projects/` (see `tests/README.md`).
5. Merge to `master`, then `yarn release` (needs `nova extension login`; check with `nova extension whoami`).

Versioning: bump major when existing users' behaviour changes (e.g. setting defaults), minor for new sources/features, patch for fixes.

## Contributing workflow

- `master` requires a PR (no direct pushes) but no approving reviews, as there's a single maintainer. Merge your own PRs with `gh pr merge <n> --merge`.
- Contributor PRs usually come from the contributor's fork. With "Allow edits by maintainers" on, you can push follow-up commits to that branch; use the SSH URL (`git@github.com:<user>/nova-taskfinder.git`).
- Don't add AI attribution to commits, PRs or docs.
