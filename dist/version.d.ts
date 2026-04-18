export declare class Version {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    constructor(major: number, minor: number, patch: number);
    static fromValgrindTag(tag: string): Version;
    static fromString(str: string): Version;
    static latest(): Version;
    static auto(): Version;
    /**
     * Compares this version with another version
     *
     * Returns a negative number if this version is smaller than the other version, zero if they are
     * equal and a positive number otherwise. The result of this function can be used for the `sort`
     * function of `Array.sort`.
     *
     * Special cases: auto < latest < semver
     *
     * @param other: The other version
     */
    compare(other: this): number;
    equals(other: this): boolean;
    isAuto(): boolean;
    isLatest(): boolean;
    isAutoOrLatest(): boolean;
    toString(): string;
    withPrefix(): string;
}
export declare class ResolvedVersion extends Version {
    constructor(major: number, minor: number, patch: number);
    static fromValgrindTag(tag: string): ResolvedVersion;
    static fromString(str: string): ResolvedVersion;
    static fromVersion(version: Version): ResolvedVersion;
    static latest(): ResolvedVersion;
    static auto(): ResolvedVersion;
    isLatest(): boolean;
    isAuto(): boolean;
    isAutoOrLatest(): boolean;
    toString(): string;
    withPrefix(): string;
}
