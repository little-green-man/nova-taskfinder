import { getConfigWithWorkspaceOverride } from '../config';
import { diagnoseMake } from '../diagnose';
import { clearNotification, howToInstall, notify, openRootFile, turnOff } from '../notify';
import { fileExists, firstRootFile, isInstalled, readTextFile, run } from '../process';
import { makeRulesFromDatabase, makeRulesFromText, makeTargets } from '../recipes';
import type { MakeRules } from '../recipes';
import { createTask } from '../tasks';

/* GNU make looks for GNUmakefile, makefile, then Makefile; Makefile is listed before makefile as the usual spelling (see firstRootFile) */
const makefileNames = ['GNUmakefile', 'Makefile', 'makefile'];

/**
 * Files whose changes reload Make tasks: the Makefile names, plus literal `include`s found on the last read.
 * The feature registry holds this same array, so it's updated in place.
 */
export const makeFiles: string[] = [...makefileNames];

class Make {
	packageProcessName: string = 'make';

	readFile(file: string): string | undefined {
		try {
			if (fileExists(`${nova.workspace.path}/${file}`)) return readTextFile(`${nova.workspace.path}/${file}`);
		} catch (e) {
			console.error(`Make: couldn't read ${file}: ${e}`);
		}
		return undefined;
	}

	/* The Makefile and its literal includes, read as text. Also refreshes the watched files. */
	readRules(makefile: string): MakeRules {
		const rules = makeRulesFromText(this.readFile(makefile) ?? '');
		const includes = rules.includes.filter((file) => this.readFile(file) !== undefined);
		makeFiles.splice(makefileNames.length, Infinity, ...includes);

		includes.forEach((file) => {
			const included = makeRulesFromText(this.readFile(file) ?? '');
			rules.targets.push(...included.targets);
			rules.phony.push(...included.phony);
		});
		return rules;
	}

	async provideTasks() {
		const makefile = firstRootFile(makefileNames);
		if (!makefile) return [];

		/* Reading the file runs nothing; make's database is complete but runs the Makefile's $(shell …) */
		const textRules = this.readRules(makefile);
		let rules = textRules;

		if (getConfigWithWorkspaceOverride('taskfinder.make-listing') !== 'file') {
			if (!(await isInstalled(this.packageProcessName))) {
				notify(
					'make-missing',
					"make isn't installed",
					"This project has a Makefile, but make isn't on your PATH, so its targets can't be listed. Turn Off stops reading the Makefile in this project.",
					[howToInstall('make'), turnOff('taskfinder.auto-make')]
				);
				return [];
			}

			/* the `:` goal stops make choosing a default goal, so nothing is built */
			const diagnosis = diagnoseMake(await run(this.packageProcessName, ['-pRrq', '-f', makefile, ':']));
			if (diagnosis.kind === 'error') {
				notify('makefile-error', `${makefile} has an error`, `Make targets can't be listed: ${diagnosis.detail}`, [openRootFile(makefile)]);
				return [];
			}
			if (diagnosis.kind !== 'ok') return [];
			clearNotification('makefile-error');
			rules = makeRulesFromDatabase(diagnosis.value);
		}

		const tasks = makeTargets(rules).map((target) => createTask(target, this.packageProcessName, [target]));
		console.info(`${makefile} has ${tasks.length} target(s)`);
		return tasks;
	}
}

export default Make;
