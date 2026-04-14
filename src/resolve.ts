import * as exec from "@actions/exec";
import { getOctokit } from "@actions/github";
import { escapeRegex, GITHUB_REPO, VALGRIND_BUILDER_REPO } from "./utils";
import { ResolvedVersion, Version } from "./version";

const VALGRIND_SOURCE_REPO = "https://sourceware.org/git/valgrind.git";

interface ReleaseAsset {
    name: string;
    browserDownloadUrl: string;
}

interface ReleaseInfo {
    tagName: string;
    assets: ReleaseAsset[];
}

/** Fetches release assets for a given repo and tag from the GitHub API. */
export async function getReleaseAssets(
    repo: string,
    version: Version,
    githubToken: string,
): Promise<ReleaseInfo> {
    const octokit = getOctokit(githubToken);
    const [owner, repoName] = repo.split("/");

    let release: {
        data: { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    };
    if (version.isLatest()) {
        release = await octokit.rest.repos.getLatestRelease({
            owner,
            repo: repoName,
        });
    } else {
        release = await octokit.rest.repos.getReleaseByTag({
            owner,
            repo: repoName,
            tag: version.withPrefix(),
        });
    }

    return {
        tagName: release.data.tag_name,
        assets: release.data.assets.map((a) => ({
            name: a.name,
            browserDownloadUrl: a.browser_download_url,
        })),
    };
}

async function resolveLatestTag(
    repo: string,
    notFoundMessage: string,
    githubToken: string,
): Promise<ResolvedVersion> {
    let tag: string;
    try {
        const octokit = getOctokit(githubToken);
        const [owner, repoName] = repo.split("/");
        const { data } = await octokit.rest.repos.getLatestRelease({
            owner,
            repo: repoName,
        });
        tag = data.tag_name;
    } catch (error) {
        throw new Error(notFoundMessage + `: ${(error as Error).message}`);
    }

    return ResolvedVersion.from_tag(tag);
}

/** Resolves the valgrind asset name matching the given architecture and platform. */
export async function resolveValgrindBuilderAssetName(
    version: Version,
    arch: string,
    platform: string,
    githubToken: string,
): Promise<{ version: ResolvedVersion; name: string } | null> {
    // This is not the version of valgrind but the version of valgrind-builder and we always want
    // the assets from the latest valgrind-builder release.
    const release = await getReleaseAssets(VALGRIND_BUILDER_REPO, Version.latest(), githubToken);

    // Example: valgrind-3.19.0-x86_64-ubuntu-22.04.tar.gz
    if (version.isLatest()) {
        const pattern = new RegExp(
            `^valgrind-(\\d+)\\.(\\d+)\\.(\\d+)-${escapeRegex(arch)}-${escapeRegex(platform)}\\.tar\\.gz$`,
        );

        const sorted = release.assets
            .map((a) => a.name.match(pattern))
            .filter((match) => match != null)
            .map((m) => {
                // shadows the global version
                let version = new ResolvedVersion(+m![1], +m![2], +m![3]);
                let name = m[0];

                return {
                    version,
                    name,
                };
            })
            .sort((a, b) => {
                const { version: versionA } = a;
                const { version: versionB } = b;

                return (
                    versionA.major - versionB.major ||
                    versionA.minor - versionB.minor ||
                    versionA.patch - versionB.patch
                );
            });

        return sorted[sorted.length - 1] ?? null;
    } else {
        const expected = `valgrind-${version}-${arch}-${platform}.tar.gz`;
        const match = release.assets.find((a) => a.name === expected);
        if (!match) {
            return null;
        } else {
            return {
                version: ResolvedVersion.from_version(version),
                name: match.name,
            };
        }
    }
}

/** Resolves a gungraun-runner version tag, fetching "latest" from GitHub if needed. */
export async function resolveVersion(
    version: Version,
    githubToken: string,
): Promise<ResolvedVersion> {
    if (!version.isLatest()) {
        return version;
    }

    return await resolveLatestTag(
        GITHUB_REPO,
        "Could not determine latest release version for gungraun-runner",
        githubToken,
    );
}

/** Resolves a valgrind version for building from source, using git ls-remote for "latest". */
export async function resolveValgrindSourceTag(version: Version): Promise<ResolvedVersion> {
    if (!version.isLatest()) {
        return version;
    }

    const { stdout } = await exec.getExecOutput(
        "git",
        ["ls-remote", "--tags", VALGRIND_SOURCE_REPO],
        {
            silent: true,
        },
    );

    const versions: ResolvedVersion[] = [];
    for (const line of stdout.trim().split("\n")) {
        if (line.includes("^{}")) continue;
        versions.push(ResolvedVersion.from_valgrind_tag(line));
    }

    if (versions.length === 0) {
        throw new Error("Could not determine latest valgrind version from sourceware.org");
    }

    versions.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch);
    return versions[versions.length - 1];
}
