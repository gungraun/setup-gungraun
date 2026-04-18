import * as crypto from "crypto";
import * as fs from "fs";

import { extractHash, verifySha } from "../src/hash";
import { detectShaVariant } from "../src/detect";
import { printInfo } from "../src/utils";

jest.mock("fs", () => {
    const realFs = jest.requireActual("fs");
    return {
        ...realFs,
        readFileSync: jest.fn(),
    };
});

jest.mock("crypto");
jest.mock("../src/detect");
jest.mock("../src/utils", () => {
    const actual = jest.requireActual("../src/utils");
    return {
        ...actual,
        printInfo: jest.fn(),
    };
});

afterEach(() => jest.restoreAllMocks());

describe("extractHash", () => {
    function shaFile(content: string): string {
        const tmp = `/tmp/test-${expect.getState().currentTestName}.sha256`;
        (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
            if (p === tmp) return content;
            throw new Error(`unexpected readFileSync: ${p}`);
        });
        return tmp;
    }

    it("when exact name match then returns hash", () => {
        const shaPath = shaFile("abc123  file.tar.gz\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBe("abc123");
    });

    it("when entry has * prefix then strips it and matches", () => {
        const shaPath = shaFile("abc123 *file.tar.gz\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBe("abc123");
    });

    it("when entry has path prefix", () => {
        const shaPath = shaFile("abc123  ./file.tar.gz\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBe("abc123");
    });

    it("when multiple entries then returns matching hash", () => {
        const shaPath = shaFile("111  first.tar.gz\n222  second.tar.gz\n");
        expect(extractHash(shaPath, "second.tar.gz")).toBe("222");
    });

    it("when no matching entry then returns null", () => {
        const shaPath = shaFile("abc123  other.tar.gz\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBeNull();
    });

    it("when CRLF line endings then parses correctly", () => {
        const shaPath = shaFile("abc123  file.tar.gz\r\ndef456  other.tar.gz\r\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBe("abc123");
    });

    it("when line has fewer than 2 columns then skips it", () => {
        const shaPath = shaFile("badsingleword\nabc123  file.tar.gz\n");
        expect(extractHash(shaPath, "file.tar.gz")).toBe("abc123");
    });

    it("when filePath is empty then returns null", () => {
        expect(extractHash("", "file.tar.gz")).toBeNull();
    });

    it("when expectedName is empty then returns null", () => {
        expect(extractHash("/some/path", "")).toBeNull();
    });
});

describe("verifySha", () => {
    const shaPath = "/tmp/check.sha256";
    const archivePath = "/tmp/file.tar.gz";

    function mockShaFile(content: string): void {
        (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
            if (p === shaPath) return content;
            if (p === archivePath) return Buffer.from("archive-bytes");
            throw new Error(`unexpected readFileSync: ${p}`);
        });
    }

    function mockCryptoDigest(hash: string): void {
        const mockUpdate = { digest: jest.fn().mockReturnValue(hash) };
        const mockHash = { update: jest.fn().mockReturnValue(mockUpdate) };
        (crypto.createHash as jest.Mock).mockReturnValue(mockHash);
    }

    it("when variant is 256 then verifies with sha256", async () => {
        mockShaFile("abc123  file.tar.gz\n");
        mockCryptoDigest("abc123");

        await verifySha(256, archivePath, shaPath);

        expect(crypto.createHash).toHaveBeenCalledWith("sha256");
        expect(printInfo).toHaveBeenCalledWith("sha256 verified for file.tar.gz");
    });

    it("when variant is 512 then verifies with sha512", async () => {
        mockShaFile("def456  file.tar.gz\n");
        mockCryptoDigest("def456");

        await verifySha(512, archivePath, shaPath);

        expect(crypto.createHash).toHaveBeenCalledWith("sha512");
        expect(printInfo).toHaveBeenCalledWith("sha512 verified for file.tar.gz");
    });

    it("when variant is auto then tries to detect the sha variant", async () => {
        const hash = "a".repeat(56);
        mockShaFile(`${hash}  file.tar.gz\n`);
        mockCryptoDigest(hash);
        (detectShaVariant as jest.Mock).mockReturnValue("sha224");

        await verifySha("auto", archivePath, shaPath);

        expect(detectShaVariant).toHaveBeenCalledWith(hash);
        expect(crypto.createHash).toHaveBeenCalledWith("sha224");
        expect(printInfo).toHaveBeenCalledWith("sha224 verified for file.tar.gz");
    });

    it("when no matching entry then throws", async () => {
        mockShaFile("abc123  other.tar.gz\n");
        mockCryptoDigest("abc123");

        await expect(verifySha(256, archivePath, shaPath)).rejects.toThrow(
            "Could not find SHA-256 entry for 'file.tar.gz' in checksum file '/tmp/check.sha256'",
        );
    });

    it("when auto variant and could not detect variant then throws", async () => {
        mockShaFile("abc123  file.tar.gz\n");
        mockCryptoDigest("abc123");
        (detectShaVariant as jest.Mock).mockReturnValue(null);

        await expect(verifySha("auto", archivePath, shaPath)).rejects.toThrow(
            "Unable to detect sha variant",
        );
    });

    it("when hash mismatch then throws", async () => {
        mockShaFile("expectedhash  file.tar.gz\n");
        mockCryptoDigest("actualhash");

        await expect(verifySha(256, archivePath, shaPath)).rejects.toThrow(
            /sha256 verification failed for file.tar.gz/,
        );
        await expect(verifySha(256, archivePath, shaPath)).rejects.toThrow(
            /Expected: expectedhash/,
        );
        await expect(verifySha(256, archivePath, shaPath)).rejects.toThrow(/Actual:   actualhash/);
    });
});
