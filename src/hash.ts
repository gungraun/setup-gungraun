import * as crypto from "crypto";
import * as fs from "fs";
import { detectShaVariant } from "./detect";
import * as path from "path";
import { normalizePath, printInfo, splitOnce } from "./utils";

export function extractHash(filePath: string, expectedName: string): string | null {
    if (!filePath || !expectedName) {
        return null;
    }

    const shaContent = fs.readFileSync(filePath, "utf-8").trim();
    const hash = shaContent
        .split(/\r?\n/)
        .map((line) => {
            const [a, b] = splitOnce(line, " ");
            return [a.trim(), b.trim().replace(/^\*/, "")];
        })
        .find(([a, b]) => {
            return a.length > 0 && normalizePath(b) === normalizePath(expectedName);
        })?.[0];

    return hash ?? null;
}

export async function verifySha(
    variant: 256 | 512 | "auto",
    archivePath: string,
    shaFilePath: string,
): Promise<void> {
    const expectedName = path.basename(archivePath);
    const expectedHash = extractHash(shaFilePath, expectedName);
    if (!expectedHash) {
        throw new Error(
            `Could not find SHA-${variant} entry for '${expectedName}' in checksum file \
'${shaFilePath}'`,
        );
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

    printInfo(`${shaVariant} verified for ${expectedName}`);
}
