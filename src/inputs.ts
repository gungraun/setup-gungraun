import * as core from '@actions/core';
import { parse as parseShellArgs } from 'shell-quote';
import { ResolvedVersion, Version } from './version';
import { detectProjectVersion, detectTarget } from './detect';
import { fetchRunnerVersions, fetchSortedValgrindVersions } from './resolve';
import { splitOnce } from './utils';

export type ValgrindStrategy = 'builder' | 'system' | 'source' | 'none';
export type RunnerStrategy = 'binstall' | 'release' | 'source' | 'none';

export const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[] = [
    'builder',
    'none',
    'source',
    'system'
];
export const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[] = [
    'binstall',
    'none',
    'release',
    'source'
];
export const DEFAULT_VALGRIND_STRATEGY: string = 'builder,system,source';
export const DEFAULT_RUNNER_STRATEGY: string = 'binstall,release,source';

export interface Inputs {
    installBuildDeps: boolean;
    githubToken: string;
    runnerStrategies: RunnerStrategy[];
    runnerTarget: string;
    runnerVersion: Version;
    valgrindConfigureArgs: string[];
    valgrindMakeEnvs: Map<string, string>;
    valgrindStrategies: ValgrindStrategy[];
    valgrindUrl: URL;
    valgrindShaUrl: URL;
    valgrindVersion: Version;
}

export async function parseGithubToken(): Promise<string> {
    return core.getInput('github-token') || process.env.GITHUB_TOKEN?.trim() || '';
}

export async function parseInputs(): Promise<Inputs> {
    const githubToken = await parseGithubToken();
    const installBuildDeps = await parseInstallBuildDeps();
    const runnerStrategies = await parseRunnerStrategies();

    const isRunnerStrategyNone = runnerStrategies.includes('none');

    const runnerTarget = await parseRunnerTarget(isRunnerStrategyNone);
    const runnerVersion = await parseRunnerVersion(isRunnerStrategyNone, githubToken);

    const valgrindVersion = await parseValgrindVersion();
    const valgrindConfigureArgs = await parseValgrindConfigureArgs();
    const valgrindMakeEnvs = await parseValgrindMakeEnvs();
    const valgrindStrategies = await parseValgrindStrategies();
    const valgrindUrl = await parseValgrindUrl();
    const valgrindShaUrl = await parseValgrindShaUrl();

    return {
        githubToken,
        installBuildDeps,
        runnerStrategies,
        runnerTarget,
        runnerVersion,
        valgrindConfigureArgs,
        valgrindMakeEnvs,
        valgrindStrategies,
        valgrindUrl,
        valgrindShaUrl,
        valgrindVersion
    };
}

export async function parseRunnerTarget(isNoneStrategy: boolean): Promise<string> {
    if (isNoneStrategy) {
        return '';
    } else {
        return core.getInput('runner-target') || (await detectTarget());
    }
}

export async function parseRunnerStrategies(): Promise<RunnerStrategy[]> {
    try {
        return parseStrategies<RunnerStrategy>(
            core.getInput('runner-strategy') || DEFAULT_RUNNER_STRATEGY,
            VALID_RUNNER_STRATEGIES,
            'runner'
        );
    } catch (error) {
        throw new Error(`Invalid runner-strategy: ${(error as Error).message}`);
    }
}

export async function parseRunnerVersion(
    isNoneStrategy: boolean,
    githubToken: string
): Promise<Version> {
    if (isNoneStrategy) {
        return Version.auto();
    }

    const runnerVersionInput = core.getInput('runner-version') || 'auto';
    let runnerVersion: Version;

    if (runnerVersionInput.toLowerCase() === 'auto') {
        try {
            runnerVersion = await detectProjectVersion();
        } catch (error) {
            throw new Error(
                `Unable to detect gungraun-runner version: ${(error as Error).message}`
            );
        }
    } else {
        let validVersions: ResolvedVersion[];
        try {
            validVersions = await fetchRunnerVersions(githubToken);
            runnerVersion = Version.fromString(runnerVersionInput);
        } catch (error) {
            throw new Error(
                `Failed to fetch gungraun-runner versions: ${(error as Error).message}`
            );
        }

        if (
            !runnerVersion.isAutoOrLatest() &&
            !validVersions.some((v) => v.equals(runnerVersion))
        ) {
            throw new Error(
                `Invalid runner-version ${runnerVersionInput}: Valid versions are:
${validVersions.join(', ')}`
            );
        }
    }

    return runnerVersion;
}

export function parseStrategies<T extends string>(
    input: string,
    valid: readonly T[],
    label: string
): T[] {
    const strategies: Set<T> = new Set(
        input
            .split(',')
            .map((s) => s.trim().toLowerCase() as T)
            .filter((s) => s.length > 0)
    );

    if (strategies.size === 0) {
        return ['none' as T];
    }

    for (const s of strategies) {
        if (!valid.includes(s)) {
            throw new Error(`Invalid ${label} strategy '${s}'. Valid values: ${valid.join(', ')}`);
        } else if (s === 'none') {
            return ['none' as T];
        }
    }

    return Array.from(strategies);
}

export async function parseValgrindConfigureArgs(): Promise<string[]> {
    const input = core.getInput('valgrind-configure-args');
    if (!input) {
        return [];
    }

    const parsed = parseShellArgs(input) as (string | object)[];
    const args: string[] = [];
    for (const token of parsed) {
        if (typeof token !== 'string') {
            throw new Error(
                `Invalid valgrind-configure-args: other tokens than strings are not allowed`
            );
        }
        args.push(token);
    }

    return args;
}

export async function parseValgrindMakeEnvs(): Promise<Map<string, string>> {
    const input = core.getInput('valgrind-make-envs');
    if (!input) {
        return new Map();
    }

    const parsed = parseShellArgs(input) as (string | object)[];
    const envs: Map<string, string> = new Map();
    for (const token of parsed) {
        if (typeof token !== 'string') {
            throw new Error(
                `Invalid valgrind-make-envs: other tokens than strings are not allowed`
            );
        }

        const [key, value] = splitOnce(token, '=').map((t) => t.trim());
        envs.set(key, value);
    }

    return envs;
}

export async function parseValgrindStrategies(): Promise<ValgrindStrategy[]> {
    try {
        return parseStrategies<ValgrindStrategy>(
            core.getInput('valgrind-strategy') || DEFAULT_VALGRIND_STRATEGY,
            VALID_VALGRIND_STRATEGIES,
            'valgrind'
        );
    } catch (error) {
        throw new Error(`Invalid valgrind-strategy: ${(error as Error).message}`);
    }
}

export async function parseValgrindUrl(): Promise<URL> {
    try {
        return new URL(core.getInput('valgrind-url'));
    } catch (error) {
        throw new Error(`Invalid valgrind-url: ${(error as Error).message}`);
    }
}

export async function parseValgrindShaUrl(): Promise<URL> {
    try {
        return new URL(core.getInput('valgrind-sha-url'));
    } catch (error) {
        throw new Error(`Invalid valgrind-sha-url: ${(error as Error).message}`);
    }
}

export async function parseValgrindVersion(): Promise<Version> {
    let valgrindVersionInput: string;
    let valgrindVersion: Version;

    try {
        valgrindVersionInput = core.getInput('valgrind-version') || 'latest';
        valgrindVersion = Version.fromString(valgrindVersionInput);
    } catch (error) {
        throw new Error(`Invalid valgrind-version: ${(error as Error).message} `);
    }

    if (!valgrindVersion.isAutoOrLatest()) {
        let validVersions: ResolvedVersion[];
        try {
            validVersions = (await fetchSortedValgrindVersions()).filter(
                (v) => v.major >= 3 && v.minor >= 16
            );
        } catch {
            throw new Error(`Failed to validate valgrind version`);
        }

        if (!validVersions.some((v) => v.equals(valgrindVersion))) {
            throw new Error(`Invalid valgrind-version '${valgrindVersionInput}': \
Supported versions are: ${validVersions.join(', ')}`);
        }
    }

    return valgrindVersion;
}

export async function parseInstallBuildDeps(): Promise<boolean> {
    return core.getBooleanInput('install-build-deps') || false;
}
