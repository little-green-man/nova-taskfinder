# Design

Architecture, design decisions and Nova knowledge needed to maintain Automatic Tasks (`littlegreenman.TaskFinder`). For user-facing docs see `README.md`; for history see `CHANGELOG.md`.

## What it does

Reads task definitions from project files and offers them in Nova's Tasks menu without the user writing task configs. Sources:

| Source   | Root files (`Feature.files`)                                  | How tasks are read                                              | Command run                |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| Node     | `package.json`                                                | Parse `scripts` in `package.json`                               | `npm run <s>` / `yarn <s>` |
| Composer | `composer.json`                                               | Parse `scripts` in `composer.json`                              | `composer run <s>`         |
| Taskfile | `[Tt]askfile[.dist].{yml,yaml}` (8 names)                     | Spawn `task --list-all --json`, parse JSON                      | `task <name>`              |
| Maidfile | `maidfile`, `maidfile.{toml,yaml,yml,json}`, `Maidfile[.toml]` | Spawn `maid --system json` (fallback `maid butler json`), parse JSON | `maid <name>`              |

Only root-level files are read. `task` and `maid` both search parent folders, so their parsers check a root file exists before spawning; otherwise a parent folder's tasks would leak in and the tools would run in every project (tested: `tests/projects/root-only/child`).

## Repository layout

```
src/                         TypeScript source (the only code you edit)
  index.ts                   activation, feature registry, enable/disable/toggle
  config.ts                  workspace-over-global config helpers
  process.ts                 run/parse helpers for CLI-based parsers
  scripts.ts                 pure naming rules (Build/Clean, npm hooks, Composer events) — unit-tested
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
taskfile.yml, maidfile.toml  sample files so Taskfile/Maid tasks appear while developing
tests/projects/              manual test projects to open in Nova, one per case (expected results in tests/README.md)
tests/unit/                  unit tests (node:test), own tsconfig with Node types
IMPROVEMENTS.md              backlog (gitignored, local only)
```

The bundle is a Nova extension folder, so `build/taskfinder.novaextension` *is* the shipped extension. Everything in it except `Scripts/` is source-controlled and edited by hand.

## Architecture

### Feature registry (`src/index.ts`)

Each source is a `Feature`: `{ key, Parser, name, glob, files, id }`.

- `key` — config key that turns the source on/off (`taskfinder.auto-<source>`).
- `Parser` — class implementing Nova's `TaskAssistant` (`provideTasks()`).
- `glob` — pattern for `nova.fs.watch`. Deliberately broad (`*askfile*`, `*aidfile*` cover both cases); the callback only reloads (`nova.workspace.reloadTasks(id)`) when the changed path is one of `files` at the workspace root, which also ignores `node_modules`/`vendor`.
- `files` — exact root filenames for the source. Taskfile/Maid export theirs from the parser (`taskfileFiles`, `maidfileFiles`) and use them for the existence check. Keep `activationEvents` in `extension.json` in sync.
- `id` — Task Assistant identifier.

Lifecycle:

- `activate()` — for each feature, observe its config key (workspace and global) and call `toggle()`; also observe `taskfinder.package-manager`.
- `toggle()` — `enable()` or `disable()` based on the resolved config value.
- `enable()` — registers the Task Assistant and file watcher, stores both disposables in the module-level `active` map, and reloads tasks. No-op if already enabled.
- `disable()` — disposes that feature's assistant and watcher, removes it from `active`, reloads tasks.
- Package manager change — disable + enable the Node feature so a new `NodeTaskAssistant` reads the new value (the parser reads the setting once, in its constructor).
- Lifecycle setting change — reload the Node and Composer tasks; parsers read `taskfinder.show-lifecycle-scripts` on every `provideTasks()`.
- File changes — `scheduleReload()` debounces per feature (300 ms), so bursts (saves, branch switches) cause one reload. `disable()` and `deactivate()` clear pending timers.
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
5. A test project in `tests/projects/` and a row in `tests/README.md`.

### Parser conventions

- File-based parsers (Node, Composer) read with `nova.fs.open(path).read()` and `JSON.parse`, inside `try/catch` that logs and returns what it has.
- CLI-based parsers (Taskfile, Maid) use `run()` from `src/process.ts`: spawns with `shell: true` (so the user's `PATH` is used) in the workspace root, collects all output and resolves on exit, never rejecting. Parse the whole output with `parseJson()`. On failure return `[]` — never `undefined`, never throw — and report with `warnOnce()` so reloads don't flood the console.
- Check the output, not just the exit status: an unrelated `maid` exits 0 on errors.
- Build tasks with `createTask(name, command, args)` (`src/tasks.ts`): a `TaskProcessAction` with `shell: true` and `cwd: nova.workspace.path`, always bound to Run, plus Build for `build`/`compile`/`build:*`/`compile:*` and Clean for `clean`/`clean:*` (`actionsFor()` in `src/scripts.ts`). Never bind Build/Clean *instead of* Run: Nova disables any action a task doesn't set.
- Keep naming decisions in `src/scripts.ts` (no imports, no Nova globals) so they can be unit-tested.
- Lifecycle scripts are hidden unless `taskfinder.show-lifecycle-scripts` is on: npm's fixed lifecycle names always; `pre<x>`/`post<x>` only when `<x>` exists and the package manager runs them (npm, Yarn 1 — not Yarn 2+ or pnpm); Composer command/installer/package events, but not plugin events (`init`, `command`), which are likely real scripts.

## Configuration design

Every setting exists at two scopes with the same key:

- **Global** (`config` in `extension.json`, Extensions → Automatic Tasks → Settings): concrete defaults (`true`, `"npm"`).
- **Workspace** (`config-workspace`, Project Settings): enum whose first value is `null` labelled "Global Setting", default `null`.

`getConfigWithWorkspaceOverride()` (`src/config.ts`) returns the workspace value unless it's `null`, in which case the global value. `observeConfigWithWorkspaceOverride()` subscribes to both scopes, so either changing re-runs `toggle()`. Changes apply immediately — no workspace restart (introduced in 6.0.0; earlier versions said "Requires workspace restart").

**Decision:** workspace settings default to "Global Setting" rather than a concrete value, so users set preferences once globally and only override per project when needed. This changed behaviour for existing users in 6.0.0 (hence the major version).

## Nova platform notes

Things learnt the hard way or not obvious from the docs.

- **Docs:** https://docs.nova.app. Many URLs guessed from API names 404; start from https://docs.nova.app/extensions/ and follow links. Useful: `/api-reference/task/`, `/api-reference/task-process-action/`, `/extensions/preferences/`, `/extensions/run-configurations/` (task templates), `/extensions/issue-matchers/`, `/extensions/getting-started/` (activation events).
- **Types:** `@types/nova-editor-node` (`node_modules/@types/nova-editor-node/index.d.ts`, one file) is the quickest API reference. Keep it current with `yarn install`.
- **Enum values needn't be strings.** The preferences docs say enum `values` are strings, but `null`, `true` and `false` work as stored values (tested in Nova, 6.0.0). The workspace settings rely on this.
- **`onWorkspaceContains` takes a glob.** An exact name (e.g. `maidfile`) won't match variants like `maidfile.toml`. The docs don't say whether matching is case-sensitive, so activation events list exact filenames in each case (tested in Nova, 6.0.1: `taskfile.yml`, `Taskfile.dist.yml`, `maidfile`, `maidfile.toml` activate; `maidfile.md` doesn't).
- **`nova.fs.watch`** docs don't say what path the callback receives (absolute or relative) or how the glob is matched. `isRootFile()` in `src/index.ts` handles both path forms; tested in Nova (6.0.1): root edits reload, `npm install` doesn't cause a burst of reloads.
- **`TaskProcessAction` defaults:** `cwd` defaults to the project folder; if `matchers` is omitted Nova applies its standard issue matchers. Passing `matchers` replaces that set.
- **`Task`** has only `name`, `image`, `buildBeforeRunning` and actions (`Task.Build`, `Task.Run`, `Task.Clean`). No description field. Any action not set disables that button/menu item for the task.
- **Timers:** `setTimeout`/`clearTimeout` exist in Nova's runtime. The main `tsconfig` limits `types` to `nova-editor-node` so Node's types (used by tests) don't change them.
- **`Process.onStdout` is line-based.** Buffer output and parse on exit rather than parsing each line as a complete document (`run()` in `src/process.ts` does this).
- **Shell and PATH.** Nova doesn't inherit the login shell environment by default; `shell: true` on `Process`/`TaskProcessAction` makes tools like `npm`, `task` and `maid` resolve from the user's `PATH`. The first match on `PATH` wins, so when debugging, check `zsh -lc 'which -a <tool>'` and restart Nova after changing `PATH`.
- **Command name collisions.** npm's `maid` package (egoist's markdown task runner, reads `maidfile.md`) is unrelated and exits 0 on errors. This extension targets theMackabu's `maid` (formerly exact-labs; `cargo install maid`).
- **maid versions.** ≤ 1.2 used `maid butler json`; 2.0 and the 0.4+ TypeScript rewrite (versions went down) use `maid --system json`, pretty-printed. Every crates.io release ≤ 2.0 is yanked.
- **Task `--json`** needs Task v3.19.1+. Use `name` (full namespaced name); the `task` field only exists from v3.44. Wildcard tasks (`start:*`) need an argument, so they're skipped.
- **Entitlements:** `filesystem: readonly` and `process: true` (to spawn `task`/`maid`). Adding write access or network would need new entitlements in `extension.json` and would show to users.
- **`min_runtime`** is `2.0`. The docs mark some APIs as added in later Nova versions (e.g. `Task.buildBeforeRunning`, Nova 5); check the version notes and consider raising `min_runtime` when using them.

## TypeScript quirks

- `src/globals.d.ts` re-declares `FileSystem.stat/open/watch`. TypeScript's DOM lib declares its own `FileSystem` interface, which wins the global binding and hides Nova's methods; re-declaring them as an interface merges them back. Keep this until the types or `tsconfig` `lib` change (setting `"lib": ["es2020"]` without DOM may make it unnecessary — test with `yarn lint`).
- `tsc` is only used for type checking (`yarn lint`); esbuild does the build and ignores type errors, so run `yarn lint` before releasing.

## Testing

- **Manual:** `tests/projects/` has one small project per case (each source, filename variants, wildcard/hidden tasks, root-only, the `maidfile.md` collision, all sources for settings toggles). Open each as its own project with the dev build; expected results are in `tests/README.md`. Every task only echoes.
- **Unit:** `yarn test` bundles `tests/unit/*.test.ts` with esbuild (`--platform=node`, output in gitignored `tests/.build`) and runs them with `node --test`. Bundling (rather than Node's own TypeScript support) keeps extensionless imports working and matches how the extension is built. Tests type-check via `tests/unit/tsconfig.json` (part of `yarn lint`). They cover `src/scripts.ts` and read inputs from `tests/projects/`. `yarn release` runs them first.
- **Parsers (not automated yet, IMPROVEMENTS #12):** parsers only touch Nova through a few globals (`nova.workspace.path`, `nova.workspace.config`, `nova.config`, `nova.fs.stat/open`, `nova.path`, `Process`, `Task`, `TaskProcessAction`), so stubbing those in Node and bundling a parser with `esbuild --platform=node` runs it against real files and binaries. This was used to verify 6.0.1 and 6.1.0.

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
