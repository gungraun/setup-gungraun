import * as crypto from "crypto";
import * as fs from "fs";
import * as tc from "@actions/tool-cache";
import { getReleaseAssets } from "./resolve";
import { GITHUB_REPO, VALGRIND_REPO, printInfo } from "./utils";

/** Downloads and extracts the gungraun-runner release archive for a given tag and target. */
export async function downloadAndExtractGr(tag: string, target: string): Promise<string> {
    const assetName = `gungraun-runner-${tag}-${target}.tar.gz`;
    return downloadAndExtractRelease(GITHUB_REPO, tag, assetName);
}

async function downloadAndExtractRelease(
    repo: string,
    tag: string,
    assetName: string,
): Promise<string> {
    const release = await getReleaseAssets(repo, tag);

    const archiveAsset = release.assets.find((a) => a.name === assetName);
    const shaAsset = release.assets.find((a) => a.name === `${assetName}.sha256`);

    if (!archiveAsset) {
        throw new Error(`Could not find release asset: ${assetName}`);
    }

    const archivePath = await tc.downloadTool(archiveAsset.browserDownloadUrl);

    if (shaAsset) {
        const shaPath = await tc.downloadTool(shaAsset.browserDownloadUrl);
        await verifySha256(archivePath, shaPath, assetName);
    }

    const extractDir = await tc.extractTar(archivePath);
    return extractDir;
}

/** Downloads and extracts the valgrind release archive for a given tag and asset name. */
export async function downloadAndExtractValgrind(tag: string, assetName: string): Promise<string> {
    return downloadAndExtractRelease(VALGRIND_REPO, tag, assetName);
}

async function verifySha256(
    archivePath: string,
    shaFilePath: string,
    expectedName: string,
): Promise<void> {
    const shaContent = fs.readFileSync(shaFilePath, "utf-8").trim();
    const parts = shaContent.split(/\s+/);
    const expectedHash = parts[0];

    const actualHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(archivePath))
        .digest("hex");

    if (actualHash !== expectedHash) {
        throw new Error(
            `SHA-256 verification failed for ${expectedName}\nExpected: ${expectedHash}\nActual:   ${actualHash}`,
        );
    }

    printInfo(`SHA-256 verified for ${expectedName}`);
}
