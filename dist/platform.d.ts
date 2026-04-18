import { ResolvedVersion } from "./version";
export interface PackageManager {
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
}
export interface PackageManagerVisitor<T> {
    visitApk(pm: Apk): T;
    visitAptGet(pm: AptGet): T;
    visitDnf(pm: Dnf): T;
    visitPacman(pm: Pacman): T;
    visitYum(pm: Yum): T;
    visitZypper(pm: Zypper): T;
}
export declare class Apk implements PackageManager {
    private readonly debugInfoPackages;
    private readonly valgrindBuildDeps;
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
    updateCache(): Promise<void>;
}
export declare class AptGet implements PackageManager {
    private readonly debugInfoPackages;
    private readonly valgrindBuildDeps;
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
    updateCache(): Promise<void>;
}
export declare class Dnf implements PackageManager {
    private readonly debugInfoPackages;
    private readonly valgrindBuildDeps;
    accept<T>(v: PackageManagerVisitor<T>): T;
    extractVersionStrings(output: string, pkg: string): string[] | null;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
}
export declare class Pacman implements PackageManager {
    private readonly debugInfoPackages;
    private readonly valgrindBuildDeps;
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
    updateCache(): Promise<void>;
}
export declare class Yum extends Dnf implements PackageManager {
    accept<T>(v: PackageManagerVisitor<T>): T;
}
export declare class Zypper implements PackageManager {
    private readonly debugInfoPackages;
    private readonly valgrindBuildDeps;
    accept<T>(v: PackageManagerVisitor<T>): T;
    getDebugInfoPackages(): string[];
    getValgrindBuildDeps(): string[];
}
export declare class FetchLatestPackageVersion implements PackageManagerVisitor<Promise<ResolvedVersion | null>> {
    readonly pkg: string;
    constructor(pkg: string);
    static getLatestVersion(versions: string[] | undefined | null): ResolvedVersion | null;
    visitAptGet(pm: AptGet): Promise<ResolvedVersion | null>;
    visitApk(pm: Apk): Promise<ResolvedVersion | null>;
    visitDnf(pm: Dnf): Promise<ResolvedVersion | null>;
    visitPacman(pm: Pacman): Promise<ResolvedVersion | null>;
    visitYum(pm: Yum): Promise<ResolvedVersion | null>;
    visitZypper(_pm: Zypper): Promise<ResolvedVersion | null>;
}
export declare class PackagesInstaller implements PackageManagerVisitor<Promise<void>> {
    readonly pkgs: string[];
    constructor(...pkgs: string[]);
    hasPackages(): boolean;
    visitAptGet(pm: AptGet): Promise<void>;
    visitApk(pm: Apk): Promise<void>;
    visitDnf(_pm: Dnf): Promise<void>;
    visitPacman(pm: Pacman): Promise<void>;
    visitYum(_pm: Yum): Promise<void>;
    visitZypper(_pm: Zypper): Promise<void>;
}
