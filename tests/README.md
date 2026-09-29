# Tests

## Manual test projects (`projects/`)

Small projects to open in Nova with the dev build (`yarn build && yarn activate`). Open each folder as its own project. The extension only reads files at the project root, so opening this repo won't pick them up.

Every task just echoes, so running any of them is safe.

Setup: `task` (`brew install go-task`, v3.19.1+), `maid` from theMackabu (`cargo install maid`; `which maid` must not point to npm's unrelated `maid`), `composer`, and `npm`/`yarn`.

| Project | Expected tasks | Not listed / checks |
| ------- | -------------- | ------------------- |
| `node-only` | `dev`, `build`, `prebuild`, `test`, `lint:fix` | Run a task with npm, then set Project Settings → Package Manager to yarn and check it uses `yarn <script>` without restarting |
| `composer-only` | `test`, `analyse`, `post-install-cmd` | — |
| `taskfile-only` | `build`, `docs.site`, `hello`, `db:migrate` | `start:*` (wildcard), `secret` (internal). Lowercase `taskfile.yml` activates the extension |
| `taskfile-dist` | `from-dist` | `Taskfile.dist.yml` activates the extension |
| `maidfile-only` | `hello`, `build` (⌘B) | `hidden` (`hide = true`), `_private` |
| `maidfile-plain` | `plain` | Extensionless `maidfile` activates the extension |
| `maidmd-only` | none | Extension doesn't activate (no "Starting TaskFinder" in the Extension Console) |
| `all-sources` | `node-task`, `composer-task`, `taskfile-task`, `maid-task` | Turn each source off and on in Project Settings (and extension preferences with Project Settings on "Global Setting"); each task list should change immediately |
| `root-only/child` | `child-task` | `parent-task` and `parent-maid` come from the parent folder and must not appear |

Also check, in any project:

- **Watcher:** add a task to the root file and save; the Tasks menu updates without reopening.
- **No reload storms:** `npm install` in `node-only` logs at most one `package.json has N task(s)` in the Extension Console.
- **maid collision:** with npm's `maid` first on `PATH`, `maidfile-only` shows no tasks and logs one "Maidfile: couldn't list tasks…" warning, not one per reload.
