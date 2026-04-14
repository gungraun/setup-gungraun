import * as core from "@actions/core";
import { Version } from "./version";
import { detectProjectVersion } from "./detect";
import { bail } from "./utils";

export type ValgrindStrategy = "builder" | "system" | "source";
export type RunnerStrategy = "binstall" | "release" | "source";

export const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[] = [
    "builder",
    "system",
    "source",
];
export const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[] = ["binstall", "release", "source"];
export const DEFAULT_VALGRIND_STRATEGY: string = "builder,system,source";
export const DEFAULT_RUNNER_STRATEGY: string = "binstall,release,source";

export interface Inputs {
    installBuildDeps: boolean;
    githubToken: string;
    runnerStrategies: RunnerStrategy[];
    runnerVersion: Version;
    valgrindStrategies: ValgrindStrategy[];
    valgrindVersion: Version;
}

export async function parseInputs(): Promise<Inputs> {
    const githubToken = await parseGithubToken();
    const installBuildDeps = await parseInstallBuildDeps();
    const runnerStrategies = await parseRunnerStrategies();
    const runnerVersion = await parseRunnerVersion();
    const valgrindVersion = await parseValgrindVersion();
    const valgrindStrategies = await parseValgrindStrategies();

    return {
        githubToken,
        installBuildDeps,
        runnerStrategies,
        runnerVersion,
        valgrindStrategies,
        valgrindVersion,
    };
}

export async function parseGithubToken(): Promise<string> {
    return core.getInput("github-token") || process.env.GITHUB_TOKEN?.trim() || "";
}

export async function parseRunnerVersion(): Promise<Version> {
    let runnerVersionInput = core.getInput("runner-version") || "auto";
    let runnerVersion: Version;

    if (runnerVersionInput === "auto") {
        try {
            runnerVersion = await detectProjectVersion();
        } catch (error) {
            bail(`Unable to detect gungraun-runner version: ${(error as Error).message}`);
        }
    } else {
        try {
            runnerVersion = Version.from_tag(runnerVersionInput);
        } catch (error) {
            bail(`Invalid runner-version: ${(error as Error).message}`);
        }
    }

    return runnerVersion;
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

export function parseStrategies<T extends string>(
    input: string,
    valid: readonly T[],
    label: string,
): T[] {
    const strategies = input
        .split(",")
        .map((s) => s.trim().toLowerCase() as T)
        .filter((s) => s.length > 0);

    for (const s of strategies) {
        if (!valid.includes(s)) {
            throw new Error(`Invalid ${label} strategy '${s}'. Valid values: ${valid.join(", ")}`);
        }
    }

    if (strategies.length === 0) {
        throw new Error(`No ${label} strategies specified`);
    }

    return strategies;
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

export async function parseValgrindVersion(): Promise<Version> {
    try {
        const valgrindVersionInput = core.getInput("valgrind-version") || "latest";
        return Version.from_tag(valgrindVersionInput);
    } catch (error) {
        bail(`Invalid valgrind-version: ${(error as Error).message}`);
    }
}

export async function parseInstallBuildDeps(): Promise<boolean> {
    return core.getBooleanInput("install-build-deps") || false;
}
