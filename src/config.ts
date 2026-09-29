/**
 * Dual-scope config helpers: workspace value wins when explicitly set,
 * otherwise the global (extension preferences) value is used.
 */

type ConfigValue = string | boolean | number | string[] | null;

function getConfigWithWorkspaceOverride(name: string): ConfigValue | null {
	const workspaceValue = nova.workspace.config.get(name);
	return workspaceValue === null ? nova.config.get(name) : workspaceValue;
}

function observeConfigWithWorkspaceOverride(name: string, callback: () => void): Array<Disposable> {
	const recompute = () => callback();

	const workspaceDisposable = nova.workspace.config.onDidChange(name, recompute);
	const globalDisposable = nova.config.onDidChange(name, recompute);

	return [workspaceDisposable, globalDisposable];
}

export { getConfigWithWorkspaceOverride, observeConfigWithWorkspaceOverride };
