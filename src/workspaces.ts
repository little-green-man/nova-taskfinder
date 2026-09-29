/**
 * Pure rules for monorepo workspaces: which patterns a project declares, and which folders they match.
 * No Nova globals or imports (other than types), so they can be unit-tested in Node.
 */

import type { DenoJson, PackageJson } from './formats';

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** Patterns from package.json `workspaces`: an array (npm, Yarn 2+, bun) or `{ packages: [...] }` (Yarn 1). */
function packageJsonWorkspaces(json: PackageJson | null | undefined): string[] {
	const workspaces = json?.workspaces;
	if (Array.isArray(workspaces)) return strings(workspaces);
	if (typeof workspaces === 'object' && workspaces !== null) return strings((workspaces as { packages?: unknown }).packages);
	return [];
}

/**
 * Patterns from pnpm-workspace.yaml's `packages:` list. A small reader for that one key, not a YAML parser:
 * `- item` lines (quoted or not) after `packages:`, until the next top-level key.
 */
function pnpmWorkspaces(yaml: string | undefined): string[] {
	if (!yaml) return [];
	const patterns: string[] = [];
	let inPackages = false;
	yaml.split('\n').forEach((raw) => {
		const line = raw.replace(/\s+#.*$/, '');
		if (/^\S/.test(line)) {
			inPackages = /^packages\s*:\s*$/.test(line);
			return;
		}
		const item = inPackages ? line.match(/^\s+-\s+(['"]?)(.+?)\1\s*$/) : null;
		if (item) patterns.push(item[2]);
	});
	return patterns;
}

/** Member folders from deno.json `workspace`: an array, or `{ members: [...] }`. */
function denoWorkspaces(json: DenoJson | null | undefined): string[] {
	const workspace = json?.workspace;
	if (Array.isArray(workspace)) return strings(workspace);
	if (typeof workspace === 'object' && workspace !== null) return strings((workspace as { members?: unknown }).members);
	return [];
}

/* folders never searched for packages */
const skipped = (name: string) => name === 'node_modules' || name.startsWith('.');

/* `**` descends at most this far, so a stray pattern can't walk a huge tree */
const MAX_DEPTH = 5;

const clean = (pattern: string) =>
	pattern
		.trim()
		.replace(/^\.\//, '')
		.replace(/\/package\.json$/, '')
		.replace(/\/+$/, '');

const matcher = (segment: string) =>
	new RegExp(
		`^${segment
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*/g, '.*')
			.replace(/\?/g, '.')}$`
	);

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/**
 * Expands workspace patterns into member folders, relative to the root and sorted.
 * Supports literal paths, `*`/`?` within a segment, `**` for any depth, and `!pattern` exclusions.
 * `list(dir)` returns the names of a folder's subfolders ('' is the root).
 */
function expandWorkspaces(patterns: string[], list: (dir: string) => string[]): string[] {
	const descendants = (dir: string, depth = 0): string[] =>
		depth >= MAX_DEPTH
			? [dir]
			: [
					dir,
					...list(dir)
						.filter((name) => !skipped(name))
						.flatMap((name) => descendants(join(dir, name), depth + 1)),
				];

	const expand = (pattern: string): string[] =>
		clean(pattern)
			.split('/')
			.filter((segment) => segment !== '' && segment !== '.')
			.reduce<string[]>(
				(dirs, segment) => {
					if (segment === '**') return dirs.flatMap((dir) => descendants(dir));
					if (/[*?]/.test(segment)) {
						const match = matcher(segment);
						return dirs.flatMap((dir) =>
							list(dir)
								.filter((name) => !skipped(name) && match.test(name))
								.map((name) => join(dir, name))
						);
					}
					if (segment === '..') return [];
					return dirs.map((dir) => join(dir, segment));
				},
				['']
			);

	const included = patterns.filter((p) => !p.trim().startsWith('!')).flatMap(expand);
	const excluded = new Set(patterns.filter((p) => p.trim().startsWith('!')).flatMap((p) => expand(p.trim().slice(1))));
	return [...new Set(included)].filter((dir) => dir !== '' && !excluded.has(dir)).sort();
}

/** A member's task name: `<package name>: <task>`, using the manifest's name or else the folder. */
const memberTaskName = (manifestName: unknown, folder: string, task: string) =>
	`${typeof manifestName === 'string' && manifestName.trim() ? manifestName.trim() : folder}: ${task}`;

export { packageJsonWorkspaces, pnpmWorkspaces, denoWorkspaces, expandWorkspaces, memberTaskName };
