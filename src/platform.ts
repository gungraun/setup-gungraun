import { ResolvedVersion } from './version';
import { execPrivileged, execPrivilegedWithOutput } from './utils';

export interface PackageManager {
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
}

export interface PackageManagerVisitor<T> {
    visitApk(pm: Apk): T;
    visitAptGet(pm: AptGet): T;
    visitDnf(pm: Dnf): T;
    visitMicroDnf(pm: MicroDnf): T;
    visitPacman(pm: Pacman): T;
    visitYum(pm: Yum): T;
    visitZypper(pm: Zypper): T;
}

export class Apk implements PackageManager {
    private readonly debugInfoPackages: string[] = ['musl-dbg'];
    // The busybox sed doesn't work with the configure script
    private readonly valgrindBuildDeps: string[] = [
        'build-base',
        'bzip2',
        'sed',
        'perl',
        'linux-headers'
    ];

    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitApk(this);
    }

    getDebugInfoPackages(): string[] {
        return this.debugInfoPackages;
    }

    getValgrindBuildDeps(): string[] {
        return this.valgrindBuildDeps;
    }

    async updateCache(): Promise<void> {
        await execPrivileged('apk', ['update']);
    }
}

export class AptGet implements PackageManager {
    private readonly debugInfoPackages: string[] = ['libc6-dbg'];
    private readonly valgrindBuildDeps: string[] = ['build-essential', 'gcc', 'make', 'bzip2'];

    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitAptGet(this);
    }

    getDebugInfoPackages(): string[] {
        return this.debugInfoPackages;
    }

    getValgrindBuildDeps(): string[] {
        return this.valgrindBuildDeps;
    }

    async updateCache(): Promise<void> {
        await execPrivileged('apt-get', ['update', '-qq', '--allow-releaseinfo-change'], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });
    }
}

export class Dnf implements PackageManager {
    private readonly debugInfoPackages: string[] = ['glibc-debuginfo'];
    private readonly valgrindBuildDeps: string[] = ['gcc', 'make', 'bzip2'];

    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitDnf(this);
    }

    extractVersionStrings(output: string, pkg: string): string[] | null {
        // sample: "valgrind.x86_64   3.17.0-1.fc34   updates"
        const regex = new RegExp(String.raw`^${pkg}[^\s]*\s+([^\s]+).*`, 'gm');
        const matches = [...output.matchAll(regex)];

        if (matches.length === 0) {
            return null;
        }
        return matches.map((m) => m[1]);
    }

    getDebugInfoPackages(): string[] {
        return this.debugInfoPackages;
    }

    getValgrindBuildDeps(): string[] {
        return this.valgrindBuildDeps;
    }
}

export class MicroDnf extends Dnf implements PackageManager {
    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitMicroDnf(this);
    }

    extractVersionStrings(output: string, pkg: string): string[] | null {
        // sample: "valgrind-1:3.25.1-3.el10.x86_64"
        const regex = new RegExp(String.raw`^${pkg}[^\s:]*:([^\s]+).*`, 'gm');
        const matches = [...output.matchAll(regex)];

        if (matches.length === 0) {
            return null;
        }
        return matches.map((m) => m[1]);
    }
}

export class Pacman implements PackageManager {
    // Arch linux doesn't ship the debug symbols with glibc and doesn't have them as a separate
    // package. Instead, arch linux relies on debuginfod.
    private readonly debugInfoPackages: string[] = ['debuginfod'];
    private readonly valgrindBuildDeps: string[] = ['gcc', 'make', 'bzip2'];

    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitPacman(this);
    }

    getDebugInfoPackages(): string[] {
        return this.debugInfoPackages;
    }

    getValgrindBuildDeps(): string[] {
        return this.valgrindBuildDeps;
    }

    async updateCache(): Promise<void> {
        await execPrivileged('pacman', ['-Sy']);
    }
}

export class Yum extends Dnf implements PackageManager {
    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitYum(this);
    }
}

export class Zypper implements PackageManager {
    // This package is part of the `--plus-content debug` repository
    private readonly debugInfoPackages: string[] = ['glibc-debuginfo'];
    private readonly valgrindBuildDeps: string[] = ['gcc', 'make', 'bzip2'];

    accept<T>(v: PackageManagerVisitor<T>) {
        return v.visitZypper(this);
    }

    getDebugInfoPackages(): string[] {
        return this.debugInfoPackages;
    }

    getValgrindBuildDeps(): string[] {
        return this.valgrindBuildDeps;
    }
}

export class FetchLatestPackageVersion implements PackageManagerVisitor<
    Promise<ResolvedVersion | null>
> {
    readonly pkg: string;

    constructor(pkg: string) {
        this.pkg = pkg;
    }

    static getLatestVersion(versions: string[] | undefined | null): ResolvedVersion | null {
        const resolvedVersions = versions
            ?.map((v) => ResolvedVersion.fromString(v))
            .sort((a, b) => a.compare(b));

        if (resolvedVersions) {
            return resolvedVersions[resolvedVersions.length - 1] ?? null;
        }

        return null;
    }

    async visitAptGet(pm: AptGet) {
        await pm.updateCache();

        const output = await execPrivilegedWithOutput('apt-cache', ['policy', this.pkg], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });
        // sample: "  Installed: (none)\n  Candidate: 1:3.15.0-1"
        const regex = new RegExp(String.raw`^\s*Candidate:\s*([^\s]+)`, 'gm');
        const matches = [...output.matchAll(regex)];

        return FetchLatestPackageVersion.getLatestVersion(matches.map((m) => m![1]));
    }

    async visitApk(pm: Apk) {
        await pm.updateCache();

        const output = await execPrivilegedWithOutput('apk', ['policy', this.pkg]);
        // sample policy:
        // "valgrind policy:
        //    3.25.1-r2:
        //      https://dl-cdn.alpinelinux.org/alpine/v3.23/main"
        const regex = new RegExp(String.raw`${this.pkg}\s*policy:\s*([^\s:]+):`, 'gm');
        const matches = [...output.matchAll(regex)];

        return FetchLatestPackageVersion.getLatestVersion(matches.map((m) => m![1]));
    }

    async visitDnf(pm: Dnf): Promise<ResolvedVersion | null> {
        let output: string;
        try {
            output = await execPrivilegedWithOutput('dnf', [
                '--enablerepo=*-debuginfo',
                'list',
                '--showduplicates',
                this.pkg
            ]);
        } catch {
            return new MicroDnf().accept(new FetchLatestPackageVersion(this.pkg));
        }
        const matches = pm.extractVersionStrings(output, this.pkg);

        return FetchLatestPackageVersion.getLatestVersion(matches);
    }

    async visitMicroDnf(pm: MicroDnf): Promise<ResolvedVersion | null> {
        const output = await execPrivilegedWithOutput('microdnf', [
            '--enablerepo=*-debuginfo',
            'repoquery',
            this.pkg
        ]);
        const matches = pm.extractVersionStrings(output, this.pkg);

        return FetchLatestPackageVersion.getLatestVersion(matches);
    }

    async visitPacman(pm: Pacman) {
        await pm.updateCache();

        const output = await execPrivilegedWithOutput('pacman', ['-Si', this.pkg]);
        // sample: "Version         : 3.17.0-1"
        const regex = new RegExp(String.raw`^\s*Version\s*:\s*([^\s]+)`, 'gm');
        const matches = [...output.matchAll(regex)];

        return FetchLatestPackageVersion.getLatestVersion(matches?.map((m) => m![1]));
    }

    async visitYum(pm: Yum): Promise<ResolvedVersion | null> {
        let output: string;
        try {
            output = await execPrivilegedWithOutput('yum', [
                '--enablerepo=*-debuginfo',
                'list',
                '--showduplicates',
                this.pkg
            ]);
        } catch {
            return new Dnf().accept(new FetchLatestPackageVersion(this.pkg));
        }

        const matches = pm.extractVersionStrings(output, this.pkg);
        return FetchLatestPackageVersion.getLatestVersion(matches);
    }

    async visitZypper(_pm: Zypper) {
        const output = await execPrivilegedWithOutput('zypper', ['info', this.pkg]);
        // sample: "Version   : 3.17.0-1.1"
        const regex = new RegExp(String.raw`^\s*Version\s*:\s*([^\s]+)`, 'gm');
        const matches = [...output.matchAll(regex)];

        return FetchLatestPackageVersion.getLatestVersion(matches.map((m) => m![1]));
    }
}

export class PackagesInstaller implements PackageManagerVisitor<Promise<void>> {
    readonly pkgs: string[];

    constructor(...pkgs: string[]) {
        this.pkgs = pkgs;
    }

    hasPackages(): boolean {
        return this.pkgs.length > 0;
    }

    async visitAptGet(pm: AptGet): Promise<void> {
        if (this.hasPackages()) {
            await pm.updateCache();
            await execPrivilegedWithOutput(
                'apt-get',
                ['install', '-y', '--no-install-recommends', ...this.pkgs],
                { env: { DEBIAN_FRONTEND: 'noninteractive' }, silent: false }
            );
        }
    }

    async visitApk(pm: Apk): Promise<void> {
        if (this.hasPackages()) {
            await pm.updateCache();
            await execPrivilegedWithOutput('apk', ['add', ...this.pkgs], { silent: false });
        }
    }

    async visitDnf(_pm: Dnf): Promise<void> {
        if (this.hasPackages()) {
            try {
                await execPrivilegedWithOutput(
                    'dnf',
                    ['--enablerepo=*-debuginfo', 'install', '-y', ...this.pkgs],
                    { silent: false }
                );
            } catch {
                return new MicroDnf().accept(new PackagesInstaller(...this.pkgs));
            }
        }
    }

    async visitMicroDnf(_pm: MicroDnf): Promise<void> {
        if (this.hasPackages()) {
            await execPrivilegedWithOutput(
                'microdnf',
                ['--enablerepo=*-debuginfo', 'install', '-y', ...this.pkgs],
                { silent: false }
            );
        }
    }

    async visitPacman(pm: Pacman): Promise<void> {
        if (this.hasPackages()) {
            await pm.updateCache();
            await execPrivilegedWithOutput('pacman', ['-S', '--noconfirm', ...this.pkgs], {
                silent: false
            });
        }
    }

    async visitYum(_pm: Yum): Promise<void> {
        if (this.hasPackages()) {
            try {
                await execPrivilegedWithOutput(
                    'yum',
                    ['--enablerepo=*-debuginfo', 'install', '-y', ...this.pkgs],
                    { silent: false }
                );
            } catch {
                return new Dnf().accept(new PackagesInstaller(...this.pkgs));
            }
        }
    }

    async visitZypper(_pm: Zypper): Promise<void> {
        if (this.hasPackages()) {
            await execPrivilegedWithOutput(
                'zypper',
                [
                    '--non-interactive',
                    '--plus-content',
                    'debug',
                    'install',
                    ...this.pkgs
                ] as string[],
                { silent: false }
            );
        }
    }
}
