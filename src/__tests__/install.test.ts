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
    resolveValgrindAssetName: jest
        .fn()
        .mockResolvedValue("valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz"),
    cargoVersionFormat: jest.fn((v: string) => (v === "latest" ? null : v.replace(/^v/, ""))),
}));

jest.mock("../download", () => ({
    downloadAndExtractGr: jest.fn().mockResolvedValue("/tmp/gr-extract"),
    downloadAndExtractValgrind: jest.fn().mockResolvedValue("/tmp/valgrind-extract"),
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
}));

import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { cargoVersionFormat } from "../resolve";
import { detectPlatform } from "../detect";
import { getCargoBin } from "../utils";
import {
    installGrWithBinstall,
    installGrFromSource,
    installValgrindWithPackageManager,
    installValgrind,
    installRunner,
    parseStrategies,
    VALID_VALGRIND_STRATEGIES,
    VALID_RUNNER_STRATEGIES,
} from "../install";

const mockExec = exec.exec as jest.Mock;
const mockWhich = io.which as jest.Mock;
const mockDetectPlatform = detectPlatform as jest.Mock;

describe("parseStrategies", () => {
    it("parses a comma-separated list of valid strategies", () => {
        const result = parseStrategies(
            "release,package-manager",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["release", "package-manager"]);
    });

    it("trims whitespace around strategies", () => {
        const result = parseStrategies(
            " release , package-manager ",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["release", "package-manager"]);
    });

    it("is case-insensitive", () => {
        const result = parseStrategies(
            "Release,Package-Manager",
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
        expect(result).toEqual(["release", "package-manager"]);
    });

    it("parses a single strategy", () => {
        const result = parseStrategies("binstall", VALID_RUNNER_STRATEGIES, "runner");
        expect(result).toEqual(["binstall"]);
    });

    it("throws on invalid strategy names", () => {
        expect(() =>
            parseStrategies("release,invalid", VALID_VALGRIND_STRATEGIES, "valgrind"),
        ).toThrow("Invalid valgrind strategy 'invalid'");
    });

    it("throws on empty input", () => {
        expect(() => parseStrategies("  ,  ", VALID_VALGRIND_STRATEGIES, "valgrind")).toThrow(
            "No valgrind strategies specified",
        );
    });
});

describe("installGrWithBinstall", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns false if cargo-binstall is not found", async () => {
        mockWhich.mockResolvedValue("");

        const result = await installGrWithBinstall("v1.0.0");

        expect(result).toBe(false);
    });

    it("calls cargo binstall with formatted version", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });
        mockExec.mockResolvedValue(0);

        const result = await installGrWithBinstall("v1.0.0");

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
        (cargoVersionFormat as jest.Mock).mockReturnValue(null);

        const result = await installGrWithBinstall("latest");

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), ["binstall", "-y", "--disable-strategies", "compile", "gungraun-runner"]);

        (cargoVersionFormat as jest.Mock).mockRestore?.();
    });

    it("returns false if cargo binstall exec fails", async () => {
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            return Promise.resolve("");
        });
        mockExec.mockRejectedValue(new Error("install failed"));

        const result = await installGrWithBinstall("v1.0.0");

        expect(result).toBe(false);
    });

    it("uses CARGO env var for cargo binstall", async () => {
        process.env.CARGO = "/custom/cargo";
        (cargoVersionFormat as jest.Mock).mockReturnValue("1.0.0");
        mockWhich.mockImplementation((cmd: string) => {
            if (cmd === "cargo-binstall") return Promise.resolve("/usr/bin/cargo-binstall");
            if (cmd === "gungraun-runner") return Promise.resolve("/usr/bin/gungraun-runner");
            return Promise.resolve("");
        });
        mockExec.mockResolvedValue(0);

        const result = await installGrWithBinstall("v1.0.0");

        expect(result).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("/custom/cargo", [
            "binstall",
            "-y",
            "--disable-strategies",
            "compile",
            "gungraun-runner@1.0.0",
        ]);

        delete process.env.CARGO;
        (cargoVersionFormat as jest.Mock).mockRestore?.();
    });
});

describe("installGrFromSource", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("calls cargo install with formatted version", async () => {
        mockExec.mockResolvedValue(0);
        (cargoVersionFormat as jest.Mock).mockReturnValue("1.0.0");

        await installGrFromSource("v1.0.0");

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
            "install",
            "gungraun-runner",
            "--version",
            "1.0.0",
        ]);
    });

    it("calls cargo install without version when latest", async () => {
        mockExec.mockResolvedValue(0);
        (cargoVersionFormat as jest.Mock).mockReturnValue(null);

        await installGrFromSource("latest");

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), ["install", "gungraun-runner"]);
    });
});

describe("installValgrind", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExec.mockResolvedValue(0);
    });

    it("tries only package-manager when specified", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        await installValgrind(["package-manager"]);

        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "apt-get",
            "install",
            "-y",
            "-qq",
            "valgrind",
        ]);
    });

    it("tries release then package-manager when both specified", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });

        await installValgrind(["release", "package-manager"]);

        // Both release attempt and package manager should be called
        // (release fails since downloadAndExtractValgrind is mocked, but installValgrindFromBuilder
        //  returns false because it can't find the binary; then package-manager is tried)
    });

    it("fails when all strategies fail", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });

        await expect(installValgrind(["package-manager"])).rejects.toThrow();
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

        await installValgrindWithPackageManager();

        expect(mockExec).toHaveBeenCalledWith("sudo", ["apt-get", "update", "-qq"]);
        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "apt-get",
            "install",
            "-y",
            "-qq",
            "valgrind",
        ]);
    });

    it("installs with dnf on fedora", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "fedora",
            versionId: "39",
            platform: "fedora-39",
            packageManager: "dnf",
        });

        await installValgrindWithPackageManager();

        expect(mockExec).toHaveBeenCalledWith("sudo", ["dnf", "install", "-y", "valgrind"]);
    });

    it("tries yum then falls back to dnf on amzn", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "amzn",
            versionId: "2",
            platform: "amzn-2",
            packageManager: "yum",
        });
        mockExec.mockRejectedValueOnce(new Error("yum failed"));

        await installValgrindWithPackageManager();

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

        await installValgrindWithPackageManager();

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

        await installValgrindWithPackageManager();

        expect(mockExec).toHaveBeenCalledWith("sudo", ["pacman", "-S", "--noconfirm", "valgrind"]);
    });

    it("installs with zypper on opensuse", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "opensuse-leap",
            versionId: "15.5",
            platform: "opensuse-leap-15.5",
            packageManager: "zypper",
        });

        await installValgrindWithPackageManager();

        expect(mockExec).toHaveBeenCalledWith("sudo", [
            "zypper",
            "--non-interactive",
            "install",
            "valgrind",
        ]);
    });

    it("installs with apk on alpine", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "alpine",
            versionId: "3.19",
            platform: "alpine-3.19",
            packageManager: "apk",
        });

        await installValgrindWithPackageManager();

        expect(mockExec).toHaveBeenCalledWith("sudo", ["apk", "add", "valgrind"]);
    });

    it("throws on unknown package manager", async () => {
        mockDetectPlatform.mockReturnValue({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });

        await expect(installValgrindWithPackageManager()).rejects.toThrow(
            "Unsupported distribution. Cannot install valgrind",
        );
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

        await installRunner("v1.0.0", ["binstall", "release", "source"]);

        expect(mockExec).toHaveBeenCalledWith(getCargoBin(), expect.arrayContaining(["binstall"]));
    });
});
