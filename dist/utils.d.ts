/** GitHub repository for gungraun-runner releases. */
export declare const GUNGRAUN_REPO = "gungraun/gungraun";
/** GitHub repository for valgrind-builder releases. */
export declare const VALGRIND_BUILDER_REPO = "gungraun/valgrind-builder";
export declare const VALGRIND_SOURCE_REPO = "https://sourceware.org/git/valgrind.git";
/** Marks the action as failed and exits the process. Never returns. */
export declare function bail(message: string): never;
/** Escapes special regex characters in a string. */
export declare function escapeRegex(str: string): string;
export declare function execSudoWithOutput(...args: string[]): Promise<string>;
export declare function execSudo(...args: string[]): Promise<void>;
export declare function findBinary(dir: string, name: string): Promise<string | null>;
/** Returns the cargo binary path, respecting the CARGO environment variable. */
export declare function getCargoBin(): string;
/** Logs the installed version of a binary, or a fallback string if unavailable. */
export declare function logInstalledVersion(binary: string, label: string, fallback?: string): Promise<void>;
export declare function normalizePath(path: string): string;
/** Logs a error message. */
export declare function printError(message: string): void;
/** Logs an informational message. */
export declare function printInfo(message: string): void;
/** Logs a warning message. */
export declare function printWarning(message: string): void;
export declare function splitOnce(str: string, sep: string): [string, string];
/** Runs an async function within a named log group, ensuring the group is closed. */
export declare function withGroup<T>(name: string, fn: () => Promise<T>): Promise<T>;
