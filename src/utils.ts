import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

/** GitHub repository for gungraun-runner releases. */
export const GUNGRAUN_REPO = 'gungraun/gungraun';

/** GitHub repository for valgrind-builder releases. */
export const VALGRIND_BUILDER_REPO = 'gungraun/valgrind-builder';

export const VALGRIND_SOURCE_REPO = 'https://sourceware.org/git/valgrind.git';

export function isDebug(): boolean {
    return (
        !!process.env.GUNGRAUN_ACTION_DEBUG ||
        process.env.ACTIONS_STEP_DEBUG === 'true' ||
        process.env.RUNNER_DEBUG === '1'
    );
}

/** Marks the action as failed and exits the process. Never returns. */
export function bail(message: string): never {
    core.setFailed(message);
    process.exit(1);
}

export function isRoot(): boolean {
    return process.getuid?.() === 0;
}

export async function execPrivileged(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string> }
): Promise<void> {
    const execOpts: exec.ExecOptions = { silent: !isDebug() };

    if (opts?.cwd) {
        execOpts.cwd = opts.cwd;
    }
    if (opts?.env) {
        execOpts.env = { ...(process.env as Record<string, string>), ...opts.env };
    }
    if (isRoot()) {
        await exec.exec(cmd, args, execOpts);
    } else {
        await exec.exec('sudo', [cmd, ...args], execOpts);
    }
}

export async function execPrivilegedWithOutput(
    cmd: string,
    args: string[],
    opts?: { env?: Record<string, string>; silent?: boolean }
): Promise<string> {
    const execOpts: exec.ExecOptions = { silent: opts?.silent ?? !isDebug() };

    if (opts?.env) {
        execOpts.env = { ...(process.env as Record<string, string>), ...opts.env };
    }
    if (isRoot()) {
        const { stdout } = await exec.getExecOutput(cmd, args, execOpts);
        return stdout;
    }
    const { stdout } = await exec.getExecOutput('sudo', [cmd, ...args], execOpts);
    return stdout;
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
    return process.env.CARGO || 'cargo';
}

/** Logs the installed version of a binary, or a fallback string if unavailable. */
export async function logInstalledVersion(binary: string, label: string): Promise<void> {
    const { stdout } = await exec.getExecOutput(binary, ['--version'], {
        silent: !isDebug(),
        ignoreReturnCode: true
    });
    printInfo(`${label} installed: ${stdout.trim() || 'version unknown'}`);
}

export function normalizePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.length > 2) {
        return trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
    } else {
        return trimmed.startsWith('./') ? '.' : trimmed;
    }
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

/** Logs a debug message if debugging is enabled */
export function printDebug(message: string): void {
    if (isDebug()) {
        console.log(message);
    }
}

export function randNumber(min: number = 0, max: number) {
    return Math.floor(Math.random() * (max - min)) + min;
}

export async function retry<T>(maxRetries: number, fn: () => Promise<T>) {
    for (let index = 0; ; index++) {
        try {
            return await fn();
        } catch (error) {
            if (index < maxRetries) {
                await new Promise<void>((r) => setTimeout(r, randNumber(5000, 20000)));
                continue;
            } else {
                throw error;
            }
        }
    }
}

export function splitOnce(str: string, sep: string): [string, string] {
    const i = str.indexOf(sep);
    if (i === -1) return [str, ''];
    return [str.slice(0, i), str.slice(i + sep.length)];
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
