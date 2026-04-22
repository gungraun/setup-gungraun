import * as utils from '../src/utils';
import {
    Apk,
    AptGet,
    Dnf,
    Pacman,
    PackageManagerVisitor,
    Yum,
    Zypper,
    FetchLatestPackageVersion,
    PackagesInstaller,
    MicroDnf
} from '../src/platform';
import { ResolvedVersion } from '../src/version';

jest.mock('../src/utils');

afterEach(() => jest.resetAllMocks());

class TestVisitor implements PackageManagerVisitor<string> {
    visitApk(_pm: Apk): string {
        return 'apk';
    }
    visitAptGet(_pm: AptGet): string {
        return 'apt-get';
    }
    visitDnf(_pm: Dnf): string {
        return 'dnf';
    }
    visitMicroDnf(_pm: MicroDnf): string {
        return 'microdnf';
    }
    visitPacman(_pm: Pacman): string {
        return 'pacman';
    }
    visitYum(_pm: Yum): string {
        return 'yum';
    }
    visitZypper(_pm: Zypper): string {
        return 'zypper';
    }
}

describe('Apk', () => {
    const pm = new Apk();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['musl-dbg']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual([
            'build-base',
            'bzip2',
            'sed',
            'perl',
            'linux-headers'
        ]);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('apk');
    });

    it('when updating cache', async () => {
        (utils.execPrivileged as jest.Mock).mockResolvedValue(undefined);

        await pm.updateCache();

        expect(utils.execPrivileged).toHaveBeenCalledWith('apk', ['update']);
    });
});

describe('AptGet', () => {
    const pm = new AptGet();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['libc6-dbg']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['build-essential', 'gcc', 'make', 'bzip2']);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('apt-get');
    });

    it('when updating cache', async () => {
        (utils.execPrivileged as jest.Mock).mockResolvedValue(undefined);
        await pm.updateCache();
        expect(utils.execPrivileged).toHaveBeenCalledWith(
            'apt-get',
            ['update', '-qq', '--allow-releaseinfo-change'],
            {
                env: { DEBIAN_FRONTEND: 'noninteractive' }
            }
        );
    });
});

describe('Dnf', () => {
    const pm = new Dnf();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['glibc-debuginfo']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('dnf');
    });

    describe('extractVersionStrings', () => {
        it('when typical dnf version output', () => {
            const output = 'valgrind.x86_64   3.17.0-1.fc34   updates';
            expect(pm.extractVersionStrings(output, 'valgrind')).toEqual(['3.17.0-1.fc34']);
        });

        it('when package is not found then returns null', () => {
            expect(pm.extractVersionStrings('no match here', 'valgrind')).toBeNull();
        });
    });
});

describe('MicroDnf', () => {
    const pm = new MicroDnf();

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('microdnf');
    });

    it('when getting debug info packages then inherits from Dnf', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['glibc-debuginfo']);
    });

    it('when getting valgrind build deps then inherits from Dnf', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });

    describe('extractVersionStrings', () => {
        it('when typical microdnf version output', () => {
            const output = 'valgrind-1:3.25.1-3.el10.x86_64';
            expect(pm.extractVersionStrings(output, 'valgrind')).toEqual(['3.25.1-3.el10.x86_64']);
        });

        it('when multiple versions', () => {
            const output = `valgrind-1:3.15.0-1.el10.x86_64
valgrind-1:3.25.1-3.el10.x86_64
valgrind-1:3.17.0-1.el10.x86_64`;
            expect(pm.extractVersionStrings(output, 'valgrind')).toEqual([
                '3.15.0-1.el10.x86_64',
                '3.25.1-3.el10.x86_64',
                '3.17.0-1.el10.x86_64'
            ]);
        });

        it('when package is not found then returns null', () => {
            expect(pm.extractVersionStrings('no match here', 'valgrind')).toBeNull();
        });
    });
});

describe('Pacman', () => {
    const pm = new Pacman();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['debuginfod']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('pacman');
    });

    it('when updating cache', async () => {
        (utils.execPrivileged as jest.Mock).mockResolvedValue(undefined);

        await pm.updateCache();

        expect(utils.execPrivileged).toHaveBeenCalledWith('pacman', ['-Sy']);
    });
});

describe('Yum', () => {
    const pm = new Yum();

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('yum');
    });

    it('when getting valgrind build deps then inherits from Dnf', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });
});

describe('Zypper', () => {
    const pm = new Zypper();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['glibc-debuginfo']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('zypper');
    });
});

describe('FetchLatestPackageVersion.getLatestVersion', () => {
    it('when there are multiple versions', () => {
        const result = FetchLatestPackageVersion.getLatestVersion([
            '3.15.0-1',
            '3.17.0-1',
            '3.16.0-1'
        ]);
        expect(result).toEqual(new ResolvedVersion(3, 17, 0));
    });

    it('when there is a single version', () => {
        const result = FetchLatestPackageVersion.getLatestVersion(['3.15.0-1']);
        expect(result).toEqual(new ResolvedVersion(3, 15, 0));
    });

    it('when versions is empty then returns null', () => {
        expect(FetchLatestPackageVersion.getLatestVersion([])).toBeNull();
    });

    it('when versions is null then returns null', () => {
        expect(FetchLatestPackageVersion.getLatestVersion(null)).toBeNull();
    });

    it('when versions is undefined then returns null', () => {
        expect(FetchLatestPackageVersion.getLatestVersion(undefined)).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitAptGet', () => {
    const mockAptGet = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as AptGet;

    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            '  Installed: (none)\n  Candidate: 1:3.15.0-1\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitAptGet(mockAptGet)).resolves.toEqual(
            new ResolvedVersion(3, 15, 0)
        );

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'apt-cache',
            ['policy', 'valgrind'],
            { env: { DEBIAN_FRONTEND: 'noninteractive' } }
        );
    });

    it('when there are multiple versions', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            `  Installed: (none)
  Candidate: 1:3.15.0-1
  Installed: (none)
  Candidate: 1:3.16.0-2\n`
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitAptGet(mockAptGet)).resolves.toEqual(
            new ResolvedVersion(3, 16, 0)
        );

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'apt-cache',
            ['policy', 'valgrind'],
            { env: { DEBIAN_FRONTEND: 'noninteractive' } }
        );
    });

    it('when there is no version in the output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitAptGet(mockAptGet);

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitApk', () => {
    const mockApk = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Apk;

    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            'valgrind policy:\n  3.25.1-r2:\n    https://dl-cdn.alpinelinux.org/alpine/v3.23/main\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await visitor.visitApk(mockApk);

        expect(mockApk.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('apk', ['policy', 'valgrind']);
    });

    it('when there are multiple version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            `valgrind policy:
  3.25.1-r2:
    https://dl-cdn.alpinelinux.org/alpine/v3.23/main
valgrind policy:
  3.26.1-r0:
    https://dl-cdn.alpinelinux.org/alpine/v3.23/main
valgrind policy:
  3.23.0-r0:
    https://dl-cdn.alpinelinux.org/alpine/v3.23/main`
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitApk(mockApk)).resolves.toEqual(new ResolvedVersion(3, 26, 1));

        expect(mockApk.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('apk', ['policy', 'valgrind']);
    });

    it('when no version in output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitApk(mockApk);

        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitDnf', () => {
    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            'valgrind.x86_64   3.17.0-1.fc34   updates\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitDnf(new Dnf())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('dnf', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
    });

    it('when there are multiple versions', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            `valgrind.x86_64   3.16.0-1.fc34   updates
valgrind.x86_64   3.17.0-9.fc22   updates
valgrind.x86_64   3.15.0-1.fc29   updates`
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitDnf(new Dnf())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('dnf', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitDnf(new Dnf());

        expect(result).toBeNull();
    });

    it('when dnf command fails then falls back to microdnf', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('dnf not found'))
            .mockResolvedValueOnce('valgrind-1:3.25.1-3.el10.x86_64\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitDnf(new Dnf())).resolves.toEqual(new ResolvedVersion(3, 25, 1));

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(1, 'dnf', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(2, 'microdnf', [
            '--enablerepo=*-debuginfo',
            'repoquery',
            'valgrind'
        ]);
    });
});

describe('FetchLatestPackageVersion visitMicroDnf', () => {
    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            'valgrind-1:3.25.1-3.el10.x86_64\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitMicroDnf(new MicroDnf())).resolves.toEqual(
            new ResolvedVersion(3, 25, 1)
        );

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('microdnf', [
            '--enablerepo=*-debuginfo',
            'repoquery',
            'valgrind'
        ]);
    });

    it('when there are multiple versions', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            `valgrind-1:3.15.0-1.el10.x86_64
valgrind-1:3.25.1-3.el10.x86_64
valgrind-1:3.17.0-1.el10.x86_64`
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitMicroDnf(new MicroDnf())).resolves.toEqual(
            new ResolvedVersion(3, 25, 1)
        );

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('microdnf', [
            '--enablerepo=*-debuginfo',
            'repoquery',
            'valgrind'
        ]);
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitMicroDnf(new MicroDnf());

        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitPacman', () => {
    const mockPacman = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Pacman;

    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(
            'Version         : 3.17.0-1\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitPacman(mockPacman)).resolves.toEqual(
            new ResolvedVersion(3, 17, 0)
        );

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('pacman', ['-Si', 'valgrind']);
    });

    it('when there are multiple versions', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(`Version         : 3.17.0-1
Version         : 3.18.3-9
Version         : 3.15.2-0`);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitPacman(mockPacman)).resolves.toEqual(
            new ResolvedVersion(3, 18, 3)
        );

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('pacman', ['-Si', 'valgrind']);
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitPacman(mockPacman);

        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitYum', () => {
    it('when yum succeeds and there is a version', async () => {
        const mockYum = {
            extractVersionStrings: jest.fn().mockReturnValue(['3.17.0-1.fc34'])
        } as unknown as Yum;
        const output = 'valgrind.x86_64   3.17.0-1.fc34   updates\n';
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(output);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitYum(mockYum)).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('yum', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
        expect(mockYum.extractVersionStrings).toHaveBeenCalledWith(output, 'valgrind');
    });

    it('when yum execution fails then falls back to dnf', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('yum not found'))
            .mockResolvedValueOnce('valgrind.x86_64   3.17.0-1.fc34   updates\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitYum(new Yum())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(1, 'yum', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(2, 'dnf', [
            '--enablerepo=*-debuginfo',
            'list',
            '--showduplicates',
            'valgrind'
        ]);
    });
});

describe('FetchLatestPackageVersion visitZypper', () => {
    it('when there is a single version', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('Version   : 3.17.0-1.1\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitZypper(new Zypper())).resolves.toEqual(
            new ResolvedVersion(3, 17, 0)
        );

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('zypper', ['info', 'valgrind']);
    });

    it('when there are multiple versions', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue(`Version   : 3.17.0-1.1
Version   : 3.18.0-1.1
Version   : 3.15.0-1.1`);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitZypper(new Zypper())).resolves.toEqual(
            new ResolvedVersion(3, 18, 0)
        );

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('zypper', ['info', 'valgrind']);
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitZypper(new Zypper());

        expect(result).toBeNull();
    });
});

describe('PackagesInstaller', () => {
    describe('hasPackages', () => {
        it('when no packages then returns false', () => {
            expect(new PackagesInstaller().hasPackages()).toBe(false);
        });

        it('when packages are provided', () => {
            expect(new PackagesInstaller('pkg1').hasPackages()).toBe(true);
        });

        it('when multiple packages are provided', () => {
            expect(new PackagesInstaller('pkg1', 'pkg2').hasPackages()).toBe(true);
        });
    });
});

describe('PackagesInstaller visitAptGet', () => {
    const mockAptGet = {
        updateCache: jest.fn().mockResolvedValue(undefined)
    } as unknown as AptGet;

    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitAptGet(mockAptGet);
        expect(utils.execPrivileged).not.toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('pkg1', 'pkg2');
        await installer.visitAptGet(mockAptGet);

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'apt-get',
            ['install', '-y', '--no-install-recommends', 'pkg1', 'pkg2'],
            { env: { DEBIAN_FRONTEND: 'noninteractive' }, silent: false }
        );
    });
});

describe('PackagesInstaller visitApk', () => {
    const mockApk = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Apk;

    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitApk(mockApk);
        expect(utils.execPrivileged).not.toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('musl-dbg');
        await installer.visitApk(mockApk);

        expect(mockApk.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith('apk', ['add', 'musl-dbg'], {
            silent: false
        });
    });
});

describe('PackagesInstaller visitDnf', () => {
    it('when there are no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitDnf(new Dnf());
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('glibc-debuginfo');
        await installer.visitDnf(new Dnf());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'dnf',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'glibc-debuginfo'],
            { silent: false }
        );
    });

    it('when dnf install fails then falls back to microdnf', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('dnf not found'))
            .mockResolvedValueOnce('');

        const installer = new PackagesInstaller('pkg1');
        await installer.visitDnf(new Dnf());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(
            1,
            'dnf',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'pkg1'],
            { silent: false }
        );
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(
            2,
            'microdnf',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'pkg1'],
            { silent: false }
        );
    });
});

describe('PackagesInstaller visitMicroDnf', () => {
    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitMicroDnf(new MicroDnf());
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('glibc-debuginfo');
        await installer.visitMicroDnf(new MicroDnf());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'microdnf',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'glibc-debuginfo'],
            { silent: false }
        );
    });
});

describe('PackagesInstaller visitPacman', () => {
    const mockPacman = {
        updateCache: jest.fn().mockResolvedValue(undefined)
    } as unknown as Pacman;

    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitPacman(mockPacman);
        expect(utils.execPrivileged).not.toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('debuginfod');
        await installer.visitPacman(mockPacman);

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'pacman',
            ['-S', '--noconfirm', 'debuginfod'],
            { silent: false }
        );
    });
});

describe('PackagesInstaller visitYum', () => {
    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitYum(new Yum());
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('pkg1');
        await installer.visitYum(new Yum());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'yum',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'pkg1'],
            { silent: false }
        );
    });

    it('when yum fails then falls back to dnf', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('yum not found'))
            .mockResolvedValueOnce('');

        const installer = new PackagesInstaller('pkg1');
        await installer.visitYum(new Yum());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(
            1,
            'yum',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'pkg1'],
            { silent: false }
        );
        expect(utils.execPrivilegedWithOutput).toHaveBeenNthCalledWith(
            2,
            'dnf',
            ['--enablerepo=*-debuginfo', 'install', '-y', 'pkg1'],
            { silent: false }
        );
    });
});

describe('visitZypper', () => {
    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitZypper(new Zypper());
        expect(utils.execPrivilegedWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execPrivilegedWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('glibc-debuginfo');
        await installer.visitZypper(new Zypper());

        expect(utils.execPrivilegedWithOutput).toHaveBeenCalledWith(
            'zypper',
            ['--non-interactive', '--plus-content', 'debug', 'install', 'glibc-debuginfo'],
            { silent: false }
        );
    });
});
