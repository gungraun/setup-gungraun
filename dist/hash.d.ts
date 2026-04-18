export declare function extractHash(filePath: string, expectedName: string): string | null;
export declare function verifySha(variant: 256 | 512 | "auto", archivePath: string, shaFilePath: string): Promise<void>;
