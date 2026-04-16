import * as crypto from "crypto";
import * as fs from "fs";
import * as tc from "@actions/tool-cache";
import { getReleaseAssets } from "./resolve";
import { GUNGRAUN_REPO, VALGRIND_BUILDER_REPO, printInfo } from "./utils";
import { ResolvedVersion } from "./version";
import path from "path";
import { detectShaVariant } from "./detect";

/** Downloads and extracts the gungraun-runner release archive for a given tag and target. */
export async function downloadAndExtractRunner(
    version: ResolvedVersion,
    target: string,
    githubToken: string,
): Promise<string> {
    const assetName = `gungraun-runner-${version.withPrefix()}-${target}.tar.gz`;
    return downloadAndExtractRelease(GUNGRAUN_REPO, version, assetName, githubToken);
}

async function downloadAndExtractRelease(
    repo: string,
    version: ResolvedVersion,
    assetName: string,
    githubToken: string,
): Promise<string> {
    const release = await getReleaseAssets(repo, version, githubToken);

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

function extractHash(filePath: string, expectedName: string): string | null {
    const shaContent = fs.readFileSync(filePath, "utf-8").trim();
    const hash = shaContent
        .split(/\r?\n/)
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts.length >= 2)
        .find(([, ...nameParts]) => {
            const name = nameParts.join(" ").replace(/^\*/, "");
            return name === expectedName || name.endsWith(`/${expectedName}`);
        })?.[0];
    return hash?.trim() ?? null;
}

async function verifySha(
    variant: 256 | 512 | "auto",
    archivePath: string,
    shaFilePath: string,
): Promise<void> {
    const expectedName = path.basename(archivePath);
    const expectedHash = extractHash(shaFilePath, expectedName);
    if (!expectedHash) {
        throw new Error(`Could not find SHA-${variant} entry for ${expectedName} in checksum file`);
    }

    let shaVariant: string;
    if (variant === "auto") {
        const detected = detectShaVariant(expectedHash);
        if (!detected) {
            throw new Error("Unable to detect sha variant");
        }
        shaVariant = detected;
    } else {
        shaVariant = "sha" + variant;
    }

    const actualHash = crypto
        .createHash(shaVariant)
        .update(fs.readFileSync(archivePath))
        .digest("hex");

    if (actualHash !== expectedHash) {
        throw new Error(
            `${shaVariant} verification failed for ${expectedName}
Expected: ${expectedHash}
Actual:   ${actualHash}`,
        );
    }

    printInfo(`SHA-${variant} verified for ${expectedName}`);
}
