import {
    cargoVersionFormat,
    escapeRegex,
    resolveRunnerVersion,
    resolveValgrindTag,
    resolveValgrindVersion,
} from "../resolve";
import * as exec from "@actions/exec";
import { getOctokit } from "@actions/github";

jest.mock("@actions/github");

jest.mock("@actions/exec", () => ({
    exec: jest.fn().mockResolvedValue(0),
    getExecOutput: jest.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

const mockGetLatestRelease = jest.fn();
(getOctokit as jest.Mock).mockReturnValue({
    rest: {
        repos: {
            getLatestRelease: mockGetLatestRelease,
        },
    },
});

describe("cargoVersionFormat", () => {
    it("strips leading v from version", () => {
        expect(cargoVersionFormat("v1.2.3")).toBe("1.2.3");
    });

    it("returns version unchanged if no leading v", () => {
        expect(cargoVersionFormat("1.2.3")).toBe("1.2.3");
    });

    it("returns null for 'latest'", () => {
        expect(cargoVersionFormat("latest")).toBeNull();
    });

    it("strips only the first v", () => {
        expect(cargoVersionFormat("vv1.0.0")).toBe("v1.0.0");
    });
});

describe("escapeRegex", () => {
    it("escapes special regex characters", () => {
        expect(escapeRegex("x86_64")).toBe("x86_64");
        expect(escapeRegex("a.b")).toBe("a\\.b");
        expect(escapeRegex("a*b+c?d")).toBe("a\\*b\\+c\\?d");
        expect(escapeRegex("(test)")).toBe("\\(test\\)");
        expect(escapeRegex("[0-9]")).toBe("\\[0-9\\]");
        expect(escapeRegex("a$b")).toBe("a\\$b");
        expect(escapeRegex("a|b")).toBe("a\\|b");
    });

    it("returns plain strings unchanged", () => {
        expect(escapeRegex("hello")).toBe("hello");
        expect(escapeRegex("ubuntu2204")).toBe("ubuntu2204");
    });
});

describe("resolveVersion", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns version unchanged when not 'latest'", async () => {
        const result = await resolveRunnerVersion("v1.0.0");
        expect(result).toBe("v1.0.0");
    });

    it("returns version unchanged for arbitrary strings", async () => {
        const result = await resolveRunnerVersion("1.2.3");
        expect(result).toBe("1.2.3");
    });

    it("resolves 'latest' using GitHub API", async () => {
        process.env.GITHUB_TOKEN = "fake-token";
        mockGetLatestRelease.mockResolvedValue({ data: { tag_name: "v2.0.0" } });

        const result = await resolveRunnerVersion("latest");
        expect(result).toBe("v2.0.0");
        expect(mockGetLatestRelease).toHaveBeenCalledWith(
            expect.objectContaining({ owner: "gungraun", repo: "gungraun" }),
        );

        delete process.env.GITHUB_TOKEN;
    });

    it("throws if GITHUB_TOKEN is missing and version is 'latest'", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;

        await expect(resolveRunnerVersion("latest")).rejects.toThrow(
            "Could not determine latest release version for gungraun-runner",
        );

        process.env.GITHUB_TOKEN = originalToken;
    });

    it("throws if GitHub API call fails", async () => {
        process.env.GITHUB_TOKEN = "fake-token";
        mockGetLatestRelease.mockRejectedValue(new Error("API error"));

        await expect(resolveRunnerVersion("latest")).rejects.toThrow(
            "Could not determine latest release version for gungraun-runner",
        );

        delete process.env.GITHUB_TOKEN;
    });
});

describe("resolveValgrindTag", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns version unchanged when not 'latest'", async () => {
        const result = await resolveValgrindTag("v3.20.0");
        expect(result).toBe("v3.20.0");
    });

    it("resolves 'latest' using GitHub API with valgrind repo", async () => {
        process.env.GITHUB_TOKEN = "fake-token";
        mockGetLatestRelease.mockResolvedValue({ data: { tag_name: "v3.21.0" } });

        const result = await resolveValgrindTag("latest");
        expect(result).toBe("v3.21.0");
        expect(mockGetLatestRelease).toHaveBeenCalledWith(
            expect.objectContaining({ owner: "gungraun", repo: "valgrind-builder" }),
        );

        delete process.env.GITHUB_TOKEN;
    });

    it("throws if GITHUB_TOKEN is missing and version is 'latest'", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;

        await expect(resolveValgrindTag("latest")).rejects.toThrow(
            "Could not determine latest valgrind release version",
        );

        process.env.GITHUB_TOKEN = originalToken;
    });
});

describe("resolveValgrindSourceTag", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns version with v prefix stripped when not 'latest'", async () => {
        const result = await resolveValgrindVersion("v3.20.0");
        expect(result).toBe("3.20.0");
    });

    it("returns version unchanged when no v prefix", async () => {
        const result = await resolveValgrindVersion("3.20.0");
        expect(result).toBe("3.20.0");
    });

    it("resolves 'latest' from git ls-remote output", async () => {
        const mockOutput = [
            "abc123\trefs/tags/VALGRIND_3_24_0",
            "def456\trefs/tags/VALGRIND_3_25_0",
            "ghi789\trefs/tags/VALGRIND_3_25_1",
            "jkl012\trefs/tags/VALGRIND_3_26_0",
        ].join("\n");
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: mockOutput,
            stderr: "",
            exitCode: 0,
        });

        const result = await resolveValgrindVersion("latest");
        expect(result).toBe("3.26.0");
    });

    it("ignores annotated tag ^{} entries", async () => {
        const mockOutput = [
            "abc123\trefs/tags/VALGRIND_3_26_0",
            "abc123\trefs/tags/VALGRIND_3_26_0^{}",
        ].join("\n");
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: mockOutput,
            stderr: "",
            exitCode: 0,
        });

        const result = await resolveValgrindVersion("latest");
        expect(result).toBe("3.26.0");
    });

    it("ignores svn-prefixed tags", async () => {
        const mockOutput = [
            "abc123\trefs/tags/svn/VALGRIND_3_12_0",
            "def456\trefs/tags/VALGRIND_3_26_0",
        ].join("\n");
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: mockOutput,
            stderr: "",
            exitCode: 0,
        });

        const result = await resolveValgrindVersion("latest");
        expect(result).toBe("3.26.0");
    });

    it("sorts versions by semver and returns the highest", async () => {
        const mockOutput = [
            "aaa\trefs/tags/VALGRIND_3_9_0",
            "bbb\trefs/tags/VALGRIND_3_10_0",
            "ccc\trefs/tags/VALGRIND_3_26_0",
        ].join("\n");
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: mockOutput,
            stderr: "",
            exitCode: 0,
        });

        const result = await resolveValgrindVersion("latest");
        expect(result).toBe("3.26.0");
    });

    it("throws when no valgrind tags found", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: "",
            stderr: "",
            exitCode: 0,
        });

        await expect(resolveValgrindVersion("latest")).rejects.toThrow(
            "Could not determine latest valgrind version from sourceware.org",
        );
    });
});
