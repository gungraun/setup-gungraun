import * as exec from '@actions/exec';
import * as fs from 'fs';
import { getCargoBin, isDebug } from './utils';
import { ResolvedVersion } from './version';
import { Apk, AptGet, Dnf, PackageManager, Pacman, Yum, Zypper } from './platform';

/** Platform information detected from /etc/os-release. */
export interface PlatformInfo {
    /** Distro identifier (e.g., "ubuntu", "alpine"). */
    id: string;
    /** Identifiers of operating systems that are closely related to the local operating system */
    relatedIds: string[];
    /** Distro version, or null if VERSION_ID was absent. */
    versionId: string | null;
    /** Combined platform string (e.g., "ubuntu-22.04" or "arch-unknown"). */
    platform: string;
    /** Detected package manager, or null if unknown. */
    packageManager: PackageManager | null;
}

const ID_LIKE_PATTERNS: [RegExp, PackageManager][] = [
    [/debian/, new AptGet()],
    [/fedora/, new Dnf()],
    [/suse/, new Zypper()],
    [/arch/, new Pacman()],
    [/alpine/, new Apk()]
];

// No suse, since suse is an ID_LIKE
const PACKAGE_MANAGERS: Record<string, PackageManager> = {
    debian: new AptGet(),
    fedora: new Dnf(),
    arch: new Pacman(),
    alpine: new Apk(),
    amzn: new Yum()
};

/** Extracts the architecture prefix from a Rust target triple. */
export function detectArch(target: string): string {
    return target.split('-')[0];
}

export function detectShaVariant(hash: string): string | null {
    let variant: number;

    switch (hash.length) {
        case 40:
            variant = 1;
            break;
        case 56:
            variant = 224;
            break;
        case 64:
            variant = 256;
            break;
        case 96:
            variant = 384;
            break;
        case 128:
            variant = 512;
            break;

        default:
            return null;
    }

    return 'sha' + variant;
}

/** Detects the platform, version, and package manager from /etc/os-release. */
export async function detectPlatform(): Promise<PlatformInfo> {
    if (!fs.existsSync('/etc/os-release')) {
        throw new Error('Cannot detect platform: /etc/os-release not found');
    }

    const content = fs.readFileSync('/etc/os-release', 'utf-8');
    const idMatch = content.match(/^ID="?(.+?)"?$/m);
    const versionMatch = content.match(/^VERSION_ID="?(.+?)"?$/m);

    if (!idMatch) {
        throw new Error('Cannot detect platform: ID missing from /etc/os-release');
    }

    const id = idMatch[1].trim();
    const versionId = versionMatch ? versionMatch[1].trim() : null;

    const idLikeMatch = content.match(/^ID_LIKE="?(.+?)"?$/m);
    const idLike = idLikeMatch ? idLikeMatch[1].trim() : null;
    const relatedIds = idLike?.split(' ') ?? [];

    const packageManager = resolvePackageManager(id, idLike);
    const platform = versionId ? `${id}-${versionId}` : `${id}-unknown`;

    return { id, relatedIds, versionId, platform, packageManager };
}

/** Detects the gungraun-runner version from the project's cargo metadata or pkgid. */
export async function detectProjectVersion(): Promise<ResolvedVersion> {
    let metadataStdout: string | null = null;
    try {
        const { stdout } = await exec.getExecOutput(
            getCargoBin(),
            ['metadata', '--format-version=1'],
            { silent: !isDebug(), ignoreReturnCode: true }
        );
        metadataStdout = stdout;
    } catch {
        // Fall through
    }

    if (metadataStdout) {
        let pkgs: { name: string; version: string }[] | undefined;
        try {
            const metadata = JSON.parse(metadataStdout);
            pkgs = metadata.packages?.filter((p: { name: string }) => p.name === 'gungraun');
        } catch {
            // Fall through to cargo pkgid
        }

        if (pkgs?.length === 1 && pkgs[0].version) {
            return ResolvedVersion.fromString(pkgs[0].version);
        }
        if (pkgs && pkgs.length > 1) {
            const versions = pkgs.map((p: { version: string }) => p.version).join(', ');
            throw new Error(
                `Multiple gungraun versions detected in project (${versions}). Set runner-version \
explicitly.`
            );
        }
    }

    try {
        const { stdout } = await exec.getExecOutput(getCargoBin(), ['pkgid', 'gungraun'], {
            silent: !isDebug(),
            ignoreReturnCode: true
        });
        return ResolvedVersion.fromString(stdout);
    } catch {
        // Fall through to error
    }

    throw new Error(
        'Could not detect gungraun-runner version from project. Set runner-version explicitly.'
    );
}

/** Detects the Rust compiler target triple */
export async function detectTarget(): Promise<string> {
    const { stdout } = await exec.getExecOutput('rustc', ['-vV'], {
        silent: !isDebug()
    });
    const match = stdout.match(/^host:\s*(.+)$/m);
    if (!match) {
        throw new Error('Could not detect target from rustc -vV');
    }
    return match[1].trim(); // Safe: printErr exits if match is null
}

/** Resolves the package manager for a distro using its ID and ID_LIKE fields. */
export function resolvePackageManager(id: string, idLike: string | null): PackageManager | null {
    if (idLike) {
        for (const [pattern, pm] of ID_LIKE_PATTERNS) {
            if (pattern.test(idLike)) {
                return pm;
            }
        }
    }
    return PACKAGE_MANAGERS[id] ?? null;
}
