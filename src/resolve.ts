import * as exec from '@actions/exec';
import { getOctokit } from '@actions/github';
import {
    GUNGRAUN_REPO,
    isDebug,
    retry,
    VALGRIND_BUILDER_REPO,
    VALGRIND_SOURCE_REPO
} from './utils';
import { ResolvedVersion, Version } from './version';

interface ReleaseAsset {
    name: string;
    browserDownloadUrl: string;
}

interface ReleaseInfo {
    tagName: string;
    assets: ReleaseAsset[];
}

/** Fetches release assets for a given repo and tag from the GitHub API. */
export async function fetchReleaseAssetData(
    repo: string,
    version: Version,
    githubToken: string
): Promise<ReleaseInfo> {
    const octokit = getOctokit(githubToken);
    const [owner, repoName] = repo.split('/');

    let release: {
        data: { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    };
    if (version.isLatest()) {
        release = await octokit.rest.repos.getLatestRelease({
            owner,
            repo: repoName
        });
    } else {
        release = await octokit.rest.repos.getReleaseByTag({
            owner,
            repo: repoName,
            tag: version.withPrefix()
        });
    }

    return {
        tagName: release.data.tag_name,
        assets: release.data.assets.map((a) => ({
            name: a.name,
            browserDownloadUrl: a.browser_download_url
        }))
    };
}

export async function fetchRunnerVersions(githubToken: string): Promise<ResolvedVersion[]> {
    try {
        const octokit = getOctokit(githubToken);
        const [owner, repoName] = GUNGRAUN_REPO.split('/');
        const { data } = await octokit.rest.repos.listReleases({
            owner,
            repo: repoName
        });
        return data.map((d: { tag_name: string }) => ResolvedVersion.fromString(d.tag_name));
    } catch (error) {
        throw new Error(`Failed to fetch gungraun-runner versions: ${(error as Error).message}`);
    }
}

export async function fetchSortedValgrindVersions(): Promise<ResolvedVersion[]> {
    const stdout = await retry(5, async () => {
        const output = await exec.getExecOutput(
            'git',
            ['ls-remote', '--tags', VALGRIND_SOURCE_REPO],
            {
                silent: !isDebug()
            }
        );
        return output.stdout;
    });

    const versions = stdout
        .trim()
        .split('\n')
        .filter((l) => !l.includes('^{}'))
        .map((l) => ResolvedVersion.fromValgrindTag(l))
        .sort((a, b) => a.compare(b));

    if (versions.length === 0) {
        throw new Error('Could not determine latest valgrind version from sourceware.org');
    }

    return versions;
}

async function resolveLatestTag(
    repo: string,
    notFoundMessage: string,
    githubToken: string
): Promise<ResolvedVersion> {
    let tag: string;
    try {
        const octokit = getOctokit(githubToken);
        const [owner, repoName] = repo.split('/');
        const { data } = await octokit.rest.repos.getLatestRelease({
            owner,
            repo: repoName
        });
        tag = data.tag_name;
    } catch (error) {
        throw new Error(notFoundMessage + `: ${(error as Error).message}`);
    }

    return ResolvedVersion.fromString(tag);
}

/** Resolves a gungraun-runner version tag, fetching "latest" from GitHub if needed. */
export async function resolveRunnerVersion(
    version: Version,
    githubToken: string
): Promise<ResolvedVersion> {
    if (!version.isAutoOrLatest()) {
        return version;
    }

    return await resolveLatestTag(
        GUNGRAUN_REPO,
        'Could not determine latest release version for gungraun-runner',
        githubToken
    );
}

/** Resolves the valgrind asset name matching the given architecture and platform. */
export async function resolveValgrindBuilderAssetName(
    version: Version,
    arch: string,
    platform: string,
    githubToken: string
): Promise<{ version: ResolvedVersion; name: string } | null> {
    // This is not the version of valgrind but the version of valgrind-builder and we always want
    // the assets from the latest valgrind-builder release.
    const release = await fetchReleaseAssetData(
        VALGRIND_BUILDER_REPO,
        Version.latest(),
        githubToken
    );

    // Example: valgrind-3.19.0-x86_64-ubuntu-22.04.tar.gz
    if (version.isAutoOrLatest()) {
        const pattern = new RegExp(
            String.raw`^valgrind-(\d+)\.(\d+)\.(\d+)-${RegExp.escape(arch)}-${RegExp.escape(platform)}\.tar\.gz$`
        );

        const sorted = release.assets
            .map((a) => a.name.match(pattern))
            .filter((match) => match != null)
            .map((m) => {
                const resolvedVersion = new ResolvedVersion(
                    Number(m[1]),
                    Number(m[2]),
                    Number(m[3])
                );
                const name = m[0];

                return {
                    version: resolvedVersion,
                    name
                };
            })
            .sort((a, b) => {
                return a.version.compare(b.version);
            });

        return sorted[sorted.length - 1] ?? null;
    } else {
        const expected = `valgrind-${version}-${arch}-${platform}.tar.gz`;
        const match = release.assets.find((a) => a.name === expected);
        if (!match) {
            return null;
        } else {
            return {
                version: ResolvedVersion.fromVersion(version),
                name: match.name
            };
        }
    }
}

/** Resolves a valgrind version for building from source, using git ls-remote for "latest" and
 * "auto". */
export async function resolveValgrindVersion(version: Version): Promise<ResolvedVersion> {
    const versions = await fetchSortedValgrindVersions();
    if (!version.isAutoOrLatest()) {
        if (versions.some((v) => v.equals(version))) {
            return version;
        } else {
            throw new Error(`Invalid version ${version}`);
        }
    }

    return versions[versions.length - 1];
}
