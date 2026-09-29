# Tests

## Unit tests (`unit/`)

`yarn test` bundles `unit/*.test.ts` with esbuild and runs them with `node --test`. They cover the naming rules in `src/scripts.ts` and use the scripts in `projects/` as inputs, so keep the two in sync.

## Manual test projects (`projects/`)

Small projects to open in Nova with the dev build (`yarn build && yarn activate`). Open each folder as its own project; `yarn pop-tests` opens them all (with `root-only/child` rather than `root-only`). The extension only reads files at the project root, so opening this repo won't pick them up.

Every task just echoes, so running any of them is safe.

Setup: `task` (`brew install go-task`, v3.19.1+), `maid` from theMackabu (`cargo install maid`; `which maid` must not point to npm's unrelated `maid`), `composer`, and `npm`, `yarn`, `pnpm` (and `bun` to run bun tasks; without it, `bun-lockfile` should log a missing-tool warning).

| Project | Expected tasks | Not listed / checks |
| ------- | -------------- | ------------------- |
| `node-only` | `dev`, `build`, `test`, `lint:fix`, `clean`, `build:css`, `rebuild-cache` | `prebuild`, `postinstall` hidden. `build`/`build:css` run with ⌘B, `clean` with ⇧⌘K, `rebuild-cache` Run only; every task runs with ⌘R. Turning on Show Lifecycle Scripts (preferences, and Project Settings) lists the hidden ones immediately. Log shows `Node: using npm (from default)`. Set Package Manager to yarn and check it uses `yarn run <script>` without restarting |
| `composer-only` | `test`, `analyse`, `clean` (⇧⌘K), `init` | `post-install-cmd` hidden (shown with Show Lifecycle Scripts); `init` is a plugin event name, so stays listed |
| `yarn-berry` | `build`, `prebuild` | yarn (from `packageManager`). `postinstall` hidden. `prebuild` is listed because Yarn 2+ doesn't run pre/post scripts. With Package Manager npm, `prebuild` is hidden |
| `pnpm-lockfile` | `build`, `test` | pnpm (from `pnpm-lock.yaml`); runs `pnpm run <script>`. `prebuild` hidden (pnpm 9+ runs hooks). Delete `pnpm-lock.yaml` → switches to npm without reopening (restore it after) |
| `bun-lockfile` | `build`, `dev` | bun (from `bun.lock`); runs `bun run build` (not the bundler). Without bun installed: notification "bun isn't installed" with Install and Use npm (which switches the project to npm and clears the notification); tasks still listed |
| `package-manager-field` | `build`, `prebuild` | pnpm (from `packageManager`) despite `package-lock.json`; notification about lockfiles for several package managers, with Settings. `prebuild` listed (pnpm 8 doesn't run hooks) |
| `broken-json` | none | Notifications: "package.json has an error" and "composer.json has an error", each with Open File. Fix a file and save: its notification disappears and tasks appear (undo afterwards) |
| `broken-taskfile` | none | Notification "Taskfile.yml has an error" with the YAML error and Open File |
| `broken-maidfile` | none | Notification "maidfile.toml has an error" with the TOML error and Open File |
| `dev-engines` | `info`, `dev` | yarn (from `devEngines`). Running `info` echoes the script, not `yarn info`. `version` hidden (npm lifecycle name) |
| `taskfile-only` | `build` (⌘B and ⌘R), `docs.site`, `hello`, `db:migrate` | `start:*` (wildcard), `secret` (internal). Lowercase `taskfile.yml` activates the extension |
| `taskfile-dist` | `from-dist` | `Taskfile.dist.yml` activates the extension |
| `maidfile-only` | `hello`, `build` (⌘B and ⌘R) | `hidden` (`hide = true`), `_private` |
| `maidfile-plain` | `plain` | Extensionless `maidfile` activates the extension |
| `maidmd-only` | none | Extension doesn't activate (no "Starting TaskFinder" in the Extension Console) |
| `all-sources` | `node-task`, `composer-task`, `taskfile-task`, `maid-task` | Turn each source off and on in Project Settings (and extension preferences with Project Settings on "Global Setting"); each task list should change immediately |
| `root-only/child` | `child-task` | `parent-task` and `parent-maid` come from the parent folder and must not appear |

Also check, in any project:

- **Watcher:** add a task to the root file and save; the Tasks menu updates without reopening.
- **No reload storms:** `npm install` in `node-only` logs at most one `package.json has N task(s)` in the Extension Console.
- **Debounce:** save the root `package.json` several times quickly; one reload is logged.
- **maid collision:** with npm's `maid` first on `PATH`, `maidfile-only` shows no tasks and one "A different maid is installed" notification, not one per reload.
- **Missing tools:** temporarily hide `task`, `maid` or `composer` from `PATH` (then restart Nova) to see their "isn't installed" notifications; Turn Off … sets that source to Disabled in Project Settings.
