export class Version {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;

    constructor(major: number, minor: number, patch: number) {
        this.major = major;
        this.minor = minor;
        this.patch = patch;
    }

    static from_valgrind_tag(tag: string): Version {
        const match = tag.match(/VALGRIND_(\d+)_(\d+)_(\d+)/);
        if (match) {
            return new Version(+match[1], +match[2], +match[3]);
        }

        throw new Error(`Invalid valgrind version tag: ${tag}`);
    }

    static from_tag(tag: string): Version {
        const lowerTag = tag.trim().toLowerCase();

        if (lowerTag === "latest") {
            return this.latest();
        } else if (lowerTag === "auto") {
            return this.auto();
        }

        const match = lowerTag.match(/[v]?(\d+)\.(\d+)\.(\d+)/);
        if (match) {
            return new Version(+match[1], +match[2], +match[3]);
        }

        throw new Error(`Invalid version tag: ${tag}`);
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
            return "latest";
        } else if (this.isAuto()) {
            return "auto";
        }

        return `${this.major}.${this.minor}.${this.patch}`;
    }

    withPrefix(): string {
        if (this.isLatest()) {
            return "latest";
        } else if (this.isAuto()) {
            return "auto";
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

    static from_valgrind_tag(tag: string): ResolvedVersion {
        let version = super.from_valgrind_tag(tag);
        return ResolvedVersion.from_version(version);
    }

    static from_tag(tag: string): ResolvedVersion {
        let version = super.from_tag(tag);
        if (version.isLatest() || version.isAuto()) {
            throw new Error("A resolved version cannot be 'latest' or 'auto'");
        }

        return ResolvedVersion.from_version(version);
    }

    static from_version(version: Version): ResolvedVersion {
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
        if (this.isLatest()) {
            throw new Error("A resolved version cannot be: 'latest'");
        }
        return `${this.major}.${this.minor}.${this.patch}`;
    }

    withPrefix(): string {
        if (this.isLatest()) {
            throw new Error("A resolved version cannot be: 'latest'");
        }
        return `v${this.toString()}`;
    }
}
