import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as utils from '../src/utils';
import * as fs from 'fs';

import { afterEach } from 'node:test';

jest.mock('@actions/core');
jest.mock('@actions/exec');

jest.mock('fs', () => {
    const realFs = jest.requireActual('fs');
    return {
        ...realFs,
        readdirSync: jest.fn(realFs.readdirSync),
        promises: realFs.promises
    };
});

afterEach(() => jest.restoreAllMocks());

describe('bail', () => {
    it('when called the action is set to failed and process exits with 1 and the message', () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit: ${code}`); // stop execution and make the call observable
        }) as jest.SpyInstance;

        expect(() => utils.bail('message')).toThrow('process.exit: 1');

        expect(core.setFailed).toHaveBeenCalledWith('message');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe('isRoot', () => {
    it('when uid is 0 then returns true', () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        expect(utils.isRoot()).toBe(true);
    });

    it('when uid is non-zero then returns false', () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        expect(utils.isRoot()).toBe(false);
    });
});

describe('isDebug', () => {
    it('returns false when GUNGRAUN_ACTION_DEBUG is not set', () => {
        jest.replaceProperty(process, 'env', { ...process.env });
        delete (process.env as Record<string, string | undefined>).GUNGRAUN_ACTION_DEBUG;
        expect(utils.isDebug()).toBe(false);
        jest.restoreAllMocks();
    });

    it('returns true when GUNGRAUN_ACTION_DEBUG is set to yes', () => {
        jest.replaceProperty(process, 'env', { ...process.env, GUNGRAUN_ACTION_DEBUG: 'yes' });
        expect(utils.isDebug()).toBe(true);
        jest.restoreAllMocks();
    });

    it('returns true when GUNGRAUN_ACTION_DEBUG is set to any non-empty string', () => {
        jest.replaceProperty(process, 'env', { ...process.env, GUNGRAUN_ACTION_DEBUG: '1' });
        expect(utils.isDebug()).toBe(true);
        jest.restoreAllMocks();
    });
});

describe('execPrivilegedWithOutput', () => {
    it('calls exec.getExecOutput with sudo when not root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'output'
        });

        const result = await utils.execPrivilegedWithOutput('cmd', ['arg1', 'arg2']);

        expect(exec.getExecOutput).toHaveBeenCalledWith('sudo', ['cmd', 'arg1', 'arg2'], {
            silent: true
        });
        expect(result).toBe('output');
    });

    it('calls exec.getExecOutput without sudo when root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'output'
        });

        const result = await utils.execPrivilegedWithOutput('cmd', ['arg1', 'arg2']);

        expect(exec.getExecOutput).toHaveBeenCalledWith('cmd', ['arg1', 'arg2'], {
            silent: true
        });
        expect(result).toBe('output');
    });

    it('passes env option when provided and not root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'output'
        });

        await utils.execPrivilegedWithOutput('apt-get', ['install', '-y', 'pkg'], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });

        expect(exec.getExecOutput).toHaveBeenCalledWith(
            'sudo',
            ['apt-get', 'install', '-y', 'pkg'],
            {
                silent: true,
                env: expect.objectContaining({ DEBIAN_FRONTEND: 'noninteractive' })
            }
        );
    });

    it('passes env option when provided and root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'output'
        });

        await utils.execPrivilegedWithOutput('apt-get', ['install', '-y', 'pkg'], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });

        expect(exec.getExecOutput).toHaveBeenCalledWith('apt-get', ['install', '-y', 'pkg'], {
            silent: true,
            env: expect.objectContaining({ DEBIAN_FRONTEND: 'noninteractive' })
        });
    });

    it('sets silent to false when GUNGRAUN_ACTION_DEBUG is set', async () => {
        jest.replaceProperty(process, 'env', { ...process.env, GUNGRAUN_ACTION_DEBUG: 'yes' });
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: 'out' });

        await utils.execPrivilegedWithOutput('cmd', ['arg']);

        expect(exec.getExecOutput).toHaveBeenCalledWith('sudo', ['cmd', 'arg'], {
            silent: false
        });
        jest.restoreAllMocks();
    });
});

describe('execPrivileged', () => {
    it('calls exec.exec with sudo when not root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('cmd', ['arg1', 'arg2']);

        expect(exec.exec).toHaveBeenCalledWith('sudo', ['cmd', 'arg1', 'arg2'], {
            silent: true
        });
    });

    it('calls exec.exec without sudo when root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('cmd', ['arg1', 'arg2']);

        expect(exec.exec).toHaveBeenCalledWith('cmd', ['arg1', 'arg2'], {
            silent: true
        });
    });

    it('passes cwd option when not root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('make', ['install'], { cwd: '/src' });

        expect(exec.exec).toHaveBeenCalledWith('sudo', ['make', 'install'], {
            silent: true,
            cwd: '/src'
        });
    });

    it('passes cwd option when root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('make', ['install'], { cwd: '/src' });

        expect(exec.exec).toHaveBeenCalledWith('make', ['install'], {
            silent: true,
            cwd: '/src'
        });
    });

    it('passes env option when not root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('apt-get', ['update'], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });

        expect(exec.exec).toHaveBeenCalledWith('sudo', ['apt-get', 'update'], {
            silent: true,
            env: expect.objectContaining({ DEBIAN_FRONTEND: 'noninteractive' })
        });
    });

    it('passes env option when root', async () => {
        jest.spyOn(process, 'getuid').mockReturnValue(0);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('apt-get', ['update'], {
            env: { DEBIAN_FRONTEND: 'noninteractive' }
        });

        expect(exec.exec).toHaveBeenCalledWith('apt-get', ['update'], {
            silent: true,
            env: expect.objectContaining({ DEBIAN_FRONTEND: 'noninteractive' })
        });
    });

    it('sets silent to false when GUNGRAUN_ACTION_DEBUG is set', async () => {
        jest.replaceProperty(process, 'env', { ...process.env, GUNGRAUN_ACTION_DEBUG: 'yes' });
        jest.spyOn(process, 'getuid').mockReturnValue(1000);
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execPrivileged('cmd', ['arg']);

        expect(exec.exec).toHaveBeenCalledWith('sudo', ['cmd', 'arg'], {
            silent: false
        });
        jest.restoreAllMocks();
    });
});

describe('findBinary', () => {
    it('returns joined path when entry matches and has parentPath', async () => {
        const fakeDirents = [
            { name: 'other.txt', isFile: () => true, parentPath: '/root/a' },
            { name: 'target.txt', isFile: () => true, parentPath: '/root/b' }
        ];

        jest.spyOn(fs, 'readdirSync').mockReturnValue(fakeDirents as any);

        await expect(utils.findBinary('/root', 'target.txt')).resolves.toBe('/root/b/target.txt');
        expect(fs.readdirSync).toHaveBeenCalledWith('/root', {
            withFileTypes: true,
            recursive: true
        });
    });

    it('returns null when not found', async () => {
        const fakeDirents = [{ name: 'x', isFile: () => false }];
        jest.spyOn(fs, 'readdirSync').mockReturnValue(fakeDirents as any);

        await expect(utils.findBinary('/root', 'missing.txt')).resolves.toBeNull();
    });
});

describe('getCargoBin', () => {
    it('uses CARGO when set', () => {
        jest.replaceProperty(process, 'env', { ...process.env, CARGO: '/custom/cargo' });
        expect(utils.getCargoBin()).toBe('/custom/cargo');
        jest.restoreAllMocks();
    });

    it('falls back when not set', () => {
        jest.replaceProperty(process, 'env', { ...process.env }); // no CARGO
        expect(utils.getCargoBin()).toBe('cargo');
        jest.restoreAllMocks();
    });
});

describe('logInstalledVersion', () => {
    it('logs version output with label', async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: 'binary 1.2.3\n'
        });
        await utils.logInstalledVersion('binary', 'label');

        expect(exec.getExecOutput).toHaveBeenCalledWith('binary', ['--version'], {
            silent: true,
            ignoreReturnCode: true
        });
        expect(core.info).toHaveBeenCalledWith('label installed: binary 1.2.3');
    });

    it("defaults to 'version unknown' when stdout is empty", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: '' });

        await utils.logInstalledVersion('binary', 'label');

        expect(core.info).toHaveBeenCalledWith('label installed: version unknown');
    });
});

describe('normalizePath', () => {
    it('when path starts with ./ then strips the prefix', () => {
        expect(utils.normalizePath('./foo/bar')).toBe('foo/bar');
    });

    it('when path has no ./ prefix then returns unchanged', () => {
        expect(utils.normalizePath('foo/bar')).toBe('foo/bar');
    });

    it('when path has leading/trailing whitespace then trims before stripping ./', () => {
        expect(utils.normalizePath('  ./foo  ')).toBe('foo');
    });

    it('when path is just ./ then returns just .', () => {
        expect(utils.normalizePath('./')).toBe('.');
    });

    it('when ./ appears in the middle then does not strip it', () => {
        expect(utils.normalizePath('foo/./bar')).toBe('foo/./bar');
    });
});

describe('printError', () => {
    it('delegates to core.error', () => {
        utils.printError('some error');
        expect(core.error).toHaveBeenCalledWith('some error');
    });
});

describe('printInfo', () => {
    it('delegates to core.info', () => {
        utils.printInfo('some info');
        expect(core.info).toHaveBeenCalledWith('some info');
    });
});

describe('printWarning', () => {
    it('delegates to core.warning', () => {
        utils.printWarning('some warning');
        expect(core.warning).toHaveBeenCalledWith('some warning');
    });
});

describe('splitOnce', () => {
    it('when separator is found then splits at first occurrence', () => {
        expect(utils.splitOnce('a:b', ':')).toEqual(['a', 'b']);
    });

    it("when separator is not found then returns [str, '']", () => {
        expect(utils.splitOnce('abc', ':')).toEqual(['abc', '']);
    });

    it('when separator appears multiple times then splits at first only', () => {
        expect(utils.splitOnce('a-b-c', '-')).toEqual(['a', 'b-c']);
    });

    it("when separator is at the start then returns ['', rest]", () => {
        expect(utils.splitOnce('::b', '::')).toEqual(['', 'b']);
    });

    it("when separator is at the end then returns [before, '']", () => {
        expect(utils.splitOnce('a::', '::')).toEqual(['a', '']);
    });

    it("when string is empty then returns ['', '']", () => {
        expect(utils.splitOnce('', '::')).toEqual(['', '']);
    });

    it('when separator is multi-character then works correctly', () => {
        expect(utils.splitOnce('a==b==c', '==')).toEqual(['a', 'b==c']);
    });

    it("when separator is empty then returns ['', 'str']", () => {
        expect(utils.splitOnce('a==b==c', '')).toEqual(['', 'a==b==c']);
    });
});

describe('withGroup', () => {
    it('calls startGroup and endGroup around the function', async () => {
        const mockFn = jest.fn().mockResolvedValue('result');
        const result = await utils.withGroup('my-group', mockFn);

        expect(result).toBe('result');
        expect(core.startGroup).toHaveBeenCalledWith('my-group');
        expect(core.endGroup).toHaveBeenCalled();
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('calls endGroup even if the function throws', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('boom'));

        await expect(utils.withGroup('err-group', mockFn)).rejects.toThrow('boom');
        expect(core.startGroup).toHaveBeenCalledWith('err-group');
        expect(core.endGroup).toHaveBeenCalled();
    });
});
