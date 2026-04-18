import { ResolvedVersion, Version } from "./version";
interface ReleaseAsset {
    name: string;
    browserDownloadUrl: string;
}
interface ReleaseInfo {
    tagName: string;
    assets: ReleaseAsset[];
}
/** Fetches release assets for a given repo and tag from the GitHub API. */
export declare function fetchReleaseAssetData(repo: string, version: Version, githubToken: string): Promise<ReleaseInfo>;
export declare function fetchRunnerVersions(githubToken: string): Promise<ResolvedVersion[]>;
export declare function fetchSortedValgrindVersions(): Promise<ResolvedVersion[]>;
/** Resolves a gungraun-runner version tag, fetching "latest" from GitHub if needed. */
export declare function resolveRunnerVersion(version: Version, githubToken: string): Promise<ResolvedVersion>;
/** Resolves the valgrind asset name matching the given architecture and platform. */
export declare function resolveValgrindBuilderAssetName(version: Version, arch: string, platform: string, githubToken: string): Promise<{
    version: ResolvedVersion;
    name: string;
} | null>;
/** Resolves a valgrind version for building from source, using git ls-remote for "latest" and
 * "auto". */
export declare function resolveValgrindVersion(version: Version): Promise<ResolvedVersion>;
export {};
