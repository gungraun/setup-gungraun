import { cargoVersionFormat, escapeRegex, resolveVersion, resolveValgrindTag } from "../resolve";
import { getOctokit } from "@actions/github";

jest.mock("@actions/github");

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
        const result = await resolveVersion("v1.0.0");
        expect(result).toBe("v1.0.0");
    });

    it("returns version unchanged for arbitrary strings", async () => {
        const result = await resolveVersion("1.2.3");
        expect(result).toBe("1.2.3");
    });

    it("resolves 'latest' using GitHub API", async () => {
        process.env.GITHUB_TOKEN = "fake-token";
        mockGetLatestRelease.mockResolvedValue({ data: { tag_name: "v2.0.0" } });

        const result = await resolveVersion("latest");
        expect(result).toBe("v2.0.0");
        expect(mockGetLatestRelease).toHaveBeenCalledWith(
            expect.objectContaining({ owner: "gungraun", repo: "gungraun" }),
        );

        delete process.env.GITHUB_TOKEN;
    });

    it("throws if GITHUB_TOKEN is missing and version is 'latest'", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;

        await expect(resolveVersion("latest")).rejects.toThrow(
            "Could not determine latest release version for gungraun-runner",
        );

        process.env.GITHUB_TOKEN = originalToken;
    });

    it("throws if GitHub API call fails", async () => {
        process.env.GITHUB_TOKEN = "fake-token";
        mockGetLatestRelease.mockRejectedValue(new Error("API error"));

        await expect(resolveVersion("latest")).rejects.toThrow(
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
