import * as core from "@actions/core";
import * as exec from "@actions/exec";

/** GitHub repository for gungraun-runner releases. */
export const GITHUB_REPO = "gungraun/gungraun";

/** GitHub repository for valgrind-builder releases. */
export const VALGRIND_REPO = "gungraun/valgrind-builder";

/** Ends the current log group. */
export function endGroup(): void {
    core.endGroup();
}

/** Returns the cargo binary path, respecting the CARGO environment variable. */
export function getCargoBin(): string {
    return process.env.CARGO || "cargo";
}

/** Logs the installed version of a binary, or a fallback string if unavailable. */
export async function logInstalledVersion(
    binary: string,
    label: string,
    fallback?: string,
): Promise<void> {
    const { stdout } = await exec.getExecOutput(binary, ["--version"], {
        silent: true,
        ignoreReturnCode: true,
    });
    core.info(`${label} installed: ${stdout.trim() || fallback || "version unknown"}`);
}

/** Marks the action as failed and exits the process. Never returns. */
export function bail(message: string): never {
    core.setFailed(message);
    process.exit(1);
}

/** Logs a error message. */
export function printError(message: string): void {
    core.error(message);
}

/** Logs an informational message. */
export function printInfo(message: string): void {
    core.info(message);
}

/** Logs a warning message. */
export function printWarning(message: string): void {
    core.warning(message);
}

/** Starts a new log group. */
export function startGroup(name: string): void {
    core.startGroup(name);
}

/** Runs an async function within a named log group, ensuring the group is closed. */
export async function withGroup<T>(name: string, fn: () => Promise<T>): Promise<T> {
    startGroup(name);
    try {
        return await fn();
    } finally {
        endGroup();
    }
}
