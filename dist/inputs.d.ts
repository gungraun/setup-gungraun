import { Version } from "./version";
export type ValgrindStrategy = "builder" | "system" | "source" | "none";
export type RunnerStrategy = "binstall" | "release" | "source" | "none";
export declare const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[];
export declare const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[];
export declare const DEFAULT_VALGRIND_STRATEGY: string;
export declare const DEFAULT_RUNNER_STRATEGY: string;
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
export declare function parseGithubToken(): Promise<string>;
export declare function parseInputs(): Promise<Inputs>;
export declare function parseRunnerTarget(): Promise<string>;
export declare function parseRunnerStrategies(): Promise<RunnerStrategy[]>;
export declare function parseRunnerVersion(githubToken: string): Promise<Version>;
export declare function parseStrategies<T extends string>(input: string, valid: readonly T[], label: string): T[];
export declare function parseValgrindStrategies(): Promise<ValgrindStrategy[]>;
export declare function parseValgrindUrl(): Promise<string>;
export declare function parseValgrindShaUrl(): Promise<string>;
export declare function parseValgrindVersion(): Promise<Version>;
export declare function parseInstallBuildDeps(): Promise<boolean>;
