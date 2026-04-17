import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as path from "path";

/** GitHub repository for gungraun-runner releases. */
export const GUNGRAUN_REPO = "gungraun/gungraun";

/** GitHub repository for valgrind-builder releases. */
export const VALGRIND_BUILDER_REPO = "gungraun/valgrind-builder";

export const VALGRIND_SOURCE_REPO = "https://sourceware.org/git/valgrind.git";

/** Marks the action as failed and exits the process. Never returns. */
export function bail(message: string): never {
    core.setFailed(message);
    process.exit(1);
}

/** Escapes special regex characters in a string. */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function execSudoWithOutput(...args: string[]): Promise<string> {
    const { stdout } = await exec.getExecOutput("sudo", args, {
        silent: true,
    });
    return stdout;
}

export async function execSudo(...args: string[]): Promise<void> {
    await exec.exec("sudo", args, {
        silent: true,
    });
}

export async function findBinary(dir: string, name: string): Promise<string | null> {
    const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
        if (entry.isFile() && entry.name === name) {
            // entry.parentPath is supported by node versions from 20 upwards
            return path.join(entry.parentPath, entry.name);
        }
    }
    return null;
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
    printInfo(`${label} installed: ${stdout.trim() || fallback || "version unknown"}`);
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

/** Runs an async function within a named log group, ensuring the group is closed. */
export async function withGroup<T>(name: string, fn: () => Promise<T>): Promise<T> {
    core.startGroup(name);
    try {
        return await fn();
    } finally {
        core.endGroup();
    }
}
