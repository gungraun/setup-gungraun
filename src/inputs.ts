import * as core from "@actions/core";
import { ResolvedVersion, Version } from "./version";
import { detectProjectVersion, detectTarget } from "./detect";
import { bail } from "./utils";
import { fetchRunnerVersions, fetchSortedValgrindVersions } from "./resolve";

export type ValgrindStrategy = "builder" | "system" | "source" | "none";
export type RunnerStrategy = "binstall" | "release" | "source" | "none";

export const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[] = [
    "builder",
    "none",
    "system",
    "source",
];
export const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[] = [
    "binstall",
    "none",
    "release",
    "source",
];
export const DEFAULT_VALGRIND_STRATEGY: string = "builder,system,source";
export const DEFAULT_RUNNER_STRATEGY: string = "binstall,release,source";

export interface Inputs {
    installBuildDeps: boolean;
    githubToken: string;
    runnerStrategies: RunnerStrategy[];
    runnerTarget: string;
    runnerVersion: Version;
    valgrindStrategies: ValgrindStrategy[];
    valgrindUrl: string;
    valgrindShaUrl: string;
    valgrindVersion: Version;
}

export async function parseGithubToken(): Promise<string> {
    return core.getInput("github-token") || process.env.GITHUB_TOKEN?.trim() || "";
}

export async function parseInputs(): Promise<Inputs> {
    const githubToken = await parseGithubToken();
    const installBuildDeps = await parseInstallBuildDeps();
    const runnerStrategies = await parseRunnerStrategies();
    const runnerTarget = await parseRunnerTarget();
    const runnerVersion = await parseRunnerVersion(githubToken);
    const valgrindVersion = await parseValgrindVersion();
    const valgrindStrategies = await parseValgrindStrategies();
    const valgrindUrl = await parseValgrindUrl();
    const valgrindShaUrl = await parseValgrindShaUrl();

    return {
        githubToken,
        installBuildDeps,
        runnerStrategies,
        runnerTarget,
        runnerVersion,
        valgrindStrategies,
        valgrindUrl,
        valgrindShaUrl,
        valgrindVersion,
    };
}

export async function parseRunnerTarget(): Promise<string> {
    return core.getInput("runner-target") || (await detectTarget());
}

export async function parseRunnerStrategies(): Promise<RunnerStrategy[]> {
    try {
        return parseStrategies<RunnerStrategy>(
            core.getInput("runner-strategy") || DEFAULT_RUNNER_STRATEGY,
            VALID_RUNNER_STRATEGIES,
            "runner",
        );
    } catch (error) {
        bail(`Invalid runner-strategy: ${(error as Error).message}`);
    }
}

export async function parseRunnerVersion(githubToken: string): Promise<Version> {
    let runnerVersionInput = core.getInput("runner-version") || "auto";
    let runnerVersion: Version;

    if (runnerVersionInput.toLowerCase() === "auto") {
        try {
            runnerVersion = await detectProjectVersion();
        } catch (error) {
            bail(`Unable to detect gungraun-runner version: ${(error as Error).message}`);
        }
    } else {
        let validVersions: ResolvedVersion[];
        try {
            validVersions = await fetchRunnerVersions(githubToken);
            runnerVersion = Version.from_tag(runnerVersionInput);
        } catch (error) {
            bail(`Failed to fetch gungraun-runner versions: ${(error as Error).message}`);
        }

        if (!runnerVersion.isAutoOrLatest() && !validVersions.includes(runnerVersion)) {
            bail(
                `Invalid runner-version ${runnerVersionInput}: Valid versions are:
${validVersions.join(", ")}`,
            );
        }
    }

    return runnerVersion;
}

export function parseStrategies<T extends string>(
    input: string,
    valid: readonly T[],
    label: string,
): T[] {
    const strategies: Set<T> = new Set(
        input
            .split(",")
            .map((s) => s.trim().toLowerCase() as T)
            .filter((s) => s.length > 0),
    );

    if (strategies.size === 0) {
        return ["none" as T];
    }

    for (const v of valid) {
        if (!strategies.has(v)) {
            throw new Error(`Invalid ${label} strategy '${v}'. Valid values: ${valid.join(", ")}`);
        } else if (v === "none") {
            return ["none" as T];
        }
    }

    return Array.from(strategies);
}

export async function parseValgrindStrategies(): Promise<ValgrindStrategy[]> {
    try {
        return parseStrategies<ValgrindStrategy>(
            core.getInput("valgrind-strategy") || DEFAULT_VALGRIND_STRATEGY,
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
    } catch (error) {
        bail(`Invalid valgrind-strategy: ${(error as Error).message}`);
    }
}

export async function parseValgrindUrl(): Promise<string> {
    return core.getInput("valgrind-url") || "";
}

export async function parseValgrindShaUrl(): Promise<string> {
    return core.getInput("valgrind-sha-url") || "";
}

export async function parseValgrindVersion(): Promise<Version> {
    let valgrindVersionInput: string;
    let valgrindVersion: Version;

    try {
        valgrindVersionInput = core.getInput("valgrind-version") || "latest";
        valgrindVersion = Version.from_tag(valgrindVersionInput);
    } catch (error) {
        bail(`Invalid valgrind-version: ${(error as Error).message} `);
    }

    if (!valgrindVersion.isAutoOrLatest()) {
        let validVersions: ResolvedVersion[];
        try {
            validVersions = (await fetchSortedValgrindVersions()).filter(
                (v) => v.major >= 3 && v.minor >= 16,
            );
        } catch {
            bail(`Failed to validate valgrind version`);
        }

        if (!validVersions.includes(valgrindVersion)) {
            bail(`Invalid valgrind-version '${valgrindVersionInput}': Supported versions are:
${validVersions.join(", ")}`);
        }
    }

    return valgrindVersion;
}

export async function parseInstallBuildDeps(): Promise<boolean> {
    return core.getBooleanInput("install-build-deps") || false;
}
