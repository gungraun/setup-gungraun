import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as os from 'os';
import { detectArch, detectPlatform, detectTarget } from '../src/detect';
import {
    downloadAndExtractRunner,
    downloadAndExtractValgrind,
    downloadAndExtractValgrindSource,
    downloadAndExtractValgrindUrl
} from '../src/download';
import { PackagesInstaller } from '../src/platform';
import {
    resolveValgrindBuilderAssetName,
    resolveValgrindVersion,
    resolveRunnerVersion
} from '../src/resolve';
import { findBinary, logInstalledVersion, printError, printInfo, printWarning } from '../src/utils';
import { ResolvedVersion, Version } from '../src/version';
import {
    getRunnerInstallDir,
    installDebugSymbols,
    installRunner,
    installRunnerFromRelease,
    installRunnerFromSource,
    installRunnerWithBinstall,
    installValgrind,
    installValgrindFromBuilder,
    installValgrindBuildDeps,
    installValgrindWithPackageManager,
    installValgrindFromSource
} from '../src/install';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/io');
jest.mock('os');
jest.mock('../src/detect');
jest.mock('../src/download');
jest.mock('../src/resolve');

jest.mock('../src/utils', () => ({
    findBinary: jest.fn(),
    getCargoBin: jest.fn(() => 'cargo'),
    logInstalledVersion: jest.fn().mockResolvedValue(undefined),
    printError: jest.fn(),
    printInfo: jest.fn(),
    printWarning: jest.fn(),
    withGroup: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
    GUNGRAUN_REPO: 'gungraun/gungraun',
    VALGRIND_BUILDER_REPO: 'gungraun/valgrind-builder',
    VALGRIND_SOURCE_REPO: 'https://sourceware.org/git/valgrind.git'
}));

jest.mock('fs', () => {
    const realFs = jest.requireActual('fs');
    return {
        ...realFs,
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        promises: {
            ...realFs.promises,
            readdir: jest.fn()
        }
    };
});

afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

function createMockPackageManager() {
    return {
        accept: jest.fn().mockResolvedValue(undefined),
        getDebugInfoPackages: jest.fn(() => ['libc6-dbg']),
        getValgrindBuildDeps: jest.fn(() => ['gcc', 'make', 'bzip2'])
    };
}

describe('getRunnerInstallDir', () => {
    it('when CARGO_INSTALL_ROOT is set then uses it', () => {
        jest.replaceProperty(process, 'env', { CARGO_INSTALL_ROOT: '/custom' });
        expect(getRunnerInstallDir()).toEqual({ dir: '/custom/bin', needsExport: false });
    });

    it('when CARGO_HOME is set but no CARGO_INSTALL_ROOT then uses CARGO_HOME', () => {
        jest.replaceProperty(process, 'env', { CARGO_HOME: '/cargo-home' });
        expect(getRunnerInstallDir()).toEqual({ dir: '/cargo-home/bin', needsExport: false });
    });

    it('when HOME is set but no cargo env vars then uses HOME/.cargo/bin', () => {
        jest.replaceProperty(process, 'env', { HOME: '/home/user' });
        expect(getRunnerInstallDir()).toEqual({ dir: '/home/user/.cargo/bin', needsExport: true });
    });

    it('when RUNNER_TEMP is set but no other vars then uses RUNNER_TEMP/.cargo/bin', () => {
        jest.replaceProperty(process, 'env', { RUNNER_TEMP: '/tmp/runner' });
        expect(getRunnerInstallDir()).toEqual({ dir: '/tmp/runner/.cargo/bin', needsExport: true });
    });

    it('when no relevant env vars are set then returns null', () => {
        jest.replaceProperty(process, 'env', {});
        expect(getRunnerInstallDir()).toBeNull();
    });

    it('when CARGO_INSTALL_ROOT is set then takes priority over CARGO_HOME', () => {
        jest.replaceProperty(process, 'env', {
            CARGO_INSTALL_ROOT: '/custom',
            CARGO_HOME: '/cargo-home'
        });
        expect(getRunnerInstallDir()).toEqual({ dir: '/custom/bin', needsExport: false });
    });
});

describe('installDebugSymbols', () => {
    it('when package manager exists then installs debug symbols', async () => {
        const mockPm = createMockPackageManager();
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        await installDebugSymbols();

        expect(mockPm.accept).toHaveBeenCalledTimes(1);
        expect(mockPm.accept).toHaveBeenCalledWith(expect.any(PackagesInstaller));
        expect(printWarning).not.toHaveBeenCalled();
    });

    it('when package manager is null then prints warning', async () => {
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'unknown',
            versionId: null,
            platform: 'unknown-unknown',
            packageManager: null
        });

        await installDebugSymbols();

        expect(printWarning).toHaveBeenCalled();
    });

    it('when accept throws then prints warning', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockRejectedValue(new Error('install failed'));
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        await installDebugSymbols();

        expect(printWarning).toHaveBeenCalled();
    });
});

describe('installRunner', () => {
    it('when strategy is none then skips installation', async () => {
        await installRunner(Version.latest(), ['none'], 'token', 'target');

        expect(printInfo).toHaveBeenCalledWith('Skipping gungraun-runner installation');
    });

    it('when strategy is invalid then throws', async () => {
        await expect(
            installRunner(new Version(1, 0, 0), ['invalid' as never], 'token', 'target')
        ).rejects.toThrow("Invalid strategy 'invalid'");
    });

    it('when binstall succeeds then returns without trying other strategies', async () => {
        (io.which as jest.Mock).mockResolvedValueOnce('/usr/bin/cargo-binstall');
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (io.which as jest.Mock).mockResolvedValueOnce('/usr/bin/gungraun-runner');
        jest.replaceProperty(process, 'env', { HOME: '/home/test' });

        await installRunner(Version.latest(), ['binstall', 'release'], 'token', 'target');

        expect(resolveRunnerVersion).not.toHaveBeenCalled();
    });

    it('when all strategies fail then throws', async () => {
        jest.replaceProperty(process, 'env', {});
        (findBinary as jest.Mock).mockResolvedValue(null);

        await expect(
            installRunner(new Version(1, 0, 0), ['release'], 'token', 'target')
        ).rejects.toThrow('All runner install strategies failed');

        expect(printError).toHaveBeenCalledWith("Runner strategy 'release' failed");
    });
});

describe('installRunnerFromRelease', () => {
    const resolvedVersion = new ResolvedVersion(1, 2, 3);

    it('when binary found then installs and returns true', async () => {
        jest.replaceProperty(process, 'env', { HOME: '/home/test' });
        (resolveRunnerVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractRunner as jest.Mock).mockResolvedValue('/tmp/extract');
        (findBinary as jest.Mock).mockResolvedValue('/tmp/extract/gungraun-runner');
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (io.mv as jest.Mock).mockResolvedValue(undefined);

        const result = await installRunnerFromRelease(
            new Version(1, 2, 3),
            'token',
            'x86_64-unknown-linux-gnu'
        );

        expect(result).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('chmod', ['+x', '/tmp/extract/gungraun-runner']);
        expect(io.mv).toHaveBeenCalledWith(
            '/tmp/extract/gungraun-runner',
            '/home/test/.cargo/bin/gungraun-runner'
        );
        expect(core.addPath).toHaveBeenCalledWith('/home/test/.cargo/bin');
        expect(core.exportVariable).toHaveBeenCalledWith(
            'GUNGRAUN_RUNNER',
            '/home/test/.cargo/bin/gungraun-runner'
        );
        expect(logInstalledVersion).toHaveBeenCalledWith(
            '/home/test/.cargo/bin/gungraun-runner',
            'gungraun-runner',
            'gungraun-runner 1.2.3'
        );
    });

    it('when needsExport is false then does not add to PATH', async () => {
        jest.replaceProperty(process, 'env', { CARGO_HOME: '/cargo-home' });
        (resolveRunnerVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractRunner as jest.Mock).mockResolvedValue('/tmp/extract');
        (findBinary as jest.Mock).mockResolvedValue('/tmp/extract/gungraun-runner');
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (io.mv as jest.Mock).mockResolvedValue(undefined);

        const result = await installRunnerFromRelease(
            new Version(1, 2, 3),
            'token',
            'x86_64-unknown-linux-gnu'
        );

        expect(result).toBe(true);
        expect(core.addPath).not.toHaveBeenCalled();
        expect(core.exportVariable).not.toHaveBeenCalled();
    });

    it('when binary not found then returns false', async () => {
        (resolveRunnerVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractRunner as jest.Mock).mockResolvedValue('/tmp/extract');
        (findBinary as jest.Mock).mockResolvedValue(null);

        const result = await installRunnerFromRelease(
            new Version(1, 2, 3),
            'token',
            'x86_64-unknown-linux-gnu'
        );

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Could not find gungraun-runner binary in archive');
    });

    it('when no install directory then returns false', async () => {
        jest.replaceProperty(process, 'env', {});
        (resolveRunnerVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractRunner as jest.Mock).mockResolvedValue('/tmp/extract');
        (findBinary as jest.Mock).mockResolvedValue('/tmp/extract/gungraun-runner');

        const result = await installRunnerFromRelease(
            new Version(1, 2, 3),
            'token',
            'x86_64-unknown-linux-gnu'
        );

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Unable to find a installation directory for gungraun-runner'
        );
    });

    it('when install dir does not exist then creates it', async () => {
        jest.replaceProperty(process, 'env', { HOME: '/home/test' });
        (resolveRunnerVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractRunner as jest.Mock).mockResolvedValue('/tmp/extract');
        (findBinary as jest.Mock).mockResolvedValue('/tmp/extract/gungraun-runner');
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (io.mv as jest.Mock).mockResolvedValue(undefined);

        await installRunnerFromRelease(new Version(1, 2, 3), 'token', 'x86_64-unknown-linux-gnu');

        expect(fs.mkdirSync).toHaveBeenCalledWith('/home/test/.cargo/bin', { recursive: true });
    });

    it('when exception thrown then returns false', async () => {
        jest.replaceProperty(process, 'env', { HOME: '/home/test' });
        (resolveRunnerVersion as jest.Mock).mockRejectedValue(new Error('network error'));

        const result = await installRunnerFromRelease(
            new Version(1, 2, 3),
            'token',
            'x86_64-unknown-linux-gnu'
        );

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Failed to install gungraun-runner from release: network error'
        );
    });
});

describe('installRunnerFromSource', () => {
    it('when version is not latest then adds --version flag', async () => {
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerFromSource(new Version(1, 2, 3));

        expect(exec.exec).toHaveBeenCalledWith('cargo', [
            'install',
            'gungraun-runner',
            '--version',
            '1.2.3'
        ]);
    });

    it('when version is latest then omits --version flag', async () => {
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerFromSource(Version.latest());

        expect(exec.exec).toHaveBeenCalledWith('cargo', ['install', 'gungraun-runner']);
    });

    it('when target is provided then adds --target flag', async () => {
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerFromSource(new Version(1, 2, 3), 'x86_64-unknown-linux-gnu');

        expect(exec.exec).toHaveBeenCalledWith('cargo', [
            'install',
            'gungraun-runner',
            '--version',
            '1.2.3',
            '--target',
            'x86_64-unknown-linux-gnu'
        ]);
    });

    it('when cargo install fails then returns false', async () => {
        (exec.exec as jest.Mock).mockRejectedValue(new Error('compile error'));

        const result = await installRunnerFromSource(new Version(1, 2, 3));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Failed to install gungraun-runner from source: compile error'
        );
    });
});

describe('installRunnerWithBinstall', () => {
    it('when cargo-binstall not found then returns false', async () => {
        (io.which as jest.Mock).mockResolvedValue('');

        const result = await installRunnerWithBinstall(Version.latest(), 'target');

        expect(result).toBe(false);
    });

    it('when version is latest then passes bare package name', async () => {
        (io.which as jest.Mock)
            .mockResolvedValueOnce('/usr/bin/cargo-binstall')
            .mockResolvedValueOnce('/usr/bin/gungraun-runner');
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerWithBinstall(Version.latest());

        expect(exec.exec).toHaveBeenCalledWith('cargo', [
            'binstall',
            '-y',
            '--disable-strategies',
            'compile',
            'gungraun-runner'
        ]);
    });

    it('when version is specific then passes package@version', async () => {
        (io.which as jest.Mock)
            .mockResolvedValueOnce('/usr/bin/cargo-binstall')
            .mockResolvedValueOnce('/usr/bin/gungraun-runner');
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerWithBinstall(new Version(1, 2, 3));

        expect(exec.exec).toHaveBeenCalledWith('cargo', [
            'binstall',
            '-y',
            '--disable-strategies',
            'compile',
            'gungraun-runner@1.2.3'
        ]);
    });

    it('when target is provided then adds --targets flag', async () => {
        (io.which as jest.Mock)
            .mockResolvedValueOnce('/usr/bin/cargo-binstall')
            .mockResolvedValueOnce('/usr/bin/gungraun-runner');
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerWithBinstall(new Version(1, 2, 3), 'x86_64-unknown-linux-gnu');

        const args = (exec.exec as jest.Mock).mock.calls[0][1];
        expect(args).toContain('--targets');
        expect(args).toContain('x86_64-unknown-linux-gnu');
    });

    it('when binstall fails then returns false', async () => {
        (io.which as jest.Mock).mockResolvedValueOnce('/usr/bin/cargo-binstall');
        (exec.exec as jest.Mock).mockRejectedValue(new Error('binstall failed'));

        const result = await installRunnerWithBinstall(new Version(1, 2, 3));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Failed to install gungraun-runner with cargo-binstall: binstall failed'
        );
    });

    it('when binary found on PATH then logs version', async () => {
        (io.which as jest.Mock)
            .mockResolvedValueOnce('/usr/bin/cargo-binstall')
            .mockResolvedValueOnce('/usr/bin/gungraun-runner');
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await installRunnerWithBinstall(Version.latest());

        expect(logInstalledVersion).toHaveBeenCalledWith(
            'gungraun-runner',
            'gungraun-runner',
            'gungraun-runner latest'
        );
    });
});

describe('installValgrind', () => {
    it('when strategy is none then skips installation', async () => {
        await installValgrind(Version.latest(), ['none'], false, 'token', '', '');

        expect(printInfo).toHaveBeenCalledWith('Skipping valgrind installation');
    });

    it('when strategy is invalid then throws', async () => {
        await expect(
            installValgrind(Version.latest(), ['invalid' as never], false, 'token', '', '')
        ).rejects.toThrow("Invalid strategy 'invalid'");
    });

    it('when version is auto then converts to latest for builder strategy', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockResolvedValueOnce(undefined);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (downloadAndExtractValgrindUrl as jest.Mock).mockResolvedValue({
            extractDir: '/tmp/extract',
            name: 'valgrind.tar.gz'
        });
        (fs.promises.readdir as jest.Mock).mockResolvedValue(['bin', 'lib']);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        const autoVersion = Version.auto();

        await installValgrind(
            autoVersion,
            ['builder'],
            false,
            'token',
            'https://example.com/vg.tar.gz',
            ''
        );

        expect(printInfo).not.toHaveBeenCalledWith('Skipping valgrind installation');
    });

    it('when all strategies fail then throws', async () => {
        jest.replaceProperty(process, 'env', {});
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'unknown',
            versionId: null,
            platform: 'unknown-unknown',
            packageManager: null
        });

        await expect(
            installValgrind(new Version(3, 20, 0), ['system'], false, 'token', '', '')
        ).rejects.toThrow('All valgrind installation strategies failed');
    });
});

describe('installValgrindFromBuilder', () => {
    it('when valgrindUrl is provided then downloads from URL', async () => {
        (downloadAndExtractValgrindUrl as jest.Mock).mockResolvedValue({
            extractDir: '/tmp/extract',
            name: 'valgrind.tar.gz'
        });
        (fs.promises.readdir as jest.Mock).mockResolvedValue(['bin', 'lib']);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });

        const result = await installValgrindFromBuilder(
            Version.latest(),
            'token',
            'https://example.com/vg.tar.gz',
            'https://example.com/vg.sha256'
        );

        expect(result).toBe(true);
        expect(downloadAndExtractValgrindUrl).toHaveBeenCalledWith(
            'https://example.com/vg.tar.gz',
            'https://example.com/vg.sha256'
        );
        expect(printInfo).toHaveBeenCalledWith(
            "Downloading valgrind archive from url 'https://example.com/vg.tar.gz'"
        );
    });

    it('when no valgrindUrl then resolves from GitHub', async () => {
        const resolvedVersion = new ResolvedVersion(3, 20, 0);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });
        (detectTarget as jest.Mock).mockResolvedValue('x86_64-unknown-linux-gnu');
        (detectArch as jest.Mock).mockReturnValue('x86_64');
        (resolveValgrindBuilderAssetName as jest.Mock).mockResolvedValue({
            version: resolvedVersion,
            name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz'
        });
        (downloadAndExtractValgrind as jest.Mock).mockResolvedValue('/tmp/extract');
        (fs.promises.readdir as jest.Mock).mockResolvedValue(['bin', 'lib']);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        const result = await installValgrindFromBuilder(Version.latest(), 'token', '', '');

        expect(result).toBe(true);
        expect(resolveValgrindBuilderAssetName).toHaveBeenCalledWith(
            Version.latest(),
            'x86_64',
            'ubuntu-22.04',
            'token'
        );
        expect(downloadAndExtractValgrind).toHaveBeenCalledWith(
            resolvedVersion,
            'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz',
            'token'
        );
    });

    it('when no builder release found then returns false', async () => {
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });
        (detectTarget as jest.Mock).mockResolvedValue('x86_64-unknown-linux-gnu');
        (detectArch as jest.Mock).mockReturnValue('x86_64');
        (resolveValgrindBuilderAssetName as jest.Mock).mockResolvedValue(null);

        const result = await installValgrindFromBuilder(new Version(3, 20, 0), 'token', '', '');

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            expect.stringContaining('No valgrind builder release found')
        );
    });

    it('when exception thrown then returns false', async () => {
        (downloadAndExtractValgrindUrl as jest.Mock).mockRejectedValue(
            new Error('download failed')
        );

        const result = await installValgrindFromBuilder(
            Version.latest(),
            'token',
            'https://example.com/vg.tar.gz',
            ''
        );

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Failed to install valgrind from release: download failed'
        );
    });

    it('when successful then moves extracted files to root', async () => {
        (downloadAndExtractValgrindUrl as jest.Mock).mockResolvedValue({
            extractDir: '/tmp/extract',
            name: 'valgrind.tar.gz'
        });
        (fs.promises.readdir as jest.Mock).mockResolvedValue(['bin', 'lib']);
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });

        await installValgrindFromBuilder(
            Version.latest(),
            'token',
            'https://example.com/vg.tar.gz',
            ''
        );

        expect(exec.exec).toHaveBeenCalledWith('sudo', [
            'mv',
            '/tmp/extract/bin',
            '/tmp/extract/lib',
            '/'
        ]);
    });
});

describe('installValgrindWithPackageManager', () => {
    it('when no package manager then returns false', async () => {
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'unknown',
            versionId: null,
            platform: 'unknown-unknown',
            packageManager: null
        });

        const result = await installValgrindWithPackageManager(new Version(3, 20, 0));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Cannot install valgrind: No package manager detected for this platform'
        );
    });

    it('when version is auto then skips version check and installs', async () => {
        const mockPm = createMockPackageManager();
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        const result = await installValgrindWithPackageManager(Version.auto());

        expect(result).toBe(true);
        expect(resolveValgrindVersion).not.toHaveBeenCalled();
        expect(mockPm.accept).toHaveBeenCalledTimes(1);
    });

    it('when version matches package version then installs', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept
            .mockResolvedValueOnce(new ResolvedVersion(3, 20, 0))
            .mockResolvedValueOnce(undefined);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(3, 20, 0));

        const result = await installValgrindWithPackageManager(new Version(3, 20, 0));

        expect(result).toBe(true);
        expect(mockPm.accept).toHaveBeenCalledTimes(2);
    });

    it('when version does not match package version then returns false', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockResolvedValueOnce(new ResolvedVersion(3, 19, 0));
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(3, 20, 0));

        const result = await installValgrindWithPackageManager(new Version(3, 20, 0));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            "The package version doesn't match the requested version"
        );
    });

    it('when package version not found then returns false', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockResolvedValueOnce(null);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(3, 20, 0));

        const result = await installValgrindWithPackageManager(new Version(3, 20, 0));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            expect.stringContaining('Unable to retrieve version information')
        );
    });

    it('when version check throws then returns false', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockRejectedValue(new Error('network error'));
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(3, 20, 0));

        const result = await installValgrindWithPackageManager(new Version(3, 20, 0));

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            expect.stringContaining('Error retrieving package version')
        );
    });
});

describe('installValgrindBuildDeps', () => {
    it('when no package manager then returns false', async () => {
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'unknown',
            versionId: null,
            platform: 'unknown-unknown',
            packageManager: null
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Cannot install build dependencies: unsupported package manager'
        );
    });

    it('when packages installed then returns true', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockResolvedValue(undefined);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(true);
        expect(mockPm.accept).toHaveBeenCalledWith(expect.any(PackagesInstaller));
        expect(printInfo).toHaveBeenCalledWith('Installed build dependencies: gcc, make, bzip2');
    });

    it('when install fails then returns false', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockRejectedValue(new Error('apt error'));
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        const result = await installValgrindBuildDeps();

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Failed to install build dependencies: apt error');
    });
});

describe('installValgrindFromSource', () => {
    const resolvedVersion = new ResolvedVersion(3, 20, 0);

    it('when installBuildDeps is true then installs build deps first', async () => {
        const mockPm = createMockPackageManager();
        mockPm.accept.mockResolvedValue(undefined);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractValgrindSource as jest.Mock).mockResolvedValue('/tmp/extract');
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (os.cpus as jest.Mock).mockReturnValue([1, 2, 3, 4]);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: mockPm
        });

        const result = await installValgrindFromSource(new Version(3, 20, 0), true);

        expect(result).toBe(true);
        expect(mockPm.accept).toHaveBeenCalledWith(expect.any(PackagesInstaller));
    });

    it('when installBuildDeps is false then skips build deps', async () => {
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractValgrindSource as jest.Mock).mockResolvedValue('/tmp/extract');
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (os.cpus as jest.Mock).mockReturnValue([1, 2, 3, 4]);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });

        const result = await installValgrindFromSource(new Version(3, 20, 0), false);

        expect(result).toBe(true);
    });

    it('when build deps fail then returns false', async () => {
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'unknown',
            versionId: null,
            platform: 'unknown-unknown',
            packageManager: null
        });
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(resolvedVersion);

        const result = await installValgrindFromSource(new Version(3, 20, 0), true);

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Failed to install build dependencies');
    });

    it('when successful then runs configure, make, and make install', async () => {
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractValgrindSource as jest.Mock).mockResolvedValue('/tmp/extract');
        (exec.exec as jest.Mock).mockResolvedValue(0);
        (os.cpus as jest.Mock).mockReturnValue([1, 2, 3, 4]);
        (detectPlatform as jest.Mock).mockResolvedValue({
            id: 'ubuntu',
            versionId: '22.04',
            platform: 'ubuntu-22.04',
            packageManager: createMockPackageManager()
        });

        await installValgrindFromSource(new Version(3, 20, 0), false);

        const sourceDir = '/tmp/extract/valgrind-3.20.0';
        expect(exec.exec).toHaveBeenCalledWith('./configure', ['--prefix=/usr'], {
            cwd: sourceDir
        });
        expect(exec.exec).toHaveBeenCalledWith('make', ['-j4', 'BUILD_DOCS=none'], {
            cwd: sourceDir
        });
        expect(exec.exec).toHaveBeenCalledWith('sudo', ['make', 'install'], {
            cwd: sourceDir
        });
        expect(logInstalledVersion).toHaveBeenCalledWith('valgrind', 'valgrind', 'valgrind-3.20.0');
    });

    it('when configure or make fails then returns false', async () => {
        (resolveValgrindVersion as jest.Mock).mockResolvedValue(resolvedVersion);
        (downloadAndExtractValgrindSource as jest.Mock).mockResolvedValue('/tmp/extract');
        (exec.exec as jest.Mock).mockRejectedValue(new Error('make failed'));
        (os.cpus as jest.Mock).mockReturnValue([1, 2]);

        const result = await installValgrindFromSource(new Version(3, 20, 0), false);

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith(
            'Failed to install valgrind from source: make failed'
        );
    });
});
