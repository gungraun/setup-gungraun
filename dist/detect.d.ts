import { ResolvedVersion } from "./version";
import { PackageManager } from "./platform";
/** Platform information detected from /etc/os-release. */
export interface PlatformInfo {
    /** Distro identifier (e.g., "ubuntu", "alpine"). */
    id: string;
    /** Distro version, or null if VERSION_ID was absent. */
    versionId: string | null;
    /** Combined platform string (e.g., "ubuntu-22.04" or "arch-unknown"). */
    platform: string;
    /** Detected package manager, or null if unknown. */
    packageManager: PackageManager | null;
}
/** Extracts the architecture prefix from a Rust target triple. */
export declare function detectArch(target: string): string;
export declare function detectShaVariant(hash: string): string | null;
/** Detects the platform, version, and package manager from /etc/os-release. */
export declare function detectPlatform(): Promise<PlatformInfo>;
/** Detects the gungraun-runner version from the project's cargo metadata or pkgid. */
export declare function detectProjectVersion(): Promise<ResolvedVersion>;
/** Detects the Rust compiler target triple */
export declare function detectTarget(): Promise<string>;
/** Resolves the package manager for a distro using its ID and ID_LIKE fields. */
export declare function resolvePackageManager(id: string, idLike: string | null): PackageManager | null;
