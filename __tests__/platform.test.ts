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
    PackagesInstaller
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
            'build-dev',
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
        (utils.execSudo as jest.Mock).mockResolvedValue(undefined);

        await pm.updateCache();

        expect(utils.execSudo).toHaveBeenCalledWith('apk', 'update');
    });
});

describe('AptGet', () => {
    const pm = new AptGet();

    it('when getting debug info packages', () => {
        expect(pm.getDebugInfoPackages()).toEqual(['libc6-dbg']);
    });

    it('when getting valgrind build deps', () => {
        expect(pm.getValgrindBuildDeps()).toEqual(['gcc', 'make', 'bzip2']);
    });

    it('when accepting a visitor', () => {
        expect(pm.accept(new TestVisitor())).toBe('apt-get');
    });

    it('when updating cache', async () => {
        (utils.execSudo as jest.Mock).mockResolvedValue(undefined);
        await pm.updateCache();
        expect(utils.execSudo).toHaveBeenCalledWith('apt-get', 'update', '-qq');
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
        (utils.execSudo as jest.Mock).mockResolvedValue(undefined);

        await pm.updateCache();

        expect(utils.execSudo).toHaveBeenCalledWith('pacman', '-Sy');
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
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
            '  Installed: (none)\n  Candidate: 1:3.15.0-1\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitAptGet(mockAptGet)).resolves.toEqual(
            new ResolvedVersion(3, 15, 0)
        );

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('apt-cache', 'policy', 'valgrind');
    });

    it('when there are multiple versions', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
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
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('apt-cache', 'policy', 'valgrind');
    });

    it('when there is no version in the output then returns null', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitAptGet(mockAptGet);

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitApk', () => {
    const mockApk = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Apk;

    it('when there is a single version', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
            'valgrind policy:\n  3.25.1-r2:\n    https://dl-cdn.alpinelinux.org/alpine/v3.23/main\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await visitor.visitApk(mockApk);

        expect(mockApk.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('apk', 'policy', 'valgrind');
    });

    // This doesn't have to reflect the actual output. I haven't found a real-world example with
    // multiple versions. The test simply verifies that multiple versions are parsed.
    it('when there are multiple version', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
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
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('apk', 'policy', 'valgrind');
    });

    it('when no version in output then returns null', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitApk(mockApk);

        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitDnf', () => {
    it('when there is a single version', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
            'valgrind.x86_64   3.17.0-1.fc34   updates\n'
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitDnf(new Dnf())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'dnf',
            'list',
            '--showduplicates',
            'valgrind'
        );
    });

    it('when there are multiple versions', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(
            `valgrind.x86_64   3.16.0-1.fc34   updates
valgrind.x86_64   3.17.0-9.fc22   updates
valgrind.x86_64   3.15.0-1.fc29   updates`
        );

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitDnf(new Dnf())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'dnf',
            'list',
            '--showduplicates',
            'valgrind'
        );
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('no match');

        const visitor = new FetchLatestPackageVersion('valgrind');
        const result = await visitor.visitDnf(new Dnf());

        expect(result).toBeNull();
    });
});

describe('FetchLatestPackageVersion visitPacman', () => {
    const mockPacman = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Pacman;

    it('when there is a single version', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('Version         : 3.17.0-1\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitPacman(mockPacman)).resolves.toEqual(
            new ResolvedVersion(3, 17, 0)
        );

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('pacman', '-Si', 'valgrind');
    });

    it('when there are multiple versions', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(`Version         : 3.17.0-1
Version         : 3.18.3-9
Version         : 3.15.2-0`);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitPacman(mockPacman)).resolves.toEqual(
            new ResolvedVersion(3, 18, 3)
        );

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('pacman', '-Si', 'valgrind');
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('no match');

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
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(output);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitYum(mockYum)).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'yum',
            'list',
            '--showduplicates',
            'valgrind'
        );
        expect(mockYum.extractVersionStrings).toHaveBeenCalledWith(output, 'valgrind');
    });

    it('when yum execution fails then falls back to dnf', async () => {
        (utils.execSudoWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('yum not found'))
            .mockResolvedValueOnce('valgrind.x86_64   3.17.0-1.fc34   updates\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitYum(new Yum())).resolves.toEqual(new ResolvedVersion(3, 17, 0));

        expect(utils.execSudoWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execSudoWithOutput).toHaveBeenNthCalledWith(
            1,
            'yum',
            'list',
            '--showduplicates',
            'valgrind'
        );
        expect(utils.execSudoWithOutput).toHaveBeenNthCalledWith(
            2,
            'dnf',
            'list',
            '--showduplicates',
            'valgrind'
        );
    });
});

describe('FetchLatestPackageVersion visitZypper', () => {
    it('when there is a single version', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('Version   : 3.17.0-1.1\n');

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitZypper(new Zypper())).resolves.toEqual(
            new ResolvedVersion(3, 17, 0)
        );

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('zypper', 'info', 'valgrind');
    });

    it('when there are multiple versions', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue(`Version   : 3.17.0-1.1
Version   : 3.18.0-1.1
Version   : 3.15.0-1.1`);

        const visitor = new FetchLatestPackageVersion('valgrind');
        await expect(visitor.visitZypper(new Zypper())).resolves.toEqual(
            new ResolvedVersion(3, 18, 0)
        );

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('zypper', 'info', 'valgrind');
    });

    it('when regex does not match output then returns null', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('no match');

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
        expect(utils.execSudo).not.toHaveBeenCalled();
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('pkg1', 'pkg2');
        await installer.visitAptGet(mockAptGet);

        expect(mockAptGet.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'apt-get',
            'install',
            '-y',
            'pkg1',
            'pkg2'
        );
    });
});

describe('PackagesInstaller visitApk', () => {
    const mockApk = { updateCache: jest.fn().mockResolvedValue(undefined) } as unknown as Apk;

    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitApk(mockApk);
        expect(utils.execSudo).not.toHaveBeenCalled();
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('musl-dbg');
        await installer.visitApk(mockApk);

        expect(mockApk.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'apk',
            'add',
            '--interactive=no',
            'musl-dbg'
        );
    });
});

describe('PackagesInstaller visitDnf', () => {
    it('when there are no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitDnf(new Dnf());
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('glibc-debuginfo');
        await installer.visitDnf(new Dnf());

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'dnf',
            'install',
            '-y',
            'glibc-debuginfo'
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
        expect(utils.execSudo).not.toHaveBeenCalled();
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('debuginfod');
        await installer.visitPacman(mockPacman);

        expect(mockPacman.updateCache).toHaveBeenCalled();
        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'pacman',
            '-S',
            '--noconfirm',
            'debuginfod'
        );
    });
});

describe('PackagesInstaller visitYum', () => {
    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitYum(new Yum());
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('pkg1');
        await installer.visitYum(new Yum());

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith('yum', 'install', '-y', 'pkg1');
    });

    it('when yum fails then falls back to dnf', async () => {
        (utils.execSudoWithOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('yum not found'))
            .mockResolvedValueOnce('');

        const installer = new PackagesInstaller('pkg1');
        await installer.visitYum(new Yum());

        expect(utils.execSudoWithOutput).toHaveBeenCalledTimes(2);
        expect(utils.execSudoWithOutput).toHaveBeenNthCalledWith(1, 'yum', 'install', '-y', 'pkg1');
        expect(utils.execSudoWithOutput).toHaveBeenNthCalledWith(2, 'dnf', 'install', '-y', 'pkg1');
    });
});

describe('visitZypper', () => {
    it('when no packages then skips installation', async () => {
        const installer = new PackagesInstaller();
        await installer.visitZypper(new Zypper());
        expect(utils.execSudoWithOutput).not.toHaveBeenCalled();
    });

    it('when there are packages then installs them', async () => {
        (utils.execSudoWithOutput as jest.Mock).mockResolvedValue('');

        const installer = new PackagesInstaller('glibc-debuginfo');
        await installer.visitZypper(new Zypper());

        expect(utils.execSudoWithOutput).toHaveBeenCalledWith(
            'zypper',
            '--non-interactive',
            '--plus-content',
            'debug',
            'install',
            'glibc-debuginfo'
        );
    });
});
