import { ResolvedVersion } from "./version";
/** Downloads and extracts the gungraun-runner release archive for a given tag and target. */
export declare function downloadAndExtractRunner(version: ResolvedVersion, target: string, githubToken: string): Promise<string>;
export declare function downloadAndExtractRelease(repo: string, version: ResolvedVersion, assetName: string, githubToken: string): Promise<string>;
export declare function downloadAndExtractValgrindUrl(valgrindUrl: string, valgrindShaUrl: string): Promise<{
    extractDir: string;
    name: string;
}>;
export declare function downloadAndExtractValgrindSource(version: ResolvedVersion): Promise<string>;
/** Downloads and extracts the valgrind release archive for a given tag and asset name. */
export declare function downloadAndExtractValgrind(version: ResolvedVersion, assetName: string, githubToken: string): Promise<string>;
