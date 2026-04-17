import * as tc from "@actions/tool-cache";
import { fetchReleaseAssetData } from "./resolve";
import { GUNGRAUN_REPO, VALGRIND_BUILDER_REPO } from "./utils";
import { ResolvedVersion } from "./version";
import path from "path";
import { verifySha } from "./hash";

/** Downloads and extracts the gungraun-runner release archive for a given tag and target. */
export async function downloadAndExtractRunner(
    version: ResolvedVersion,
    target: string,
    githubToken: string,
): Promise<string> {
    const assetName = `gungraun-runner-${version.withPrefix()}-${target}.tar.gz`;
    return downloadAndExtractRelease(GUNGRAUN_REPO, version, assetName, githubToken);
}

export async function downloadAndExtractRelease(
    repo: string,
    version: ResolvedVersion,
    assetName: string,
    githubToken: string,
): Promise<string> {
    const release = await fetchReleaseAssetData(repo, version, githubToken);

    const archiveAsset = release.assets.find((a) => a.name === assetName);
    const shaAsset = release.assets.find((a) => a.name === `${assetName}.sha256`);

    if (!archiveAsset) {
        throw new Error(`Could not find release asset: ${assetName}`);
    }

    const archivePath = await tc.downloadTool(archiveAsset.browserDownloadUrl);

    if (shaAsset) {
        const shaPath = await tc.downloadTool(shaAsset.browserDownloadUrl);
        await verifySha(256, archivePath, shaPath);
    }

    const extractDir = await tc.extractTar(archivePath);
    return extractDir;
}

export async function downloadAndExtractValgrindUrl(
    valgrindUrl: string,
    valgrindShaUrl: string,
): Promise<{ extractDir: string; name: string }> {
    const archivePath = await tc.downloadTool(valgrindUrl);
    const name = path.basename(archivePath);

    if (valgrindShaUrl) {
        const shaPath = await tc.downloadTool(valgrindShaUrl);
        await verifySha("auto", archivePath, shaPath);
    }

    const extractDir = await tc.extractTar(archivePath);
    return { extractDir, name };
}

export async function downloadAndExtractValgrindSource(version: ResolvedVersion): Promise<string> {
    // The resolved version is always major.minor.patch
    const assetName = `valgrind-${version}.tar.bz2`;
    const tarballUrl = `https://sourceware.org/pub/valgrind/${assetName}`;
    const shaSumsUrl = `https://sourceware.org/pub/valgrind/sha512.sum`;

    const archivePath = await tc.downloadTool(tarballUrl);
    const shaAsset = await tc.downloadTool(shaSumsUrl);

    await verifySha(512, archivePath, shaAsset);

    const extractDir = await tc.extractTar(archivePath, undefined, "xj");
    return extractDir;
}

/** Downloads and extracts the valgrind release archive for a given tag and asset name. */
export async function downloadAndExtractValgrind(
    version: ResolvedVersion,
    assetName: string,
    githubToken: string,
): Promise<string> {
    return downloadAndExtractRelease(VALGRIND_BUILDER_REPO, version, assetName, githubToken);
}
