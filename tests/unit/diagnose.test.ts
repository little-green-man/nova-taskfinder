import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diagnoseMaid, diagnoseTaskfile, errorDetail } from '../../src/diagnose';

/* Output captured from Task 3.53.1, maid 0.5.0 (theMackabu) and npm's maid 0.3.0 */
const taskYamlError = "task: Failed to parse Taskfile.yml:\nyaml: line 2: did not find expected ',' or ']'\n";
const maidTomlError = 'error: Invalid TOML document: incomplete key-value: cannot find end of key\n\n1:  [tasks.hello\n     ^\n2:  script = "echo"\n';
const maidTaskNotFound = "error: Could not find the task 'butler'. Does it exist?\n";
const npmMaidHelp = '\n  maid 0.3.0\n\n  Markdown driven task runner.\n';

test('errorDetail: first line, plus the next when it ends with a colon, without tool prefixes', () => {
	assert.equal(errorDetail(taskYamlError, 'x'), "Failed to parse Taskfile.yml: yaml: line 2: did not find expected ',' or ']'");
	assert.equal(errorDetail(maidTomlError, 'x'), 'Invalid TOML document: incomplete key-value: cannot find end of key');
	assert.equal(errorDetail('', 'fallback'), 'fallback');
	assert.equal(errorDetail('\n  \n', 'fallback'), 'fallback');
	assert.equal(errorDetail('a'.repeat(400), 'x').length, 300);
});

test('diagnoseTaskfile: tasks listed', () => {
	const result = diagnoseTaskfile({ status: 0, stdout: '{"tasks":[{"name":"build"}],"location":"/p/Taskfile.yml"}', stderr: '' });
	assert.deepEqual(result, { kind: 'ok', value: [{ name: 'build' }] });
});

test('diagnoseTaskfile: Taskfile error', () => {
	assert.deepEqual(diagnoseTaskfile({ status: 109, stdout: '', stderr: taskYamlError }), {
		kind: 'error',
		detail: "Failed to parse Taskfile.yml: yaml: line 2: did not find expected ',' or ']'",
	});
	assert.deepEqual(diagnoseTaskfile({ status: 1, stdout: '', stderr: '' }), { kind: 'error', detail: 'task exited with status 1' });
});

test('diagnoseTaskfile: Task too old for --json', () => {
	assert.deepEqual(diagnoseTaskfile({ status: 1, stdout: 'Usage: task [flags...]', stderr: 'unknown flag: --json\n' }), { kind: 'old-version' });
	assert.deepEqual(diagnoseTaskfile({ status: 2, stdout: '', stderr: 'flag provided but not defined: -json\n' }), { kind: 'old-version' });
});

test('diagnoseTaskfile: exit 0 without JSON is an error, not a crash', () => {
	assert.equal(diagnoseTaskfile({ status: 0, stdout: 'not json', stderr: '' }).kind, 'error');
});

test('diagnoseMaid: current maid lists tasks on the first attempt', () => {
	const result = diagnoseMaid([{ status: 0, stdout: '{\n  "tasks": {\n    "build": { "script": "x" }\n  }\n}\n', stderr: '' }]);
	assert.equal(result.kind, 'ok');
});

test('diagnoseMaid: legacy maid lists tasks on the second attempt', () => {
	const result = diagnoseMaid([
		{ status: 2, stdout: '', stderr: "error: unexpected argument '--system' found\n" },
		{ status: 0, stdout: '{"tasks":{"build":{}}}', stderr: '' },
	]);
	assert.equal(result.kind, 'ok');
});

test("diagnoseMaid: npm's maid exits 0 without JSON", () => {
	assert.deepEqual(
		diagnoseMaid([
			{ status: 0, stdout: npmMaidHelp, stderr: '' },
			{ status: 0, stdout: '', stderr: "TypeError: Cannot read properties of undefined (reading 'references')\n" },
		]),
		{ kind: 'wrong-tool' }
	);
});

test('diagnoseMaid: broken maidfile reports the first error', () => {
	assert.deepEqual(
		diagnoseMaid([
			{ status: 1, stdout: '', stderr: maidTomlError },
			{ status: 1, stdout: '', stderr: maidTomlError },
		]),
		{ kind: 'error', detail: 'Invalid TOML document: incomplete key-value: cannot find end of key' }
	);
	assert.equal(diagnoseMaid([{ status: 1, stdout: '', stderr: maidTaskNotFound }]).kind, 'error');
});
