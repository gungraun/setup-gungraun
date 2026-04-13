import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as io from "@actions/io";
import * as os from "os";
import * as path from "path";
import { detectArch, detectPlatform, detectTarget } from "./detect";
import {
    downloadAndExtractGr as downloadAndExtractRunner,
    downloadAndExtractValgrind,
    downloadAndExtractValgrindSource,
} from "./download";
import {
    cargoVersionFormat,
    resolveValgrindAssetName,
    resolveValgrindSourceTag,
    resolveValgrindTag,
    resolveVersion,
} from "./resolve";
import { getCargoBin, logInstalledVersion, bail, printError, printInfo, withGroup } from "./utils";
// TODO: reconsider the names for the strategies
export type ValgrindStrategy = "release" | "package-manager" | "source";
// TODO: source to compile like in binstall ?
export type RunnerStrategy = "binstall" | "release" | "source";

export const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[] = [
    "release",
    "package-manager",
    "source",
];
export const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[] = ["binstall", "release", "source"];
export const DEFAULT_VALGRIND_STRATEGY: string = "release,package-manager,source";
export const DEFAULT_RUNNER_STRATEGY: string = "binstall,release,source";

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
            bail(`Invalid ${label} strategy '${s}'. Valid values: ${valid.join(", ")}`);
        }
    }

    if (strategies.length === 0) {
        bail(`No ${label} strategies specified`);
    }

    return strategies;
}

async function findBinary(dir: string, name: string): Promise<string | null> {
    const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
        if (entry.isFile() && entry.name === name) {
            return path.join(entry.parentPath || dir, entry.name);
        }
    }
    return null;
}

/** Installs the gungraun-runner by trying each strategy in order until one succeeds. */
export async function installRunner(version: string, strategies: RunnerStrategy[]): Promise<void> {
    for (const strategy of strategies) {
        switch (strategy) {
            case "binstall": {
                const result = await installRunnerWithBinstall(version);
                if (result) return;
                break;
            }
            case "release": {
                const result = await installRunnerFromRelease(version);
                if (result) return;
                break;
            }
            case "source": {
                const result = await installRunnerFromSource(version);
                if (result) return;
                break;
            }
            default: {
                bail(`Invalid strategy '${strategy}'`);
            }
        }

        printError(`Runner strategy '${strategy}' failed`);
    }

    bail("All runner install strategies failed");
}

/** Installs gungraun-runner from a GitHub release archive. */
export async function installRunnerFromRelease(version: string): Promise<boolean> {
    const target = await detectTarget();

    return withGroup(`Downloading gungraun-runner '${version}'`, async () => {
        try {
            const tag = await resolveVersion(version);
            const extractDir = await downloadAndExtractRunner(tag, target);

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
            const { dir: installDir, needsExport } = result!;

            await exec.exec("chmod", ["+x", binaryPath]);

            if (!fs.existsSync(installDir)) {
                fs.mkdirSync(installDir, { recursive: true });
            }

            await io.mv(binaryPath, path.join(installDir, "gungraun-runner"));

            if (needsExport) {
                core.addPath(installDir);
                core.exportVariable("GUNGRAUN_RUNNER", path.join(installDir, "gungraun-runner"));
            }

            const normalized = tag[0] === "v" ? tag.slice(1) : tag;
            await logInstalledVersion(
                path.join(installDir, "gungraun-runner"),
                "gungraun-runner",
                `gungraun-runner ${normalized}`,
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
export async function installRunnerFromSource(version: string): Promise<boolean> {
    return withGroup("Installing gungraun-runner via cargo install", async () => {
        try {
            const formatted = cargoVersionFormat(version);
            const args = ["install", "gungraun-runner"];
            if (formatted) {
                args.push("--version", formatted);
            }
            await exec.exec(getCargoBin(), args);

            if (formatted) {
                await logInstalledVersion(
                    "gungraun-runner",
                    "gungraun-runner",
                    `gungraun-runner ${formatted}`,
                );
            } else {
                await logInstalledVersion("gungraun-runner", "gungraun-runner");
            }

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
export async function installRunnerWithBinstall(version: string): Promise<boolean> {
    if (!(await io.which("cargo-binstall", false))) {
        return false;
    }

    return withGroup("Installing gungraun-runner via cargo-binstall", async () => {
        try {
            const formatted = cargoVersionFormat(version);
            const args = ["binstall", "-y", "--disable-strategies", "compile"];
            if (formatted) {
                args.push(`gungraun-runner@${formatted}`);
            } else {
                args.push("gungraun-runner");
            }

            await exec.exec(getCargoBin(), args);

            const grPath = await io.which("gungraun-runner", false);
            if (grPath) {
                if (formatted) {
                    await logInstalledVersion(
                        "gungraun-runner",
                        "gungraun-runner",
                        `gungraun-runner ${formatted}`,
                    );
                } else {
                    await logInstalledVersion("gungraun-runner", "gungraun-runner");
                }
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
    strategies: ValgrindStrategy[],
    installBuildDeps: boolean = false,
): Promise<void> {
    for (const strategy of strategies) {
        switch (strategy) {
            case "release": {
                const result = await installValgrindFromBuilder();
                if (result) return;
                break;
            }
            case "package-manager": {
                const result = await installValgrindWithPackageManager();
                if (result) return;
                break;
            }
            case "source": {
                const result = await installValgrindFromSource(installBuildDeps);
                if (result) return;
                break;
            }
            default: {
                bail(`Invalid strategy '${strategy}'`);
            }
        }

        printError(`Valgrind strategy '${strategy}' failed`);
    }

    bail("All valgrind installation strategies failed");
}

// FIX: install libc6-dbg, ...
/** Installs valgrind from the gungraun/valgrind-builder GitHub release. */
export async function installValgrindFromBuilder(): Promise<boolean> {
    const target = await detectTarget();
    const arch = detectArch(target);
    const { platform } = detectPlatform();

    return withGroup("Installing valgrind from release", async () => {
        try {
            const tag = await resolveValgrindTag(process.env.VALGRIND_VERSION || "latest");
            const assetName = await resolveValgrindAssetName(tag, arch, platform);
            if (!assetName) {
                printError(`No valgrind release found for ${arch}-${platform}`);
                return false;
            }

            printInfo(`Downloading valgrind ${tag} (${assetName})`);
            const extractDir = await downloadAndExtractValgrind(tag, assetName);

            await exec.exec("sudo", ["tar", "-xzf", path.join(extractDir, assetName), "-C", "/"]);

            await logInstalledVersion("valgrind", "valgrind");

            return true;
        } catch (error) {
            printError(`Failed to install valgrind from release: ${(error as Error).message}`);

            return false;
        }
    });
}

const VALGRIND_PACKAGES: Record<string, string[]> = {
    "apt-get": ["valgrind", "libc6-dbg"],
    dnf: ["valgrind", "glibc-debuginfo"],
    yum: ["valgrind"],
    pacman: ["valgrind"],
    zypper: ["valgrind", "glibc-debuginfo"],
    apk: ["valgrind"],
};

/** Installs valgrind using the system package manager. */
export async function installValgrindWithPackageManager(): Promise<boolean> {
    return withGroup("Installing valgrind via package manager", async () => {
        const { packageManager } = detectPlatform();

        if (!packageManager || !VALGRIND_PACKAGES[packageManager]) {
            printError(
                `Cannot install build dependencies: unsupported package manager '${packageManager}'`,
            );

            return false;
        }

        const packages = VALGRIND_PACKAGES[packageManager];
        try {
            await installWithPackageManager(packageManager, packages);
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

const VALGRIND_BUILD_DEPS: Record<string, string[]> = {
    "apt-get": ["autoconf", "automake", "gcc", "make", "bzip2", "libc6-dbg"],
    dnf: ["autoconf", "automake", "gcc", "make", "bzip2", "glibc-debuginfo"],
    yum: ["autoconf", "automake", "gcc", "make", "bzip2"],
    pacman: ["autoconf", "automake", "gcc", "make", "bzip2"],
    zypper: ["autoconf", "automake", "gcc", "make", "bzip2", "glibc-debuginfo"],
    apk: ["autoconf", "automake", "gcc", "make", "bzip2"],
};

/** Installs build dependencies required to compile valgrind from source. */
export async function installValgrindBuildDeps(): Promise<boolean> {
    const { packageManager } = detectPlatform();

    if (!packageManager || !VALGRIND_BUILD_DEPS[packageManager]) {
        printError(
            `Cannot install build dependencies: unsupported package manager '${packageManager}'`,
        );

        return false;
    }

    const packages = VALGRIND_BUILD_DEPS[packageManager];

    return withGroup("Installing valgrind build dependencies", async () => {
        try {
            await installWithPackageManager(packageManager, packages);
            printInfo(`Installed build dependencies: ${packages.join(", ")}`);

            return true;
        } catch (error) {
            printError(`Failed to install build dependencies: ${(error as Error).message}`);

            return false;
        }
    });
}

// FIX: install libc6-dbg, ...
/** Installs valgrind from the source tarball. */
export async function installValgrindFromSource(
    installBuildDeps: boolean = false,
): Promise<boolean> {
    return withGroup("Installing valgrind from source", async () => {
        try {
            const version = await resolveValgrindSourceTag(
                process.env.VALGRIND_VERSION || "latest",
            );

            if (installBuildDeps) {
                const depsResult = await installValgrindBuildDeps();
                if (!depsResult) {
                    printError("Failed to install build dependencies, continuing anyway");
                    // TODO: abort?
                }
            }

            const extractDir = await downloadAndExtractValgrindSource(version);
            const sourceDir = path.join(extractDir, `valgrind-${version}`);

            await exec.exec("./autogen.sh", [], { cwd: sourceDir });
            // TODO: valgrind-configure-args in action.yml
            await exec.exec("./configure", ["--prefix=/usr"], { cwd: sourceDir });

            const ncpus = os.cpus().length;
            // TODO: valgrind-make-args in action.yml
            await exec.exec("make", [`-j${ncpus}`, "BUILD_DOCS=none"], { cwd: sourceDir });
            await exec.exec("sudo", ["make", "install"], { cwd: sourceDir });

            await logInstalledVersion("valgrind", "valgrind", `valgrind-${version}`);
            return true;
        } catch (error) {
            printError(`Failed to install valgrind from source: ${(error as Error).message}`);
            return false;
        }
    });
}

export async function installWithPackageManager(
    packageManager: string,
    packages: string[],
): Promise<void> {
    switch (packageManager) {
        case "apt-get":
            await exec.exec("sudo", ["apt-get", "update", "-qq"]);
            await exec.exec("sudo", ["apt-get", "install", "-y", "-qq", ...packages]);
            break;
        case "dnf":
            await exec.exec("sudo", ["dnf", "install", "-y", ...packages]);
            break;
        case "yum":
            try {
                await exec.exec("sudo", ["yum", "install", "-y", ...packages]);
            } catch {
                await exec.exec("sudo", ["dnf", "install", "-y", ...packages]);
            }
            break;
        case "pacman":
            await exec.exec("sudo", ["pacman", "-S", "--noconfirm", ...packages]);
            break;
        case "zypper":
            await exec.exec("sudo", ["zypper", "--non-interactive", "install", ...packages]);
            break;
        case "apk":
            await exec.exec("sudo", ["apk", "add", ...packages]);
            break;
        default:
            throw `Unsupported package manager: ${packageManager}`;
    }
}
