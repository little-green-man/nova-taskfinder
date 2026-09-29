import { readRootFile } from '../process';
import { denoTasks, parseJsonc } from '../recipes';
import { fileAssistant } from '../source';
import type { FileSource } from '../source';

/* deno.json wins if both exist */
export const denoFiles = ['deno.json', 'deno.jsonc'];

export const denoSource: FileSource = {
	id: 'deno',
	names: { tool: 'Deno', file: 'a deno.json', listing: 'Deno tasks', noun: 'tasks', turnOff: 'listing Deno tasks' },
	rootFiles: denoFiles,
	settingKey: 'taskfinder.auto-deno',
	installKey: 'deno',
	/* tasks are read from the file; deno is only needed to run them */
	tool: { command: 'deno', needed: 'run' },
	ids: { error: 'deno-invalid-json' },

	list(file) {
		let json: any;
		try {
			json = parseJsonc(readRootFile(file) ?? '{}');
		} catch (e) {
			const detail = (e as Error).message;
			return { kind: 'error', detail, body: `Deno tasks can't be listed until it's fixed: ${detail}` };
		}
		return { kind: 'ok', tasks: denoTasks(json).map((name) => ({ name, command: 'deno', args: ['task', name] })) };
	},
};

export default fileAssistant(denoSource);
