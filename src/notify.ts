/**
 * User-facing notifications for problems that stop tasks being listed or run.
 * Each situation has an id: it's shown at most once per window, a repeat replaces it rather than stacking,
 * and clearNotification() removes it once the problem has gone.
 */

interface NotificationAction {
	title: string;
	run?: () => void;
}

const shown = new Set<string>();
const visible = new Set<string>();

const requestId = (id: string) => `taskfinder.${id}`;

function notify(id: string, title: string, body: string, actions: NotificationAction[] = []) {
	if (shown.has(id)) return;
	shown.add(id);
	visible.add(id);
	console.warn(`${title}: ${body}`);

	const all = [...actions, { title: 'Dismiss' }];
	const request = new NotificationRequest(requestId(id));
	request.title = title;
	request.body = body;
	request.actions = all.map((action) => action.title);

	nova.notifications.add(request).then(
		(response) => {
			visible.delete(id);
			const action = response.actionIdx === null ? undefined : all[response.actionIdx];
			action?.run?.();
		},
		(error) => {
			visible.delete(id);
			console.error(`Notification "${title}" failed: ${error}`);
		}
	);
}

/** Removes a notification if it's still showing, e.g. once the file is fixed or the tool is found. */
function clearNotification(id: string) {
	if (!visible.has(id)) return;
	visible.delete(id);
	nova.notifications.cancel(requestId(id));
}

/* Actions. Nova's notification buttons are small, so keep titles to a word or two and explain them in the body. */

const openUrl = (title: string, url: string): NotificationAction => ({ title, run: () => nova.openURL(url) });

const openRootFile = (file: string, line?: number): NotificationAction => ({
	title: 'Open File',
	run: () => {
		if (nova.workspace.path) nova.workspace.openFile(`${nova.workspace.path}/${file}`, line ? { line } : undefined);
	},
});

const setProjectSetting = (title: string, key: string, value: string | boolean): NotificationAction => ({
	title,
	run: () => nova.workspace.config.set(key, value),
});

const openProjectSettings: NotificationAction = { title: 'Settings', run: () => nova.workspace.openConfig() };

const installUrls: Record<string, string> = {
	npm: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm',
	yarn: 'https://yarnpkg.com/getting-started/install',
	pnpm: 'https://pnpm.io/installation',
	bun: 'https://bun.sh/docs/installation',
	composer: 'https://getcomposer.org/download/',
	task: 'https://taskfile.dev/installation/',
	maid: 'https://github.com/theMackabu/maid',
	just: 'https://just.systems/man/en/packages.html',
	deno: 'https://docs.deno.com/runtime/getting_started/installation/',
	make: 'https://developer.apple.com/xcode/resources/',
	php: 'https://php.new',
};

const howToInstall = (tool: string): NotificationAction => openUrl('Install', installUrls[tool]);

/** Turns a source off in Project Settings (`taskfinder.auto-<source>`); explain it in the notification body. */
const turnOff = (settingKey: string): NotificationAction => setProjectSetting('Turn Off', settingKey, false);

/** Removes showing notifications and forgets which were shown, so current problems notify again (Refresh Tasks, unit tests). */
function resetState() {
	visible.forEach((id) => nova.notifications.cancel(requestId(id)));
	shown.clear();
	visible.clear();
}

export { resetState, notify, clearNotification, openUrl, openRootFile, setProjectSetting, openProjectSettings, howToInstall, turnOff, installUrls };
export type { NotificationAction };
