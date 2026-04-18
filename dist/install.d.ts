import { Version } from "./version";
import { RunnerStrategy, ValgrindStrategy } from "./inputs";
export declare function getRunnerInstallDir(): {
    dir: string;
    needsExport: boolean;
} | null;
export declare function installDebugSymbols(): Promise<void>;
/** Installs the gungraun-runner by trying each strategy in order until one succeeds. */
export declare function installRunner(version: Version, strategies: RunnerStrategy[], githubToken: string, target: string): Promise<void>;
/** Installs gungraun-runner from a GitHub release archive. */
export declare function installRunnerFromRelease(version: Version, githubToken: string, target: string): Promise<boolean>;
/** Installs gungraun-runner from source via cargo install. */
export declare function installRunnerFromSource(version: Version, target?: string): Promise<boolean>;
/** Installs gungraun-runner via cargo-binstall if available. */
export declare function installRunnerWithBinstall(version: Version, target?: string): Promise<boolean>;
/** Installs valgrind by trying each strategy in order until one succeeds. */
export declare function installValgrind(version: Version, strategies: ValgrindStrategy[], installBuildDeps: boolean | undefined, githubToken: string, valgrindUrl: string, valgrindShaUrl: string): Promise<void>;
/** Installs valgrind from the gungraun/valgrind-builder GitHub release. */
export declare function installValgrindFromBuilder(version: Version, githubToken: string, valgrindUrl: string, valgrindShaUrl: string): Promise<boolean>;
/** Installs valgrind using the system package manager. */
export declare function installValgrindWithPackageManager(version: Version): Promise<boolean>;
/** Installs build dependencies required to compile valgrind from source. */
export declare function installValgrindBuildDeps(): Promise<boolean>;
/** Installs valgrind from the source tarball. */
export declare function installValgrindFromSource(version: Version, installBuildDeps?: boolean): Promise<boolean>;
