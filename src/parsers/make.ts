import { getConfigWithWorkspaceOverride } from '../config';
import { diagnoseMake } from '../diagnose';
import { readRootFile, run } from '../process';
import { makeRulesFromDatabase, makeRulesFromText, makeTargets } from '../recipes';
import type { MakeRules } from '../recipes';
import { cliAssistant } from '../source';
import type { CliSource } from '../source';

/* GNU make looks for GNUmakefile, makefile, then Makefile; Makefile is listed before makefile as the usual spelling (see firstRootFile) */
const makefileNames = ['GNUmakefile', 'Makefile', 'makefile'];

/**
 * Files whose changes reload Make tasks: the Makefile names, plus literal `include`s found on the last read.
 * The feature registry holds this same array, so it's updated in place.
 */
export const makeFiles: string[] = [...makefileNames];

/* Make's database is complete but evaluates the Makefile ($(shell …)); reading the file runs nothing */
const usesDatabase = () => getConfigWithWorkspaceOverride('taskfinder.make-listing') !== 'file';

/** The Makefile and its literal includes, read as text. Also refreshes the watched include files. */
function readRules(makefile: string): MakeRules {
	const rules = makeRulesFromText(readRootFile(makefile) ?? '');
	const includes = rules.includes.filter((file) => readRootFile(file) !== undefined);
	makeFiles.splice(makefileNames.length, Infinity, ...includes);

	includes.forEach((file) => {
		const included = makeRulesFromText(readRootFile(file) ?? '');
		rules.targets.push(...included.targets);
		rules.phony.push(...included.phony);
	});
	return rules;
}

export const makeSource: CliSource = {
	id: 'make',
	names: { tool: 'make', file: 'a Makefile', listing: 'Make targets', noun: 'targets', turnOff: 'reading the Makefile' },
	rootFiles: makefileNames,
	settingKey: 'taskfinder.auto-make',
	installKey: 'make',
	/* make itself is only needed to list in database mode */
	tool: () => (usesDatabase() ? { command: 'make', needed: 'list' } : undefined),
	ids: { error: 'makefile-error' },

	async list(makefile) {
		/* always read the text too: it finds the literal includes to watch */
		let rules = readRules(makefile);

		if (usesDatabase()) {
			/* the `:` goal stops make choosing a default goal, so nothing is built */
			const diagnosis = diagnoseMake(await run('make', ['-pRrq', '-f', makefile, ':']));
			if (diagnosis.kind !== 'ok') return diagnosis;
			rules = makeRulesFromDatabase(diagnosis.value);
		}

		return { kind: 'ok', tasks: makeTargets(rules).map((target) => ({ name: target, command: 'make', args: [target] })) };
	},
};

export default cliAssistant(makeSource);
