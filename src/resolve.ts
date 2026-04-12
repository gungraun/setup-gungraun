import { getOctokit } from "@actions/github";
import { GITHUB_REPO, VALGRIND_REPO } from "./utils";

interface ReleaseAsset {
    name: string;
    browserDownloadUrl: string;
}

interface ReleaseInfo {
    tagName: string;
    assets: ReleaseAsset[];
}

/** Strip the leading "v" from a version string, returning null for "latest". */
export function cargoVersionFormat(version: string): string | null {
    if (version === "latest") {
        return null;
    }
    return version.replace(/^v/, "");
}

/** Escapes special regex characters in a string. */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fetches release assets for a given repo and tag from the GitHub API. */
export async function getReleaseAssets(repo: string, tag: string): Promise<ReleaseInfo> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error("GITHUB_TOKEN is required for GitHub API calls");
    }

    const octokit = getOctokit(token);
    const [owner, repoName] = repo.split("/");

    const { data } = await octokit.rest.repos.getReleaseByTag({
        owner,
        repo: repoName,
        tag,
    });

    return {
        tagName: data.tag_name,
        assets: data.assets.map((a) => ({
            name: a.name,
            browserDownloadUrl: a.browser_download_url,
        })),
    };
}

async function resolveLatestTag(repo: string, notFoundMessage: string): Promise<string> {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
        try {
            const octokit = getOctokit(token);
            const [owner, repoName] = repo.split("/");
            const { data } = await octokit.rest.repos.getLatestRelease({
                owner,
                repo: repoName,
            });
            return data.tag_name;
        } catch {
            // Fall through to error
        }
    }

    throw new Error(notFoundMessage);
}

/** Resolves the valgrind asset name matching the given architecture and platform. */
export async function resolveValgrindAssetName(
    tag: string,
    arch: string,
    platform: string,
): Promise<string | null> {
    const release = await getReleaseAssets(VALGRIND_REPO, tag);
    const pattern = new RegExp(
        `^valgrind-\\d+\\.\\d+\\.\\d+-${escapeRegex(arch)}-${escapeRegex(platform)}\\.tar\\.gz$`,
    );

    const matching = release.assets
        .map((a) => a.name)
        .filter((name) => pattern.test(name))
        .sort()
        .slice(-1);

    return matching[0] ?? null;
}

/** Resolves a valgrind version tag, fetching "latest" from GitHub if needed. */
export async function resolveValgrindTag(version: string): Promise<string> {
    if (version !== "latest") {
        return version;
    }
    return resolveLatestTag(VALGRIND_REPO, "Could not determine latest valgrind release version");
}

/** Resolves a gungraun-runner version tag, fetching "latest" from GitHub if needed. */
export async function resolveVersion(version: string): Promise<string> {
    if (version !== "latest") {
        return version;
    }
    return resolveLatestTag(
        GITHUB_REPO,
        "Could not determine latest release version for gungraun-runner",
    );
}
