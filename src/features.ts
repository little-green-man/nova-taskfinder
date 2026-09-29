/**
 * The task sources: their on/off setting, Task Assistant, and the files that trigger a reload.
 * See DESIGN.md → Feature registry.
 */

import {
	ComposerParser,
	PackageJsonParser,
	TaskfileParser,
	MaidfileParser,
	JustParser,
	DenoParser,
	MakeParser,
	ArtisanParser,
	taskfileFiles,
	maidfileFiles,
	justFiles,
	denoFiles,
	makeFiles,
	artisanFiles,
} from './parsers';
import { packageManagerFiles } from './scripts';

/** A Nova Task Assistant: what Nova calls to list a source's tasks */
type Assistant = new () => { provideTasks(): Task[] | Promise<Task[]> };

interface Feature {
	/** `taskfinder.auto-<source>`: turns the source on or off */
	key: string;
	Parser: Assistant;
	name: string;
	globs: Array<string>;
	files: Array<string>;
	id: string;
	/** Listing settings the source reads; changing one reloads it */
	settings?: string[];
}

const features: Feature[] = [
	{
		key: 'taskfinder.auto-node',
		Parser: PackageJsonParser,
		name: 'package.json',
		/* lockfiles and package manager config change which package manager runs the scripts */
		globs: ['*package.json', '*.lock', '*.lockb', '*lock.yaml', '*-lock.json', '*shrinkwrap.json', '*.yarnrc.yml', '*.npmrc', '*pnpm-workspace.yaml'],
		files: ['package.json', ...packageManagerFiles],
		id: 'taskfinder-tasks-node',
		settings: ['taskfinder.package-manager', 'taskfinder.show-lifecycle-scripts'],
	},
	{
		key: 'taskfinder.auto-composer',
		Parser: ComposerParser,
		name: 'composer.json',
		globs: ['*composer.json'],
		files: ['composer.json'],
		id: 'taskfinder-tasks-composer',
		settings: ['taskfinder.show-lifecycle-scripts'],
	},
	{
		key: 'taskfinder.auto-taskfile',
		Parser: TaskfileParser,
		name: 'Taskfile',
		globs: ['*askfile*'],
		files: taskfileFiles,
		id: 'taskfinder-tasks-taskfile',
	},
	{
		key: 'taskfinder.auto-maidfile',
		Parser: MaidfileParser,
		name: 'Maidfile',
		globs: ['*aidfile*'],
		files: maidfileFiles,
		id: 'taskfinder-tasks-maidfile',
	},
	{
		key: 'taskfinder.auto-just',
		Parser: JustParser,
		name: 'justfile',
		globs: ['*ustfile', '*USTFILE'],
		files: justFiles,
		id: 'taskfinder-tasks-just',
		settings: ['taskfinder.just-confirm-recipes'],
	},
	{
		key: 'taskfinder.auto-deno',
		Parser: DenoParser,
		name: 'deno.json',
		globs: ['*deno.json*'],
		files: denoFiles,
		id: 'taskfinder-tasks-deno',
	},
	{
		key: 'taskfinder.auto-make',
		Parser: MakeParser,
		name: 'Makefile',
		/* makeFiles also gains the Makefile's literal includes; only *.mk includes are watched */
		globs: ['*akefile', '*.mk'],
		files: makeFiles,
		id: 'taskfinder-tasks-make',
		settings: ['taskfinder.make-listing'],
	},
	{
		key: 'taskfinder.auto-artisan',
		Parser: ArtisanParser,
		name: 'artisan',
		globs: ['*artisan', '*console.php', '*composer.lock'],
		files: artisanFiles,
		id: 'taskfinder-tasks-artisan',
		settings: ['taskfinder.artisan-commands'],
	},
];

export { features };
export type { Feature };
