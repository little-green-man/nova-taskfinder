/**
 * The task sources as Nova sees them: each source's on/off setting, Task Assistant, and the files that trigger a reload.
 * See DESIGN.md → Feature registry.
 */

import {
	ArtisanParser,
	ComposerParser,
	DenoParser,
	JustParser,
	MaidfileParser,
	MakeParser,
	PackageJsonParser,
	TaskfileParser,
	artisanFiles,
	artisanSource,
	composerSource,
	denoFiles,
	denoSource,
	justFiles,
	justSource,
	maidSource,
	maidfileFiles,
	makeFiles,
	makeSource,
	nodeFiles,
	nodeSource,
	taskfileFiles,
	taskfileSource,
	VscodeParser,
	vscodeFiles,
	vscodeSource,
} from './parsers';
import type { Source } from './source';

/** A Nova Task Assistant: what Nova calls to list a source's tasks */
type Assistant = new () => { provideTasks(): Task[] | Promise<Task[]> };

interface Feature {
	/** `taskfinder.auto-<source>`: turns the source on or off (from the source definition) */
	key: string;
	Parser: Assistant;
	/** The Tasks menu heading for this source's tasks (and in logs); matches its Task Sources title in the settings */
	name: string;
	/** Patterns for nova.fs.watch */
	globs: string[];
	/** Paths relative to the root whose changes reload the source */
	files: string[];
	/** Task Assistant identifier. Keep these stable: Nova may remember state per assistant */
	id: string;
	/** Listing settings the source reads; changing one reloads it */
	settings?: string[];
}

const feature = (source: Source, Parser: Assistant, details: Omit<Feature, 'key' | 'Parser'>): Feature => ({
	key: source.settingKey,
	Parser,
	...details,
});

const features: Feature[] = [
	feature(nodeSource, PackageJsonParser, {
		name: 'Node (package.json)',
		/* lockfiles and package manager config change which package manager runs the scripts */
		globs: ['*package.json', '*.lock', '*.lockb', '*lock.yaml', '*-lock.json', '*shrinkwrap.json', '*.yarnrc.yml', '*.npmrc', '*pnpm-workspace.yaml'],
		/* nodeFiles also gains workspace packages' package.json when Workspace Packages is on */
		files: nodeFiles,
		id: 'taskfinder-tasks-node',
		settings: ['taskfinder.package-manager', 'taskfinder.show-lifecycle-scripts', 'taskfinder.workspace-packages'],
	}),
	feature(composerSource, ComposerParser, {
		name: 'Composer (composer.json)',
		globs: ['*composer.json'],
		files: ['composer.json'],
		id: 'taskfinder-tasks-composer',
		settings: ['taskfinder.show-lifecycle-scripts'],
	}),
	feature(taskfileSource, TaskfileParser, {
		name: 'Taskfile',
		globs: ['*askfile*'],
		files: taskfileFiles,
		id: 'taskfinder-tasks-taskfile',
	}),
	feature(maidSource, MaidfileParser, {
		name: 'Maidfile',
		globs: ['*aidfile*'],
		files: maidfileFiles,
		id: 'taskfinder-tasks-maidfile',
		settings: ['taskfinder.maid-path'],
	}),
	feature(justSource, JustParser, {
		name: 'just (justfile)',
		globs: ['*ustfile', '*USTFILE'],
		files: justFiles,
		id: 'taskfinder-tasks-just',
		settings: ['taskfinder.just-confirm-recipes'],
	}),
	feature(denoSource, DenoParser, {
		name: 'Deno (deno.json)',
		globs: ['*deno.json*'],
		files: denoFiles,
		id: 'taskfinder-tasks-deno',
		settings: ['taskfinder.workspace-packages'],
	}),
	feature(makeSource, MakeParser, {
		name: 'Make (Makefile)',
		/* makeFiles also gains the Makefile's literal includes; only *.mk includes are watched */
		globs: ['*akefile', '*.mk'],
		files: makeFiles,
		id: 'taskfinder-tasks-make',
		settings: ['taskfinder.make-listing'],
	}),
	feature(artisanSource, ArtisanParser, {
		name: 'Laravel (artisan)',
		globs: ['*artisan', '*console.php', '*composer.lock'],
		files: artisanFiles,
		id: 'taskfinder-tasks-artisan',
		settings: ['taskfinder.artisan-commands'],
	}),
	feature(vscodeSource, VscodeParser, {
		name: 'VS Code (.vscode/tasks.json)',
		/* only .vscode/tasks.json reloads; other tasks.json files are ignored by the files filter */
		globs: ['*tasks.json'],
		files: vscodeFiles,
		id: 'taskfinder-tasks-vscode',
		/* npm tasks run with the project's package manager */
		settings: ['taskfinder.package-manager'],
	}),
];

export { features };
export type { Feature };
