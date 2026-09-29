# Fixtures

Real tool output captured for the unit tests (`tests/unit/`). Paths are anonymised (`/project`, `/home`), and make's database has its environment section replaced, since it lists every environment variable. Never commit raw output.

Captured with: Task 3.53.1, maid 0.5.0 (theMackabu) and npm's maid 0.3.0, just 1.58.0, GNU Make 3.81, and a fresh Laravel app (artisan list trimmed to 21 commands; the error is from a syntax error in `routes/console.php`). The Laravel list lives in `tests/projects/laravel/artisan-list.json`, so the fake `artisan` there can print it too.

Re-capture when a tool's output format changes, and re-run `yarn test`.
