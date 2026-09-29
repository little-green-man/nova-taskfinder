import { readRootFile } from '../process';
import { isComposerEvent } from '../scripts';
import { fileAssistant } from '../source';
import type { FileSource } from '../source';
import { showLifecycleScripts } from '../tasks';

export const composerSource: FileSource = {
	id: 'composer',
	names: { tool: 'Composer', file: 'a composer.json', listing: 'Composer tasks', noun: 'tasks', turnOff: 'listing Composer tasks' },
	rootFiles: ['composer.json'],
	settingKey: 'taskfinder.auto-composer',
	installKey: 'composer',
	/* scripts are read from the file; composer is only needed to run them */
	tool: { command: 'composer', needed: 'run' },
	ids: { error: 'composer-invalid-json' },

	list(file) {
		let json: any;
		try {
			json = JSON.parse(readRootFile(file) ?? '{}');
		} catch (e) {
			const detail = (e as Error).message;
			return { kind: 'error', detail, body: `Composer tasks can't be listed until it's fixed: ${detail}` };
		}

		const showEvents = showLifecycleScripts();
		const names = Object.keys(json?.scripts ?? {}).filter((name) => showEvents || !isComposerEvent(name));
		return { kind: 'ok', tasks: names.map((name) => ({ name, command: 'composer', args: ['run', name] })) };
	},
};

export default fileAssistant(composerSource);
