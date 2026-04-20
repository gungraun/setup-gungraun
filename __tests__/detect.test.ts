import * as exec from '@actions/exec';
import * as fs from 'fs';
import { Apk, AptGet, Dnf, Pacman, Yum, Zypper } from '../src/platform';
import {
    detectArch,
    detectPlatform,
    detectProjectVersion,
    detectShaVariant,
    detectTarget,
    resolvePackageManager
} from '../src/detect';
import { ResolvedVersion } from '../src/version';

jest.mock('@actions/exec');
jest.mock('../src/utils', () => ({
    getCargoBin: jest.fn(() => 'cargo'),
    isDebug: jest.fn(() => false)
}));
jest.mock('fs', () => {
    const realFs = jest.requireActual('fs');
    return {
        ...realFs,
        existsSync: jest.fn(),
        readFileSync: jest.fn()
    };
});

afterEach(() => jest.restoreAllMocks());

describe('detectArch', () => {
    it('extracts arch from regular x86_64 target triple', () => {
        expect(detectArch('x86_64-unknown-linux-gnu')).toBe('x86_64');
    });

    it('when empty string then returns empty string', () => {
        expect(detectArch('')).toBe('');
    });

    it('returns the whole string when no hyphen', () => {
        expect(detectArch('x86_64')).toBe('x86_64');
    });
});

describe('detectShaVariant', () => {
    it('when sha1 (40 chars)', () => {
        expect(detectShaVariant('a'.repeat(40))).toBe('sha1');
    });

    it('when sha224 (56 chars)', () => {
        expect(detectShaVariant('a'.repeat(56))).toBe('sha224');
    });

    it('when sha256 (64 chars)', () => {
        expect(detectShaVariant('a'.repeat(64))).toBe('sha256');
    });

    it('when sha384 (96 chars)', () => {
        expect(detectShaVariant('a'.repeat(96))).toBe('sha384');
    });

    it('when sha512 (128 chars)', () => {
        expect(detectShaVariant('a'.repeat(128))).toBe('sha512');
    });

    it('when empty string then returns null', () => {
        expect(detectShaVariant('')).toBeNull();
    });

    it('when invalid length then returns null', () => {
        expect(detectShaVariant('a'.repeat(32))).toBeNull();
    });
});

describe('resolvePackageManager', () => {
    it('when id is debian then returns AptGet', () => {
        expect(resolvePackageManager('debian', null)).toBeInstanceOf(AptGet);
    });

    it('when id is ubuntu then returns null without idLike', () => {
        expect(resolvePackageManager('ubuntu', null)).toBeNull();
    });

    it('when idLike is debian then returns AptGet', () => {
        expect(resolvePackageManager('ubuntu', 'debian')).toBeInstanceOf(AptGet);
    });

    it('when id is fedora then returns Dnf', () => {
        expect(resolvePackageManager('fedora', null)).toBeInstanceOf(Dnf);
    });

    it('when idLike is fedora then returns Dnf', () => {
        expect(resolvePackageManager('some-distro', 'fedora')).toBeInstanceOf(Dnf);
    });

    it('when id is arch then returns Pacman', () => {
        expect(resolvePackageManager('arch', null)).toBeInstanceOf(Pacman);
    });

    it('when idLike is arch then returns Pacman', () => {
        expect(resolvePackageManager('manjaro', 'arch')).toBeInstanceOf(Pacman);
    });

    it('when id is alpine then returns Apk', () => {
        expect(resolvePackageManager('alpine', null)).toBeInstanceOf(Apk);
    });

    it('when idLike is alpine then returns Apk', () => {
        expect(resolvePackageManager('postmarketos', 'alpine')).toBeInstanceOf(Apk);
    });

    it('when id is amzn then returns Yum', () => {
        expect(resolvePackageManager('amzn', null)).toBeInstanceOf(Yum);
    });

    it('when idLike is suse then returns Zypper', () => {
        expect(resolvePackageManager('opensuse', 'suse')).toBeInstanceOf(Zypper);
    });

    it('when idLike matches before id', () => {
        expect(resolvePackageManager('amzn', 'debian')).toBeInstanceOf(AptGet);
    });

    it('when unknown id and null idLike then returns null', () => {
        expect(resolvePackageManager('unknown', null)).toBeNull();
    });

    it('when unknown id and unknown idLike then returns null', () => {
        expect(resolvePackageManager('unknown', 'also-unknown')).toBeNull();
    });

    it('when empty idLike then falls through to id lookup', () => {
        expect(resolvePackageManager('debian', '')).toBeInstanceOf(AptGet);
    });
});

describe('detectPlatform', () => {
    const allFields = ['ID="ubuntu"', 'VERSION_ID="22.04"', 'ID_LIKE="debian"'].join('\n');

    const idWithVersion = ['ID="alpine"', 'VERSION_ID="3.19"'].join('\n');

    const onlyId = ['ID="arch"'].join('\n');

    it('when all fields are present then detects platform', async () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(allFields);

        const result = await detectPlatform();

        expect(result.id).toBe('ubuntu');
        expect(result.relatedIds).toEqual(['debian']);
        expect(result.versionId).toBe('22.04');
        expect(result.platform).toBe('ubuntu-22.04');
        expect(result.packageManager).toBeInstanceOf(AptGet);
    });

    it('when id with version then detects platform', async () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(idWithVersion);

        const result = await detectPlatform();

        expect(result.id).toBe('alpine');
        expect(result.relatedIds).toEqual([]);
        expect(result.versionId).toBe('3.19');
        expect(result.platform).toBe('alpine-3.19');
        expect(result.packageManager).toBeInstanceOf(Apk);
    });

    it('when no VERSION_ID then platform id is unknown', async () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(onlyId);

        const result = await detectPlatform();

        expect(result.id).toBe('arch');
        expect(result.relatedIds).toEqual([]);
        expect(result.versionId).toBeNull();
        expect(result.platform).toBe('arch-unknown');
        expect(result.packageManager).toBeInstanceOf(Pacman);
    });

    it('when os-release has unquoted values', async () => {
        const unquotedRelease = ['ID=ubuntu', 'VERSION_ID=22.04', 'ID_LIKE=debian'].join('\n');

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(unquotedRelease);

        const result = await detectPlatform();

        expect(result.id).toBe('ubuntu');
        expect(result.relatedIds).toEqual(['debian']);
        expect(result.versionId).toBe('22.04');
        expect(result.platform).toBe('ubuntu-22.04');
        expect(result.packageManager).toBeInstanceOf(AptGet);
    });

    it('when /etc/os-release missing then throws', async () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);

        await expect(detectPlatform()).rejects.toThrow(
            'Cannot detect platform: /etc/os-release not found'
        );
    });

    it('when ID field missing then throws', async () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('VERSION_ID="22.04"');

        await expect(detectPlatform()).rejects.toThrow(
            'Cannot detect platform: ID missing from /etc/os-release'
        );
    });

    it('when unknown ID then packageManager is null', async () => {
        const unknownRelease = ['ID="unknown"', 'VERSION_ID="1.0"'].join('\n');

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(unknownRelease);

        const result = await detectPlatform();

        expect(result.id).toBe('unknown');
        expect(result.relatedIds).toEqual([]);
        expect(result.versionId).toBe('1.0');
        expect(result.platform).toBe('unknown-1.0');
        expect(result.packageManager).toBeNull();
    });

    it('when ID_LIKE has multiple space-separated values then splits them', async () => {
        const content = 'ID="manjaro-arm"\nVERSION_ID="23.02"\nID_LIKE="arch linux"';

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(content);

        const result = await detectPlatform();

        expect(result.relatedIds).toEqual(['arch', 'linux']);
    });
});

describe('detectProjectVersion', () => {
    it('when cargo metadata has single gungraun package then returns version', async () => {
        const metadata = JSON.stringify({
            packages: [{ name: 'gungraun', version: '1.2.3' }]
        });
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: metadata });

        const result = await detectProjectVersion();

        expect(result).toEqual(new ResolvedVersion(1, 2, 3));
    });

    it('when cargo metadata has multiple gungraun packages then throws', async () => {
        const metadata = JSON.stringify({
            packages: [
                { name: 'gungraun', version: '1.2.3' },
                { name: 'gungraun', version: '2.0.0' }
            ]
        });
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: metadata });

        await expect(detectProjectVersion()).rejects.toThrow('Multiple gungraun versions detected');
    });

    it('when cargo metadata has no gungraun package then falls back to pkgid', async () => {
        (exec.getExecOutput as jest.Mock)
            .mockResolvedValueOnce({
                stdout: JSON.stringify({ packages: [{ name: 'other', version: '0.1.0' }] })
            })
            .mockResolvedValueOnce({ stdout: 'gungraun#1.2.3' });

        const result = await detectProjectVersion();

        expect(result).toEqual(new ResolvedVersion(1, 2, 3));
    });

    it('when cargo metadata throws then falls back to pkgid', async () => {
        (exec.getExecOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('metadata failed'))
            .mockResolvedValueOnce({ stdout: 'gungraun#4.5.6' });

        const result = await detectProjectVersion();

        expect(result).toEqual(new ResolvedVersion(4, 5, 6));
    });

    it('when cargo metadata returns invalid json then falls back to pkgid', async () => {
        (exec.getExecOutput as jest.Mock)
            .mockResolvedValueOnce({ stdout: 'not json' })
            .mockResolvedValueOnce({ stdout: 'gungraun#7.8.9' });

        const result = await detectProjectVersion();

        expect(result).toEqual(new ResolvedVersion(7, 8, 9));
    });

    it('when both metadata and pkgid fail then throws', async () => {
        (exec.getExecOutput as jest.Mock)
            .mockRejectedValueOnce(new Error('metadata failed'))
            .mockRejectedValueOnce(new Error('pkgid failed'));

        await expect(detectProjectVersion()).rejects.toThrow(
            'Could not detect gungraun-runner version'
        );
    });

    it('when metadata has gungraun with no version then falls back to pkgid', async () => {
        const metadata = JSON.stringify({
            packages: [{ name: 'gungraun' }]
        });
        (exec.getExecOutput as jest.Mock)
            .mockResolvedValueOnce({ stdout: metadata })
            .mockResolvedValueOnce({ stdout: 'gungraun#1.0.0' });

        const result = await detectProjectVersion();

        expect(result).toEqual(new ResolvedVersion(1, 0, 0));
    });
});

describe('detectTarget', () => {
    it('when rustc -vV has host line then returns target triple', async () => {
        const rustcOutput = `rustc 1.70.0 (90c541806 2023-05-31)
binary: rustc
commit-hash: 90c541806fa1
host: x86_64-unknown-linux-gnu
release: 1.70.0`;

        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: rustcOutput });

        const result = await detectTarget();

        expect(result).toBe('x86_64-unknown-linux-gnu');
    });

    it('when rustc -vV has no host line then throws', async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'rustc 1.70.0\nbinary: rustc\n'
        });

        await expect(detectTarget()).rejects.toThrow('Could not detect target from rustc -vV');
    });
});
