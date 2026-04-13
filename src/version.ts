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
        if (tag.trim() === "latest") {
            return this.latest();
        }

        const match = tag.match(/[v]?(\d+)\.(\d+)\.(\d+)/);
        if (match) {
            return new Version(+match[1], +match[2], +match[3]);
        }
        throw new Error(`Invalid version tag: ${tag}`);
    }

    static latest(): Version {
        return new Version(-1, 0, 0);
    }

    isLatest(): boolean {
        return this.major === -1;
    }

    toString(): string {
        return this.isLatest() ? "latest" : `${this.major}.${this.minor}.${this.patch}`;
    }

    withPrefix(): string {
        return this.isLatest() ? "latest" : `v${this.toString()}`;
    }
}

export class ResolvedVersion extends Version {
    constructor(major: number, minor: number, patch: number) {
        if (major === -1) {
            throw new Error("A resolved version cannot be 'latest'");
        }

        super(major, minor, patch);
    }

    static from_valgrind_tag(tag: string): ResolvedVersion {
        let version = super.from_valgrind_tag(tag);
        return ResolvedVersion.from_version(version);
    }

    static from_tag(tag: string): ResolvedVersion {
        if (tag.trim() === "latest") {
            throw new Error("A resolved version cannot be 'latest'");
        }

        let version = super.from_tag(tag);
        return ResolvedVersion.from_version(version);
    }

    static from_version(version: Version): ResolvedVersion {
        return new ResolvedVersion(version.major, version.minor, version.patch);
    }

    static latest(): ResolvedVersion {
        throw new Error("A resolved version cannot be 'latest'");
    }

    isLatest(): boolean {
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
