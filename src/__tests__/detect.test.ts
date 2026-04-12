jest.mock("@actions/exec", () => ({
    exec: jest.fn().mockResolvedValue(0),
    getExecOutput: jest.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

jest.mock("@actions/core", () => ({
    setFailed: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
}));

jest.mock("../utils", () => ({
    bail: jest.fn((msg: string) => {
        throw new Error(msg);
    }),
    printError: jest.fn(),
    printInfo: jest.fn(),
    printWarning: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    withGroup: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
    logInstalledVersion: jest.fn(),
    getCargoBin: jest.fn(() => process.env.CARGO || "cargo"),
    GITHUB_REPO: "gungraun/gungraun",
    VALGRIND_REPO: "gungraun/valgrind-builder",
}));

jest.mock("fs", () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue(""),
}));

import {
    detectArch,
    detectTarget,
    detectPlatform,
    resolvePackageManager,
    detectProjectVersion,
} from "../detect";
import * as exec from "@actions/exec";
import * as fs from "fs";
import { bail } from "../utils";

const mockGetExecOutput = exec.getExecOutput as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;

describe("detectArch", () => {
    it("extracts arch from a full target triple", () => {
        expect(detectArch("x86_64-unknown-linux-gnu")).toBe("x86_64");
    });

    it("extracts arch from an arm target", () => {
        expect(detectArch("aarch64-unknown-linux-gnu")).toBe("aarch64");
    });

    it("extracts arch from a simple hyphenated string", () => {
        expect(detectArch("armv7-something-else")).toBe("armv7");
    });

    it("returns the whole string if no hyphen", () => {
        expect(detectArch("x86_64")).toBe("x86_64");
    });
});

describe("detectTarget", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns RUNNER_TARGET env var when set", async () => {
        process.env.RUNNER_TARGET = "some-test-value";

        const result = await detectTarget();

        expect(result).toBe("some-test-value");
        expect(mockGetExecOutput).not.toHaveBeenCalled();

        delete process.env.RUNNER_TARGET;
    });

    it("parses target from rustc -vV output", async () => {
        delete process.env.RUNNER_TARGET;

        let stdout = `rustc 1.94.1 (e408947bf 2026-03-25)
binary: rustc
commit-hash: e408947bfd200af42db322daf0fadfe7e26d3bd1
commit-date: 2026-03-25
host: x86_64-unknown-linux-gnu
release: 1.94.1
LLVM version: 21.1.8`;

        mockGetExecOutput.mockResolvedValue({
            stdout: stdout,
        });

        const result = await detectTarget();

        expect(result).toBe("x86_64-unknown-linux-gnu");
        expect(mockGetExecOutput).toHaveBeenCalledWith("rustc", ["-vV"], {
            silent: true,
        });
    });

    it("calls printErr when host line is missing from rustc output", async () => {
        delete process.env.RUNNER_TARGET;
        mockGetExecOutput.mockResolvedValue({
            stdout: "rustc 1.70.0\n",
        });

        await expect(detectTarget()).rejects.toThrow("Could not detect target from rustc -vV");
        expect(bail).toHaveBeenCalledWith("Could not detect target from rustc -vV");
    });
});

describe("detectPlatform", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("parses /etc/os-release correctly", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(
            'ID=ubuntu\nVERSION_ID="22.04"\nID_LIKE=debian\nPRETTY_NAME="Ubuntu 22.04"\n',
        );

        const result = detectPlatform();

        expect(result).toEqual({
            id: "ubuntu",
            versionId: "22.04",
            platform: "ubuntu-22.04",
            packageManager: "apt-get",
        });
    });

    it("parses /etc/os-release with quoted ID", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID="debian"\nVERSION_ID="11"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "debian",
            versionId: "11",
            platform: "debian-11",
            packageManager: "apt-get",
        });
    });

    it("detects fedora with dnf via fallback", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID=fedora\nVERSION_ID="39"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "fedora",
            versionId: "39",
            platform: "fedora-39",
            packageManager: "dnf",
        });
    });

    it("detects alpine with apk via fallback", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID=alpine\nVERSION_ID="3.19"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "alpine",
            versionId: "3.19",
            platform: "alpine-3.19",
            packageManager: "apk",
        });
    });

    it("detects rhel with dnf via ID_LIKE containing fedora", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID=rhel\nVERSION_ID="9.2"\nID_LIKE="rhel fedora"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "rhel",
            versionId: "9.2",
            platform: "rhel-9.2",
            packageManager: "dnf",
        });
    });

    it("detects amazon linux with yum via fallback", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID=amzn\nVERSION_ID="2"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "amzn",
            versionId: "2",
            platform: "amzn-2",
            packageManager: "yum",
        });
    });

    it("detects opensuse with zypper via ID_LIKE", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID="opensuse-leap"\nVERSION_ID="15.5"\nID_LIKE="suse"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "opensuse-leap",
            versionId: "15.5",
            platform: "opensuse-leap-15.5",
            packageManager: "zypper",
        });
    });

    it("returns null packageManager for unknown distro", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('ID=gentoo\nVERSION_ID="2.14"\n');

        const result = detectPlatform();

        expect(result).toEqual({
            id: "gentoo",
            versionId: "2.14",
            platform: "gentoo-2.14",
            packageManager: null,
        });
    });

    it("calls printErr when /etc/os-release does not exist", () => {
        mockExistsSync.mockReturnValue(false);

        expect(() => detectPlatform()).toThrow("Cannot detect platform: /etc/os-release not found");
        expect(bail).toHaveBeenCalledWith("Cannot detect platform: /etc/os-release not found");
    });

    it("calls printErr when ID is missing", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue("SOME_VAR=value\n");

        expect(() => detectPlatform()).toThrow(
            "Cannot detect platform: ID missing from /etc/os-release",
        );
    });

    it("handles missing VERSION_ID gracefully", () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue("ID=arch\n");

        const result = detectPlatform();

        expect(result).toEqual({
            id: "arch",
            versionId: null,
            platform: "arch-unknown",
            packageManager: "pacman",
        });
    });
});

describe("resolvePackageManager", () => {
    it("matches ID_LIKE containing debian", () => {
        expect(resolvePackageManager("ubuntu", "debian")).toBe("apt-get");
    });

    it("matches ID_LIKE containing multiple values with debian", () => {
        expect(resolvePackageManager("linuxmint", "linuxmint debian")).toBe("apt-get");
    });

    it("matches ID_LIKE containing fedora", () => {
        expect(resolvePackageManager("rocky", "rhel centos fedora")).toBe("dnf");
    });

    it("matches ID_LIKE containing suse", () => {
        expect(resolvePackageManager("opensuse-leap", "suse")).toBe("zypper");
    });

    it("matches ID_LIKE containing arch", () => {
        expect(resolvePackageManager("manjaro", "arch")).toBe("pacman");
    });

    it("matches ID_LIKE containing alpine", () => {
        expect(resolvePackageManager("postmarketos", "alpine")).toBe("apk");
    });

    it("falls back to PACKAGE_MANAGERS when ID_LIKE is null", () => {
        expect(resolvePackageManager("debian", null)).toBe("apt-get");
    });

    it("falls back to PACKAGE_MANAGERS for fedora with null ID_LIKE", () => {
        expect(resolvePackageManager("fedora", null)).toBe("dnf");
    });

    it("falls back to PACKAGE_MANAGERS for arch with null ID_LIKE", () => {
        expect(resolvePackageManager("arch", null)).toBe("pacman");
    });

    it("falls back to PACKAGE_MANAGERS for alpine with null ID_LIKE", () => {
        expect(resolvePackageManager("alpine", null)).toBe("apk");
    });

    it("falls back to PACKAGE_MANAGERS for amzn with null ID_LIKE", () => {
        expect(resolvePackageManager("amzn", null)).toBe("yum");
    });

    it("returns null for unknown id with no ID_LIKE", () => {
        expect(resolvePackageManager("gentoo", null)).toBeNull();
    });

    it("returns null for unknown ID_LIKE that matches no pattern", () => {
        expect(resolvePackageManager("gentoo", "unknown")).toBeNull();
    });
});

describe("detectProjectVersion", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.CARGO;
    });

    afterEach(() => {
        delete process.env.CARGO;
    });

    it("uses cargo from CARGO env var when set", async () => {
        process.env.CARGO = "/custom/path/cargo";
        const metadata = JSON.stringify({
            packages: [{ name: "gungraun", version: "2.0.0" }],
        });
        mockGetExecOutput.mockResolvedValue({ stdout: metadata, stderr: "", exitCode: 0 });

        const result = await detectProjectVersion();

        expect(result).toBe("2.0.0");
        expect(mockGetExecOutput).toHaveBeenCalledWith(
            "/custom/path/cargo",
            ["metadata", "--format-version=1"],
            { silent: true, ignoreReturnCode: true },
        );
    });

    it("falls back to cargo when CARGO env var is not set", async () => {
        const metadata = JSON.stringify({
            packages: [{ name: "gungraun", version: "1.5.0" }],
        });
        mockGetExecOutput.mockResolvedValue({ stdout: metadata, stderr: "", exitCode: 0 });

        const result = await detectProjectVersion();

        expect(result).toBe("1.5.0");
        expect(mockGetExecOutput).toHaveBeenCalledWith(
            "cargo",
            ["metadata", "--format-version=1"],
            { silent: true, ignoreReturnCode: true },
        );
    });

    it("calls printErr when multiple gungraun versions are found", async () => {
        const metadata = JSON.stringify({
            packages: [
                { name: "gungraun", version: "0.17.2" },
                { name: "gungraun", version: "0.18.1" },
            ],
        });
        mockGetExecOutput.mockResolvedValue({ stdout: metadata, stderr: "", exitCode: 0 });

        await expect(detectProjectVersion()).rejects.toThrow(
            "Multiple gungraun versions detected in project (0.17.2, 0.18.1). Set runner-version explicitly.",
        );
        expect(bail).toHaveBeenCalledWith(
            "Multiple gungraun versions detected in project (0.17.2, 0.18.1). Set runner-version explicitly.",
        );
    });

    it("falls back to cargo pkgid when metadata has no gungraun package", async () => {
        const metadata = JSON.stringify({
            packages: [{ name: "other", version: "1.0.0" }],
        });
        mockGetExecOutput
            .mockResolvedValueOnce({ stdout: metadata, stderr: "", exitCode: 0 })
            .mockResolvedValueOnce({ stdout: "gungraun#1.2.3", stderr: "", exitCode: 0 });

        const result = await detectProjectVersion();

        expect(result).toBe("1.2.3");
    });

    it("calls printErr when no gungraun version can be detected", async () => {
        mockGetExecOutput.mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 });

        await expect(detectProjectVersion()).rejects.toThrow(
            "Could not detect gungraun-runner version from project. Set runner-version explicitly.",
        );
        expect(bail).toHaveBeenCalledWith(
            "Could not detect gungraun-runner version from project. Set runner-version explicitly.",
        );
    });
});
