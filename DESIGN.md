# Design

Architecture, design decisions and Nova knowledge needed to maintain Automatic Tasks (`littlegreenman.TaskFinder`). For user-facing docs see `README.md`; for history see `CHANGELOG.md`.

## What it does

Reads task definitions from project files and offers them in Nova's Tasks menu without the user writing task configs. Sources:

| Source   | Detected by (watch glob) | How tasks are read                        | Command run          |
| -------- | ------------------------ | ----------------------------------------- | -------------------- |
| Node     | `*package.json`          | Parse `scripts` in `package.json`         | `npm run <s>` / `yarn <s>` |
| Composer | `*composer.json`         | Parse `scripts` in `composer.json`        | `composer run <s>`   |
| Taskfile | `*Taskfile.*`            | Spawn `task --list-all`, regex the output | `task <name>`        |
| Maidfile | `*maidfile*`             | Spawn `maid butler json`, parse JSON      | `maid <name>`        |

Only root-level files are read.

## Repository layout

```
src/                         TypeScript source (the only code you edit)
  index.ts                   activation, feature registry, enable/disable/toggle
  config.ts                  workspace-over-global config helpers
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
esbuild.config.json          bundle config, read by esbuild-config
IMPROVEMENTS.md              backlog (gitignored, local only)
```

The bundle is a Nova extension folder, so `build/taskfinder.novaextension` *is* the shipped extension. Everything in it except `Scripts/` is source-controlled and edited by hand.

## Architecture

### Feature registry (`src/index.ts`)

Each source is a `Feature`: `{ key, Parser, name, glob, id }`.

- `key` — config key that turns the source on/off (`taskfinder.auto-<source>`).
- `Parser` — class implementing Nova's `TaskAssistant` (`provideTasks()`).
- `glob` — pattern for `nova.fs.watch`; changes trigger `nova.workspace.reloadTasks(id)`.
- `id` — Task Assistant identifier.

Lifecycle:

- `activate()` — for each feature, observe its config key (workspace and global) and call `toggle()`; also observe `taskfinder.package-manager`.
- `toggle()` — `enable()` or `disable()` based on the resolved config value.
- `enable()` — registers the Task Assistant and file watcher, stores both disposables in the module-level `active` map, and reloads tasks. No-op if already enabled.
- `disable()` — disposes that feature's assistant and watcher, removes it from `active`, reloads tasks.
- Package manager change — disable + enable the Node feature so a new `NodeTaskAssistant` reads the new value (the parser reads the setting once, in its constructor).
- `deactivate()` — disposes everything in `active`.

**Why an `active` map instead of `nova.subscriptions`:** features must be disposed and re-registered individually at runtime when settings change. `nova.subscriptions` has no per-item removal, so it only holds the config observers, which live for the whole session. Anything in `active` must be disposed in `deactivate()` or it leaks and can double-register on reload.

### Adding a source

1. Parser in `src/parsers/<source>.ts` implementing `provideTasks()` (sync array or `Promise`); export it from `src/parsers/index.ts`.
2. Add a `Feature` to `features` in `src/index.ts`.
3. `extension.json`:
   - `activationEvents`: `onWorkspaceContains:<glob>`.
   - `config` (global): boolean `taskfinder.auto-<source>`, default `true`.
   - `config-workspace`: enum `taskfinder.auto-<source>` with `[null, "Global Setting"], [true, "Enabled"], [false, "Disabled"]`, default `null`.
   - Update `description`.
4. `README.md`, `build/.../README.md`, `CHANGELOG.md`.

### Parser conventions

- File-based parsers (Node, Composer) read with `nova.fs.open(path).read()` and `JSON.parse`, inside `try/catch` that logs and returns what it has.
- CLI-based parsers (Taskfile, Maid) spawn a `Process` with `shell: true` (so the user's `PATH` is used), collect output, and resolve on `onDidExit`. On failure they must return `[]` — never `undefined`, never throw.
- Tasks use `TaskProcessAction` with `shell: true` and `cwd: nova.workspace.path`.
- Only Maidfile currently binds `Task.Build`; others bind `Task.Run`.

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
- **`onWorkspaceContains` takes a glob.** An exact name (e.g. `maidfile`) won't match variants like `maidfile.toml`.
- **`TaskProcessAction` defaults:** `cwd` defaults to the project folder; if `matchers` is omitted Nova applies its standard issue matchers. Passing `matchers` replaces that set.
- **`Task`** has only `name`, `image`, `buildBeforeRunning` and actions (`Task.Build`, `Task.Run`, `Task.Clean`). No description field.
- **`Process.onStdout` is line-based.** Buffer output and parse on exit rather than parsing each line as a complete document.
- **Shell and PATH.** Nova doesn't inherit the login shell environment by default; `shell: true` on `Process`/`TaskProcessAction` makes tools like `npm`, `task` and `maid` resolve from the user's `PATH`.
- **Command name collisions.** `maid` on Homebrew is an unrelated markdown task runner; exact-labs' `maid` (Maidfile) is what this extension targets.
- **Entitlements:** `filesystem: readonly` and `process: true` (to spawn `task`/`maid`). Adding write access or network would need new entitlements in `extension.json` and would show to users.
- **`min_runtime`** is `2.0`. The docs mark some APIs as added in later Nova versions (e.g. `Task.buildBeforeRunning`, Nova 5); check the version notes and consider raising `min_runtime` when using them.

## TypeScript quirks

- `src/globals.d.ts` re-declares `FileSystem.stat/open/watch`. TypeScript's DOM lib declares its own `FileSystem` interface, which wins the global binding and hides Nova's methods; re-declaring them as an interface merges them back. Keep this until the types or `tsconfig` `lib` change (setting `"lib": ["es2020"]` without DOM may make it unnecessary — test with `yarn lint`).
- `tsc` is only used for type checking (`yarn lint`); esbuild does the build and ignores type errors, so run `yarn lint` before releasing.

## Build and tooling

- `yarn build` — clean `Scripts/`, bundle `src/index.ts` → `Scripts/main.dist.js` (CJS, minified), copy `CHANGELOG.md` into the bundle.
- `yarn watch` — rebuild on change.
- `yarn lint` — `tsc --noEmit`.
- `yarn activate` — open the bundle in Nova as a dev extension. Disable the Extension Library copy first, and leave the window that opens minimised.
- `yarn release` — build, then `nova extension publish` (validates, asks to confirm, publishes). Don't name it `publish`: that's a built-in Yarn 1 command and would try to publish to npm.
- `nova extension validate build/taskfinder.novaextension` — validate without publishing.
- Formatting: Prettier (`.prettierrc.toml`) — tabs, single quotes, width 150.
- Yarn 1 (via Corepack). esbuild is 0.17 (below 0.25 has a dev-server advisory; `serve` isn't used, but bump when convenient).
- Extension logs: Nova → Extensions → Extension Console.

## Releasing

1. Update `CHANGELOG.md` (new `## Version X.Y` at the top, credit contributors with GitHub links).
2. Bump `version` in both `package.json` and `build/taskfinder.novaextension/extension.json` — they must match.
3. Update both READMEs if features or settings changed; add contributors to Acknowledgements in both.
4. `yarn lint`, `yarn build`, `nova extension validate build/taskfinder.novaextension`, test with `yarn activate`.
5. Merge to `master`, then `yarn release` (needs `nova extension login`; check with `nova extension whoami`).

Versioning: bump major when existing users' behaviour changes (e.g. setting defaults), minor for new sources/features, patch for fixes.

## Contributing workflow

- `master` requires an approving review to merge PRs.
- Contributor PRs usually come from the contributor's fork's `master`. With "Allow edits by maintainers" on, you can push follow-up commits to that branch; use the SSH URL (`git@github.com:<user>/nova-taskfinder.git`) if HTTPS auth fails.
- Don't add AI attribution to commits, PRs or docs.
