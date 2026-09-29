import { getConfigWithWorkspaceOverride } from '../config';
import type { DenoJson } from '../formats';
import { firstRootFile, listRootFolders, readRootFile } from '../process';
import { denoTasks, parseJsonc } from '../recipes';
import { fileAssistant } from '../source';
import type { FileSource, ListedTask } from '../source';
import { denoWorkspaces, expandWorkspaces, memberTaskName } from '../workspaces';

/* deno.json wins if both exist */
const denoRootFiles = ['deno.json', 'deno.jsonc'];

/**
 * Files whose changes reload Deno tasks: the root deno.json(c), plus each workspace member's found on the last read.
 * The feature registry holds this same array, so it's updated in place.
 */
export const denoFiles: string[] = [...denoRootFiles];

const asObject = (json: unknown): DenoJson | null => (typeof json === 'object' && json !== null ? (json as DenoJson) : null);

/** Tasks from workspace members (`<member>: <task>`, run in the member's folder), when Workspace Packages is on */
function workspaceTasks(json: unknown): ListedTask[] {
	const members = expandWorkspaces(denoWorkspaces(asObject(json)), listRootFolders)
		.map((folder) => ({ folder, file: firstRootFile(denoRootFiles.map((name) => `${folder}/${name}`)) }))
		.filter((member): member is { folder: string; file: string } => member.file !== undefined);
	denoFiles.splice(denoRootFiles.length, Infinity, ...members.map(({ file }) => file));

	return members.flatMap(({ folder, file }) => {
		let member: unknown;
		try {
			member = parseJsonc(readRootFile(file) ?? '{}');
		} catch (e) {
			console.error(`deno: skipping ${file}: ${(e as Error).message}`);
			return [];
		}
		return denoTasks(member).map((task) => ({
			name: memberTaskName(asObject(member)?.name, folder, task),
			command: 'deno',
			args: ['task', task],
			cwd: folder,
			script: task,
		}));
	});
}

export const denoSource: FileSource = {
	id: 'deno',
	names: { tool: 'Deno', file: 'a deno.json', listing: 'Deno tasks', noun: 'tasks', turnOff: 'listing Deno tasks' },
	rootFiles: denoRootFiles,
	settingKey: 'taskfinder.auto-deno',
	installKey: 'deno',
	/* tasks are read from the file; deno is only needed to run them */
	tool: { command: 'deno', needed: 'run' },
	ids: { error: 'deno-invalid-json' },

	list(file) {
		let json: unknown;
		try {
			json = parseJsonc(readRootFile(file) ?? '{}');
		} catch (e) {
			const detail = (e as Error).message;
			return { kind: 'error', detail, body: `Deno tasks can't be listed until it's fixed: ${detail}` };
		}

		const tasks: ListedTask[] = denoTasks(json).map((name) => ({ name, command: 'deno', args: ['task', name] }));
		if (getConfigWithWorkspaceOverride('taskfinder.workspace-packages') === true) tasks.push(...workspaceTasks(json));
		else denoFiles.splice(denoRootFiles.length);
		return { kind: 'ok', tasks };
	},
};

export default fileAssistant(denoSource);
