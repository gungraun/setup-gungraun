export class Version {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;

    constructor(major: number, minor: number, patch: number) {
        if (
            !Number.isSafeInteger(major) ||
            !Number.isSafeInteger(minor) ||
            !Number.isSafeInteger(patch)
        ) {
            throw new Error('A version cannot be represented by an unsafe number');
        }

        this.major = major;
        this.minor = minor;
        this.patch = patch;
    }

    static fromValgrindTag(tag: string): Version {
        const match = tag.match(/VALGRIND_(\d+)_(\d+)_(\d+)/);
        if (match) {
            return new Version(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        throw new Error(`Invalid Valgrind version tag: ${tag}`);
    }

    static fromString(str: string): Version {
        const lower = str.trim().toLowerCase();

        if (lower === 'latest') {
            return Version.latest();
        } else if (lower === 'auto') {
            return Version.auto();
        }

        const match = lower.match(/[v]?(\d+)\.(\d+)\.(\d+)/);
        if (match) {
            return new Version(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        throw new Error(`Invalid version string: ${str}`);
    }

    static latest(): Version {
        return new Version(-1, 0, 0);
    }

    static auto(): Version {
        return new Version(-2, 0, 0);
    }

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
    compare(other: this): number {
        return this.major - other.major || this.minor - other.minor || this.patch - other.patch;
    }

    equals(other: this): boolean {
        return this.compare(other) === 0;
    }

    isAuto(): boolean {
        return this.major === -2;
    }

    isLatest(): boolean {
        return this.major === -1;
    }

    isAutoOrLatest(): boolean {
        return this.isAuto() || this.isLatest();
    }

    toString(): string {
        if (this.isLatest()) {
            return 'latest';
        } else if (this.isAuto()) {
            return 'auto';
        }

        return `${this.major}.${this.minor}.${this.patch}`;
    }

    withPrefix(): string {
        if (this.isLatest()) {
            return 'latest';
        } else if (this.isAuto()) {
            return 'auto';
        }

        return `v${this.toString()}`;
    }
}

export class ResolvedVersion extends Version {
    constructor(major: number, minor: number, patch: number) {
        if (major === -1 || major === -2) {
            throw new Error("A resolved version cannot be 'latest' or 'auto'");
        }

        super(major, minor, patch);
    }

    static fromValgrindTag(tag: string): ResolvedVersion {
        const version = super.fromValgrindTag(tag);
        return ResolvedVersion.fromVersion(version);
    }

    static fromString(str: string): ResolvedVersion {
        const version = super.fromString(str);
        if (version.isAutoOrLatest()) {
            throw new Error("A resolved version cannot be 'latest' or 'auto'");
        }

        return ResolvedVersion.fromVersion(version);
    }

    static fromVersion(version: Version): ResolvedVersion {
        return new ResolvedVersion(version.major, version.minor, version.patch);
    }

    static latest(): ResolvedVersion {
        throw new Error("A resolved version cannot be 'latest'");
    }

    static auto(): ResolvedVersion {
        throw new Error("A resolved version cannot be 'auto'");
    }

    isLatest(): boolean {
        return false;
    }

    isAuto(): boolean {
        return false;
    }

    isAutoOrLatest(): boolean {
        return false;
    }

    toString(): string {
        return `${this.major}.${this.minor}.${this.patch}`;
    }

    withPrefix(): string {
        return `v${this.toString()}`;
    }
}
