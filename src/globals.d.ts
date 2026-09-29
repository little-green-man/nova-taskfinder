/**
 * TypeScript's DOM library declares a legacy `FileSystem` interface that
 * collides with the one from @types/nova-editor-node. The DOM declaration
 * wins the global binding, hiding the file system methods extensions use.
 * Re-declare the needed members as an interface so they merge back into
 * the DOM declaration's type.
 */

interface FileSystem {
	stat(path: string): FileStats | null;
	open(path: string, mode?: string, encoding?: Encoding): FileBinaryMode | FileTextMode;
	watch(pattern: string | null, callable: (path: string) => void): FileSystemWatcher;
}
