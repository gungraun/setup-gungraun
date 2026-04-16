import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as io from "@actions/io";
import * as path from "path";
import * as os from "os";
import { detectArch, detectPlatform, detectTarget } from "./detect";
import {
    downloadAndExtractRunner as downloadAndExtractRunner,
    downloadAndExtractValgrind,
    downloadAndExtractValgrindSource,
    downloadAndExtractValgrindUrl,
} from "./download";
import {
    resolveValgrindBuilderAssetName,
    resolveValgrindVersion as resolveValgrindVersion,
    resolveRunnerVersion,
} from "./resolve";
import {
    findBinary,
    getCargoBin,
    logInstalledVersion,
    printError,
    printInfo,
    printWarning,
    withGroup,
} from "./utils";
import { ResolvedVersion, Version } from "./version";
import { RunnerStrategy, ValgrindStrategy } from "./inputs";
import { PackagesInstaller as PackagesInstaller, FetchLatestPackageVersion } from "./platform";

export function getRunnerInstallDir(): { dir: string; needsExport: boolean } | null {
    if (process.env.CARGO_INSTALL_ROOT) {
        return { dir: `${process.env.CARGO_INSTALL_ROOT}/bin`, needsExport: false };
    }
    if (process.env.CARGO_HOME) {
        return { dir: `${process.env.CARGO_HOME}/bin`, needsExport: false };
    }
    if (process.env.HOME) {
        return { dir: `${process.env.HOME}/.cargo/bin`, needsExport: true };
    }
    if (process.env.RUNNER_TEMP) {
        return { dir: `${process.env.RUNNER_TEMP}/.cargo/bin`, needsExport: true };
    }

    return null;
}

export async function installDebugSymbols(): Promise<void> {
    let warning = false;
    try {
        const { packageManager } = await detectPlatform();
        if (packageManager) {
            await packageManager.accept(
                new PackagesInstaller(...packageManager.getDebugInfoPackages()),
            );
        } else {
            warning = true;
        }
    } catch {
        warning = true;
    }

    if (warning) {
        printWarning(`Failed to install debug symbols for libc. That means you might not \
be able to use the memcheck tool. Other tools will likely still work`);
    }
}

/** Installs the gungraun-runner by trying each strategy in order until one succeeds. */
export async function installRunner(
    version: Version,
    strategies: RunnerStrategy[],
    githubToken: string,
    target: string,
): Promise<void> {
    for (const strategy of strategies) {
        switch (strategy) {
            case "binstall": {
                const result = await installRunnerWithBinstall(version, target);
                if (result) return;
                break;
            }
            case "release": {
                const result = await installRunnerFromRelease(version, githubToken, target);
                if (result) return;
                break;
            }
            case "source": {
                const result = await installRunnerFromSource(version);
                if (result) return;
                break;
            }
            case "none": {
                printInfo("Skipping gungraun-runner installation");
                return;
            }
            default: {
                throw new Error(`Invalid strategy '${strategy}'`);
            }
        }

        printError(`Runner strategy '${strategy}' failed`);
    }

    throw new Error("All runner install strategies failed");
}

/** Installs gungraun-runner from a GitHub release archive. */
export async function installRunnerFromRelease(
    version: Version,
    githubToken: string,
    target: string,
): Promise<boolean> {
    return withGroup(`Downloading gungraun-runner '${version}'`, async () => {
        try {
            const resolvedVersion = await resolveRunnerVersion(version, githubToken);
            const extractDir = await downloadAndExtractRunner(resolvedVersion, target, githubToken);

            const binaryPath = path.join(extractDir, "gungraun-runner");
            if (!fs.existsSync(binaryPath)) {
                const found = await findBinary(extractDir, "gungraun-runner");
                if (!found) {
                    printError("Could not find gungraun-runner binary in archive");
                    return false;
                }
            }

            const result = getRunnerInstallDir();
            if (!result) {
                printError("Unable to find a installation directory for gungraun-runner");
                return false;
            }
            const { dir: installDir, needsExport } = result;

            await exec.exec("chmod", ["+x", binaryPath]);

            if (!fs.existsSync(installDir)) {
                fs.mkdirSync(installDir, { recursive: true });
            }

            await io.mv(binaryPath, path.join(installDir, "gungraun-runner"));

            if (needsExport) {
                core.addPath(installDir);
                core.exportVariable("GUNGRAUN_RUNNER", path.join(installDir, "gungraun-runner"));
            }

            await logInstalledVersion(
                path.join(installDir, "gungraun-runner"),
                "gungraun-runner",
                `gungraun-runner ${resolvedVersion}`,
            );

            return true;
        } catch (error) {
            printError(
                `Failed to install gungraun-runner from release: ${(error as Error).message}`,
            );

            return false;
        }
    });
}

/** Installs gungraun-runner from source via cargo install. */
export async function installRunnerFromSource(version: Version, target?: string): Promise<boolean> {
    return withGroup("Installing gungraun-runner via cargo install", async () => {
        try {
            let args = ["install", "gungraun-runner"];
            if (!version.isLatest()) {
                args.push("--version", version.toString());
            }
            if (target) {
                args.push("--target", `${target}`);
            }

            await exec.exec(getCargoBin(), args);

            await logInstalledVersion(
                "gungraun-runner",
                "gungraun-runner",
                `gungraun-runner ${version}`,
            );

            return true;
        } catch (error) {
            printError(
                `Failed to install gungraun-runner from source: ${(error as Error).message}`,
            );

            return false;
        }
    });
}

/** Installs gungraun-runner via cargo-binstall if available. */
export async function installRunnerWithBinstall(
    version: Version,
    target?: string,
): Promise<boolean> {
    if (!(await io.which("cargo-binstall", false))) {
        return false;
    }

    return withGroup("Installing gungraun-runner via cargo-binstall", async () => {
        try {
            const args = ["binstall", "-y", "--disable-strategies", "compile"];
            if (target) {
                args.push(`--targets`, `${target}`);
            }
            if (version.isLatest()) {
                args.push("gungraun-runner");
            } else {
                args.push(`gungraun-runner@${version}`);
            }

            await exec.exec(getCargoBin(), args);

            const runnerPath = await io.which("gungraun-runner", false);
            if (runnerPath) {
                await logInstalledVersion(
                    "gungraun-runner",
                    "gungraun-runner",
                    `gungraun-runner ${version}`,
                );
            }

            return true;
        } catch (error) {
            printError(
                `Failed to install gungraun-runner with cargo-binstall: ${(error as Error).message}`,
            );

            return false;
        }
    });
}

/** Installs valgrind by trying each strategy in order until one succeeds. */
export async function installValgrind(
    version: Version,
    strategies: ValgrindStrategy[],
    installBuildDeps: boolean = false,
    githubToken: string,
    valgrindUrl: string,
    valgrindShaUrl: string,
): Promise<void> {
    for (const strategy of strategies) {
        switch (strategy) {
            case "builder": {
                const result = await installValgrindFromBuilder(
                    version.isAuto() ? Version.latest() : version,
                    githubToken,
                    valgrindUrl,
                    valgrindShaUrl,
                );
                if (result) return;
                break;
            }
            case "system": {
                const result = await installValgrindWithPackageManager(version);
                if (result) return;
                break;
            }
            case "source": {
                const result = await installValgrindFromSource(
                    version.isAuto() ? Version.latest() : version,
                    installBuildDeps,
                );
                if (result) return;
                break;
            }
            case "none": {
                printInfo("Skipping valgrind installation");
                return;
            }
            default: {
                throw new Error(`Invalid strategy '${strategy}'`);
            }
        }

        printError(`Valgrind strategy '${strategy}' failed`);
    }

    throw new Error("All valgrind installation strategies failed");
}

/** Installs valgrind from the gungraun/valgrind-builder GitHub release. */
export async function installValgrindFromBuilder(
    version: Version,
    githubToken: string,
    valgrindUrl: string,
    valgrindShaUrl: string,
): Promise<boolean> {
    return withGroup("Installing valgrind from builder", async () => {
        try {
            let extractDir;
            if (valgrindUrl) {
                printInfo(`Downloading valgrind archive from url '${valgrindUrl}'`);

                const { extractDir: dir } = await downloadAndExtractValgrindUrl(
                    valgrindUrl,
                    valgrindShaUrl,
                );

                extractDir = dir;
            } else {
                const { platform } = await detectPlatform();
                const target = await detectTarget();
                const arch = detectArch(target);

                const result = await resolveValgrindBuilderAssetName(
                    version,
                    arch,
                    platform,
                    githubToken,
                );
                if (!result) {
                    printError(
                        `No valgrind builder release found for valgrind version ${version} \
(${arch}-${platform})`,
                    );
                    return false;
                }

                const { version: resolvedVersion, name } = result;

                printInfo(`Downloading valgrind builder archive '${name}'`);
                extractDir = await downloadAndExtractValgrind(resolvedVersion, name, githubToken);
            }

            const entries = await fs.promises.readdir(extractDir);
            await exec.exec("sudo", ["mv", ...entries.map((e) => path.join(extractDir, e)), "/"]);

            await logInstalledVersion("valgrind", "valgrind");
        } catch (error) {
            printError(`Failed to install valgrind from release: ${(error as Error).message}`);

            return false;
        }

        await installDebugSymbols();
        return true;
    });
}

/** Installs valgrind using the system package manager. */
export async function installValgrindWithPackageManager(version: Version): Promise<boolean> {
    return withGroup("Installing valgrind via package manager", async () => {
        const { packageManager } = await detectPlatform();

        if (!packageManager) {
            printError(
                `Cannot install build dependencies: unsupported package manager '${packageManager}'`,
            );

            return false;
        }

        if (!version.isAuto()) {
            try {
                const latestVersion = await resolveValgrindVersion(version);
                const packageVersion = await packageManager.accept(
                    new FetchLatestPackageVersion("valgrind"),
                );

                if (!packageVersion) {
                    printError(`Unable to retrieve version information with ${packageManager}.`);
                    return false;
                } else if (latestVersion !== packageVersion) {
                    printError(`The package version doesn't match the requested version`);
                    return false;
                } else {
                    // pass through to install with package manger
                }
            } catch (error) {
                printError(
                    `Error retrieving package version with ${packageManager}: ${(error as Error).message}`,
                );
                return false;
            }
        }

        try {
            await packageManager.accept(
                new PackagesInstaller("valgrind", ...packageManager.getDebugInfoPackages()),
            );

            await logInstalledVersion("valgrind", "valgrind");

            return true;
        } catch (error) {
            printError(
                `Failed to install Valgrind with package manager: ${(error as Error).message}`,
            );

            return false;
        }
    });
}

/** Installs build dependencies required to compile valgrind from source. */
export async function installValgrindBuildDeps(): Promise<boolean> {
    return withGroup("Installing valgrind build dependencies", async () => {
        const { packageManager } = await detectPlatform();

        if (!packageManager) {
            printError(`Cannot install build dependencies: unsupported package manager`);
            return false;
        }

        try {
            const packages = packageManager.getValgrindBuildDeps();
            await packageManager.accept(new PackagesInstaller(...packages));
            printInfo(`Installed build dependencies: ${packages.join(", ")}`);

            return true;
        } catch (error) {
            printError(`Failed to install build dependencies: ${(error as Error).message}`);

            return false;
        }
    });
}

/** Installs valgrind from the source tarball. */
export async function installValgrindFromSource(
    version: Version,
    installBuildDeps: boolean = false,
): Promise<boolean> {
    return withGroup("Installing valgrind from source", async () => {
        try {
            const resolvedVersion = await resolveValgrindVersion(version);

            if (installBuildDeps) {
                const depsResult = await installValgrindBuildDeps();
                if (!depsResult) {
                    printError("Failed to install build dependencies, continuing anyway");
                    // TODO: abort?
                }
            }

            const extractDir = await downloadAndExtractValgrindSource(resolvedVersion);
            const sourceDir = path.join(extractDir, `valgrind-${resolvedVersion}`);

            await exec.exec("./configure", ["--prefix=/usr"], { cwd: sourceDir });

            const ncpus = os.cpus().length;
            await exec.exec("make", [`-j${ncpus}`, "BUILD_DOCS=none"], { cwd: sourceDir });
            await exec.exec("sudo", ["make", "install"], { cwd: sourceDir });

            await logInstalledVersion("valgrind", "valgrind", `valgrind-${resolvedVersion}`);
        } catch (error) {
            printError(`Failed to install valgrind from source: ${(error as Error).message}`);
            return false;
        }

        await installDebugSymbols();
        return true;
    });
}
