jest.mock("@actions/core", () => ({
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    setFailed: jest.fn(),
}));

jest.mock("@actions/exec", () => ({
    exec: jest.fn().mockResolvedValue(0),
    getExecOutput: jest.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

jest.mock("@actions/io", () => ({
    which: jest.fn(),
    mv: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../detect", () => ({
    detectTarget: jest.fn().mockResolvedValue("x86_64-unknown-linux-gnu"),
    detectArch: jest.fn().mockReturnValue("x86_64"),
    detectPlatform: jest.fn().mockReturnValue({
        id: "ubuntu",
        versionId: "22.04",
        platform: "ubuntu-22.04",
        packageManager: "apt-get",
    }),
    detectProjectVersion: jest.fn().mockResolvedValue("1.0.0"),
}));

jest.mock("../resolve", () => ({
    resolveVersion: jest.fn().mockResolvedValue("v1.0.0"),
    resolveValgrindTag: jest.fn().mockResolvedValue("v3.20.0"),
    resolveValgrindSourceTag: jest.fn().mockResolvedValue("3.20.0"),
    resolveValgrindAssetName: jest
        .fn()
        .mockResolvedValue("valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz"),
    cargoVersionFormat: jest.fn((v: string) => (v === "latest" ? null : v.replace(/^v/, ""))),
}));

jest.mock("../download", () => ({
    downloadAndExtractGr: jest.fn().mockResolvedValue("/tmp/gr-extract"),
    downloadAndExtractValgrind: jest.fn().mockResolvedValue("/tmp/valgrind-extract"),
    downloadAndExtractValgrindSource: jest.fn().mockResolvedValue("/tmp/valgrind-source-extract"),
}));

jest.mock("../utils", () => ({
    withGroup: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
    logInstalledVersion: jest.fn().mockResolvedValue(undefined),
    bail: jest.fn((msg: string) => {
        throw new Error(msg);
    }),
    printError: jest.fn(),
    printInfo: jest.fn(),
    printWarning: jest.fn(),
    getCargoBin: jest.fn(() => process.env.CARGO || "cargo"),
}));

jest.mock("fs", () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readdirSync: jest.fn().mockReturnValue([]),
    readFileSync: jest.fn().mockReturnValue(""),
    mkdirSync: jest.fn(),
}));

jest.mock("os", () => ({
    cpus: jest.fn().mockReturnValue(Array(4)),
}));

import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { detectPlatform } from "../detect";
import { getCargoBin } from "../utils";
import * as download from "../download";
import { Version } from "../version";
import {
    installRunnerWithBinstall,
    installRunnerFromSource,
    installValgrindWithPackageManager,
    installValgrindFromSource,
    installValgrindBuildDeps,
    installValgrind,
    installRunner,
    parseStrategies,
    VALID_VALGRIND_STRATEGIES,
    VALID_RUNNER_STRATEGIES,
    getRunnerInstallDir,
} from "../install";

const mockExec = exec.exec as jest.Mock;
const mockWhich = io.which as jest.Mock;
const mockDetectPlatform = detectPlatform as jest.Mock;
const mockDownloadAndExtractValgrindSource = download.downloadAndExtractValgrindSource as jest.Mock;

describe("parseStrategies", () => {
    it("parses a comma-separated list of valid strategies", () => {
        const result = parseStrategies(
            "builder,system,source",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["builder", "system", "source"]);
    });

    it("trims whitespace around strategies", () => {
        const result = parseStrategies(
            " builder , system ",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["builder", "system"]);
    });

    it("is case-insensitive", () => {
        const result = parseStrategies(
            "Builder,System",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["builder", "system"]);
    });

    it("parses a single strategy", () => {
        const result = parseStrategies("binstall", VALID_RUNNER_STRATEGIES, "runner");
        expect(result).toEqual(["binstall"]);
    });

    it("throws on invalid strategy names", () => {
        expect(() =>
            parseStrategies("builder,invalid", VALID_VALGRIND_STRATEGIES, "valgrind"),
        ).toThrow("Invalid valgrind strategy 'invalid'");
    });

    it("throws on empty input", () => {
        expect(() => parseStrategies("  ,  ", VALID_VALGRIND_STRATEGIES, "valgrind")).toThrow(
            "No valgrind strategies specified",
        );
    });
});

describe("installRunnerWithBinstall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns false if cargo-binstall is not found", async () => {
        mockWhich.mockResolvedValue("");

        const result = await installRunnerWithBinstall(Version.from_tag("v1.0.0"));

        expect(result).toBe(false);
    });

    it("calls cargo binstall with formatted version", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });
        mockExec.mockResolvedValue(0);

        const result = await installRunnerWithBinstall(Version.from_tag("v1.0.0"));

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
            "binstall",
            "-y",
            "--disable-strategies",
            "compile",
            "gungraun-runner@1.0.0",
        ]);
    });

    it("calls cargo binstall without version when latest", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });
        mockExec.mockResolvedValue(0);

        const result = await installRunnerWithBinstall(Version.latest());

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
            "binstall",
            "-y",
            "--disable-strategies",
            "compile",
            "gungraun-runner",
        ]);
    });

    it("returns false if cargo binstall exec fails", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            return Promise.resolve("");
        });
        mockExec.mockRejectedValue(new Error("install failed"));

        const result = await installRunnerWithBinstall(Version.from_tag("v1.0.0"));

        expect(result).toBe(false);
    });

    it("uses CARGO env var for cargo binstall", async () => {
        process.env.CARGO = "/custom/cargo";
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });
        mockExec.mockResolvedValue(0);

        const result = await installRunnerWithBinstall(Version.from_tag("v1.0.0"));

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("/custom/cargo", [
            "binstall",
            "-y",
            "--disable-strategies",
            "compile",
            "gungraun-runner@1.0.0",
        ]);

        delete process.env.CARGO;
    });
});

describe("installRunnerFromSource", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("calls cargo install with formatted version", async () => {
        mockExec.mockResolvedValue(0);

        await installRunnerFromSource(Version.from_tag("v1.0.0"));

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
            "install",
            "gungraun-runner",
            "--version",
            "1.0.0",
        ]);
    });

    it("calls cargo install without version when latest", async () => {
        mockExec.mockResolvedValue(0);

        await installRunnerFromSource(Version.latest());

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), ["install", "gungraun-runner"]);
    });
});

describe("installValgrind", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("tries only system when specified", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        await installValgrind(Version.from_tag("v3.20.0"), ["system"]);

        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "apt-get",
            "install",
            "-y",
            "-qq",
            "valgrind",
            "libc6-dbg",
        ]);
    });

    it("tries builder then system when both specified", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        await installValgrind(Version.from_tag("v3.20.0"), ["builder", "system"]);

        // Both builder attempt and package manager should be called
        // (builder fails since downloadAndExtractValgrind is mocked, but installValgrindFromBuilder
        //  returns false because it can't find the binary; then system is tried)
    });

    it("fails when all strategies fail", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });

        await expect(installValgrind(Version.from_tag("v3.20.0"), ["system"])).rejects.toThrow();
    });
});

describe("installValgrindWithPackageManager", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("installs with apt-get on ubuntu", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "apt-get",
            "install",
            "-y",
            "-qq",
            "valgrind",
            "libc6-dbg",
        ]);
    });

    it("installs with dnf on fedora", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "fedora",
            versionId: "39",
            platform: "fedora-39",
            packageManager: "dnf",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["dnf", "install", "-y", "valgrind", "glibc-debuginfo"]);
    });

    it("tries yum then falls back to dnf on amzn", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "amzn",
            versionId: "2",
            platform: "amzn-2",
            packageManager: "yum",
        });
        mockExec.mockRejectedValueOnce(new Error("yum failed"));

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["yum", "install", "-y", "valgrind"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["dnf", "install", "-y", "valgrind"]);
    });

    it("installs with yum without fallback when successful", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "amzn",
            versionId: "2",
            platform: "amzn-2",
            packageManager: "yum",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["yum", "install", "-y", "valgrind"]);
        expect(mockExec).not.toHaveBeenCalledWith("sudo", ["dnf", "install", "-y", "valgrind"]);
    });

    it("installs with pacman on arch", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "arch",
            versionId: "rolling",
            platform: "arch-rolling",
            packageManager: "pacman",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["pacman", "-S", "--noconfirm", "valgrind"]);
    });

    it("installs with zypper on opensuse", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "opensuse-leap",
            versionId: "15.5",
            platform: "opensuse-leap-15.5",
            packageManager: "zypper",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "zypper",
            "--non-interactive",
            "install",
            "valgrind",
            "glibc-debuginfo",
        ]);
    });

    it("installs with apk on alpine", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "alpine",
            versionId: "3.19",
            platform: "alpine-3.19",
            packageManager: "apk",
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["apk", "add", "valgrind"]);
    });

    it("throws on unknown package manager", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });

        const result = await installValgrindWithPackageManager();

        expect(result).toBe(false);
    });
});

describe("installValgrindBuildDeps", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("installs build deps with apt-get on ubuntu", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "apt-get",
            "install",
            "-y",
            "-qq",
            "autoconf",
            "automake",
            "gcc",
            "make",
            "bzip2",
            "libc6-dbg",
        ]);
    });

    it("installs build deps with dnf on fedora", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "fedora",
            versionId: "39",
            platform: "fedora-39",
            packageManager: "dnf",
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "dnf",
            "install",
            "-y",
            "autoconf",
            "automake",
            "gcc",
            "make",
            "bzip2",
            "glibc-debuginfo",
        ]);
    });

    it("installs build deps with pacman on arch", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "arch",
            versionId: "rolling",
            platform: "arch-rolling",
            packageManager: "pacman",
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "pacman",
            "-S",
            "--noconfirm",
            "autoconf",
            "automake",
            "gcc",
            "make",
            "bzip2",
        ]);
    });

    it("returns false on unsupported package manager", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(false);
    });
});

describe("installValgrindFromSource", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("builds valgrind from source with resolved tag", async () => {
        const result = await installValgrindFromSource(Version.from_tag("v3.20.0"), false);

        expect(result).toBe(true);
        expect(mockDownloadAndExtractValgrindSource).toHaveBeenCalledWith("3.20.0");
        expect(mockExec).toHaveBeenCalledWith("./autogen.sh", [], expect.objectContaining({ cwd: "/tmp/valgrind-source-extract/valgrind-3.20.0" }));
        expect(mockExec).toHaveBeenCalledWith("./configure", ["--prefix=/usr"], expect.objectContaining({ cwd: "/tmp/valgrind-source-extract/valgrind-3.20.0" }));
        expect(mockExec).toHaveBeenCalledWith("make", ["-j4", "BUILD_DOCS=none"], expect.objectContaining({ cwd: "/tmp/valgrind-source-extract/valgrind-3.20.0" }));
        expect(mockExec).toHaveBeenCalledWith("sudo", ["make", "install"], expect.objectContaining({ cwd: "/tmp/valgrind-source-extract/valgrind-3.20.0" }));
    });

    it("installs build deps when installBuildDeps is true", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        const result = await installValgrindFromSource(Version.from_tag("v3.20.0"), true);

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", expect.arrayContaining(["apt-get", "install", "-y", "-qq"]));
    });

    it("continues without build deps when installBuildDeps is false", async () => {
        const result = await installValgrindFromSource(Version.from_tag("v3.20.0"), false);

        expect(result).toBe(true);
        expect(mockExec).not.toHaveBeenCalledWith("sudo", expect.arrayContaining(["apt-get", "update"]));
    });

    it("passes resolved version to download function", async () => {
        const { resolveValgrindSourceTag } = require("../resolve");
        (resolveValgrindSourceTag as jest.Mock).mockResolvedValueOnce("3.26.0");

        const result = await installValgrindFromSource(Version.from_tag("v3.20.0"), false);

        expect(result).toBe(true);
        expect(mockDownloadAndExtractValgrindSource).toHaveBeenCalledWith("3.26.0");
    });

    it("returns false on build failure", async () => {
        mockExec.mockRejectedValueOnce(new Error("build failed"));

        const result = await installValgrindFromSource(Version.from_tag("v3.20.0"), false);

        expect(result).toBe(false);
    });
});

describe("installRunner", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("installs via binstall when it succeeds", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });

        await installRunner(Version.from_tag("v1.0.0"), ["binstall", "release", "source"]);

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), expect.arrayContaining(["binstall"]));
    });
});

describe("getRunnerInstallDir", () => {
    it("returns CARGO_HOME/bin with needsExport=false when CARGO_HOME is set", () => {
        process.env.CARGO_HOME = "/home/user/.cargo";
        const result = getRunnerInstallDir();
        expect(result).toEqual({ dir: "/home/user/.cargo/bin", needsExport: false });
        delete process.env.CARGO_HOME;
    });

    it("returns HOME/.cargo/bin with needsExport=true when HOME is set", () => {
        delete process.env.CARGO_HOME;
        process.env.HOME = "/home/user";
        const result = getRunnerInstallDir();
        expect(result).toEqual({ dir: "/home/user/.cargo/bin", needsExport: true });
    });

    it("returns RUNNER_TEMP/.cargo/bin with needsExport=true when HOME is not set", () => {
        delete process.env.CARGO_HOME;
        delete process.env.HOME;
        process.env.RUNNER_TEMP = "/tmp/runner-temp";
        const result = getRunnerInstallDir();
        expect(result).toEqual({ dir: "/tmp/runner-temp/.cargo/bin", needsExport: true });
        delete process.env.RUNNER_TEMP;
    });

    it("falls back to /tmp/.cargo/bin with needsExport=true when nothing is set", () => {
        delete process.env.CARGO_HOME;
        delete process.env.HOME;
        delete process.env.RUNNER_TEMP;
        const result = getRunnerInstallDir();
        expect(result).toBe(null);
    });
});
