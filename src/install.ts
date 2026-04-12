import * as exec from "@actions/exec";
import * as fs from "fs";
import * as io from "@actions/io";
import * as path from "path";
import { detectArch, detectPlatform, detectTarget } from "./detect";
import { downloadAndExtractGr, downloadAndExtractValgrind } from "./download";
import {
    cargoVersionFormat,
    resolveValgrindAssetName,
    resolveValgrindTag,
    resolveVersion,
} from "./resolve";
import { getCargoBin, logInstalledVersion, bail, printError, printInfo, withGroup } from "./utils";
// TODO: reconsider the names for the strategies. Add installation from source
export type ValgrindStrategy = "release" | "package-manager";
// TODO: source to compile like in binstall ?
export type RunnerStrategy = "binstall" | "release" | "source";

// FIX: use the temporary directory instead of /root
const INSTALL_DIR =
    process.env.RUNNER_INSTALL_DIR ||
    (process.env.CARGO_HOME
        ? `${process.env.CARGO_HOME}/bin`
        : `${process.env.HOME || "/root"}/.cargo/bin`);

export const VALID_VALGRIND_STRATEGIES: readonly ValgrindStrategy[] = [
    "release",
    "package-manager",
];
export const VALID_RUNNER_STRATEGIES: readonly RunnerStrategy[] = ["binstall", "release", "source"];
export const DEFAULT_VALGRIND_STRATEGY: string = "release,package-manager";
export const DEFAULT_RUNNER_STRATEGY: string = "binstall,release,source";

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
            const extractDir = await downloadAndExtractGr(tag, target);

            const binaryPath = path.join(extractDir, "gungraun-runner");
            if (!fs.existsSync(binaryPath)) {
                const found = await findBinary(extractDir, "gungraun-runner");
                if (!found) {
                    printError("Could not find gungraun-runner binary in archive");
                    return false;
                }
            }

            await exec.exec("chmod", ["+x", binaryPath]);
            await io.mv(binaryPath, path.join(INSTALL_DIR, "gungraun-runner"));

            // FIX: Use fallback `gungraun-runner $version` where version is without the v prefix
            // FIX: Use label `gungraun-runner`
            await logInstalledVersion(path.join(INSTALL_DIR, "gungraun-runner"), "gungraun-runner");
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

            // FIX: Use fallback `gungraun-runner $version` where version is without the v prefix
            await logInstalledVersion("gungraun-runner", "gungraun-runner");
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
                await logInstalledVersion("gungraun-runner", "gungraun-runner");
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
export async function installValgrind(strategies: ValgrindStrategy[]): Promise<void> {
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
            default: {
                bail(`Invalid strategy '${strategy}'`);
            }
        }

        printError(`Valgrind strategy '${strategy}' failed`);
    }

    bail("All valgrind installation strategies failed");
}

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

/** Installs valgrind using the system package manager. */
export async function installValgrindWithPackageManager(): Promise<boolean> {
    return withGroup("Installing valgrind via package manager", async () => {
        try {
            const { packageManager } = detectPlatform();

            switch (packageManager) {
                case "apt-get":
                    await exec.exec("sudo", ["apt-get", "update", "-qq"]);
                    await exec.exec("sudo", ["apt-get", "install", "-y", "-qq", "valgrind"]);
                    break;
                case "dnf":
                    await exec.exec("sudo", ["dnf", "install", "-y", "valgrind"]);
                    break;
                case "yum":
                    try {
                        await exec.exec("sudo", ["yum", "install", "-y", "valgrind"]);
                    } catch {
                        await exec.exec("sudo", ["dnf", "install", "-y", "valgrind"]);
                    }
                    break;
                case "pacman":
                    await exec.exec("sudo", ["pacman", "-S", "--noconfirm", "valgrind"]);
                    break;
                case "zypper":
                    await exec.exec("sudo", ["zypper", "--non-interactive", "install", "valgrind"]);
                    break;
                case "apk":
                    await exec.exec("sudo", ["apk", "add", "valgrind"]);
                    break;
                default:
                    bail("Unsupported distribution. Cannot install valgrind");
            }

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
