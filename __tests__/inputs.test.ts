import * as core from '@actions/core';
import { detectProjectVersion, detectTarget } from '../src/detect';
import { fetchRunnerVersions, fetchSortedValgrindVersions } from '../src/resolve';
import {
    DEFAULT_RUNNER_STRATEGY,
    DEFAULT_VALGRIND_STRATEGY,
    parseGithubToken,
    parseInstallBuildDeps,
    parseRunnerStrategies,
    parseRunnerTarget,
    parseRunnerVersion,
    parseStrategies,
    parseValgrindConfigureArgs,
    parseValgrindMakeEnvs,
    parseValgrindShaUrl,
    parseValgrindStrategies,
    parseValgrindUrl,
    parseValgrindVersion,
    VALID_RUNNER_STRATEGIES,
    VALID_VALGRIND_STRATEGIES
} from '../src/inputs';
import { ResolvedVersion, Version } from '../src/version';

jest.mock('@actions/core');
jest.mock('../src/detect');
jest.mock('../src/resolve');

afterEach(() => jest.restoreAllMocks());

describe('parseStrategies', () => {
    it('when single valid strategy then returns it', () => {
        expect(parseStrategies('binstall', VALID_RUNNER_STRATEGIES, 'runner')).toEqual([
            'binstall'
        ]);
    });

    it('when multiple valgrind strategies then returns them', () => {
        expect(parseStrategies('builder,system', VALID_VALGRIND_STRATEGIES, 'valgrind')).toEqual([
            'builder',
            'system'
        ]);
    });

    it('when whitespace around strategies then trims', () => {
        expect(parseStrategies(' binstall , release ', VALID_RUNNER_STRATEGIES, 'runner')).toEqual([
            'binstall',
            'release'
        ]);
    });

    it('when uppercase input then lowercases', () => {
        expect(parseStrategies('BINSTALL', VALID_RUNNER_STRATEGIES, 'runner')).toEqual([
            'binstall'
        ]);
    });

    it('when empty string then returns none', () => {
        expect(parseStrategies('', VALID_RUNNER_STRATEGIES, 'runner')).toEqual(['none']);
    });

    it('when just commas and spaces then returns none', () => {
        expect(parseStrategies(' , , ', VALID_RUNNER_STRATEGIES, 'runner')).toEqual(['none']);
    });

    it('when none alone then returns none', () => {
        expect(parseStrategies('none', VALID_RUNNER_STRATEGIES, 'runner')).toEqual(['none']);
    });

    it('when none with other strategies then returns none', () => {
        expect(parseStrategies('none,binstall', VALID_RUNNER_STRATEGIES, 'runner')).toEqual([
            'none'
        ]);
    });

    it('when duplicate strategies then deduplicates', () => {
        expect(parseStrategies('binstall,binstall', VALID_RUNNER_STRATEGIES, 'runner')).toEqual([
            'binstall'
        ]);
    });

    it('when invalid strategy then throws', () => {
        expect(() => parseStrategies('invalid', VALID_RUNNER_STRATEGIES, 'runner')).toThrow(
            "Invalid runner strategy 'invalid'"
        );
    });

    it('when invalid strategy then error includes valid values', () => {
        expect(() => parseStrategies('invalid', VALID_RUNNER_STRATEGIES, 'runner')).toThrow(
            VALID_RUNNER_STRATEGIES.join(', ')
        );
    });
});

describe('parseGithubToken', () => {
    it('when core input provided then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('token-from-input');
        await expect(parseGithubToken()).resolves.toBe('token-from-input');
    });

    it('when core input empty then falls back to env var', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        jest.replaceProperty(process, 'env', { ...process.env, GITHUB_TOKEN: 'env-token' });
        await expect(parseGithubToken()).resolves.toBe('env-token');
    });

    it('when neither available then returns empty string', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        jest.replaceProperty(process, 'env', { ...process.env });
        delete process.env.GITHUB_TOKEN;
        await expect(parseGithubToken()).resolves.toBe('');
    });

    it('when env var has whitespace then trims', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        jest.replaceProperty(process, 'env', { ...process.env, GITHUB_TOKEN: '  token  ' });
        await expect(parseGithubToken()).resolves.toBe('token');
    });
});

describe('parseRunnerTarget', () => {
    it('when input provided then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('x86_64-unknown-linux-gnu');
        (detectTarget as jest.Mock).mockResolvedValue('aarch64-unknown-linux-gnu');
        await expect(parseRunnerTarget(false)).resolves.toBe('x86_64-unknown-linux-gnu');
    });

    it('when input empty then falls back to detectTarget', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        (detectTarget as jest.Mock).mockResolvedValue('aarch64-unknown-linux-gnu');
        await expect(parseRunnerTarget(false)).resolves.toBe('aarch64-unknown-linux-gnu');
    });

    it('when runner strategy is none then returns empty string', async () => {
        const result = await parseRunnerTarget(true);
        expect(result).toBe('');
    });
});

describe('parseRunnerStrategies', () => {
    it('when input provided then parses strategies', async () => {
        (core.getInput as jest.Mock).mockReturnValue('binstall,release');
        await expect(parseRunnerStrategies()).resolves.toEqual(['binstall', 'release']);
    });

    it('when input empty then uses default', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        await expect(parseRunnerStrategies()).resolves.toEqual(
            DEFAULT_RUNNER_STRATEGY.split(',').map((s) => s.trim())
        );
    });

    it('when invalid strategy then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('invalid');
        await expect(parseRunnerStrategies()).rejects.toThrow('Invalid runner-strategy:');
    });
});

describe('parseRunnerVersion', () => {
    it('when auto then detects project version', async () => {
        (core.getInput as jest.Mock).mockReturnValue('auto');
        (detectProjectVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(1, 2, 3));

        const result = await parseRunnerVersion(false, 'some-token');

        expect(result).toEqual(new Version(1, 2, 3));
        expect(detectProjectVersion).toHaveBeenCalled();
    });

    it('when AUTO uppercase then detects project version', async () => {
        (core.getInput as jest.Mock).mockReturnValue('AUTO');
        (detectProjectVersion as jest.Mock).mockResolvedValue(new ResolvedVersion(1, 2, 3));

        const result = await parseRunnerVersion(false, 'some-token');

        expect(result).toEqual(new Version(1, 2, 3));
    });

    it('when auto-detect fails then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('auto');
        (detectProjectVersion as jest.Mock).mockRejectedValue(new Error('no version found'));

        await expect(parseRunnerVersion(false, 'token')).rejects.toThrow(
            'Unable to detect gungraun-runner version:'
        );
    });

    it('when latest then returns Version.latest()', async () => {
        (core.getInput as jest.Mock).mockReturnValue('latest');
        (fetchRunnerVersions as jest.Mock).mockResolvedValue([]);

        const result = await parseRunnerVersion(false, 'some-token');
        expect(result).toEqual(Version.latest());
    });

    it('when valid specific version then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('1.2.3');
        (fetchRunnerVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(1, 2, 3),
            new ResolvedVersion(2, 0, 0)
        ]);

        const result = await parseRunnerVersion(false, 'some-token');
        expect(result).toEqual(new Version(1, 2, 3));
    });

    it('when specific version not in valid list then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('9.9.9');
        (fetchRunnerVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(1, 2, 3),
            new ResolvedVersion(2, 0, 0)
        ]);

        await expect(parseRunnerVersion(false, 'token')).rejects.toThrow('Invalid runner-version');
    });

    it('when fetching valid versions fails then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('1.2.3');
        (fetchRunnerVersions as jest.Mock).mockRejectedValue(new Error('network error'));

        await expect(parseRunnerVersion(false, 'token')).rejects.toThrow(
            'Failed to fetch gungraun-runner versions:'
        );
    });

    it('when runner strategy is none then returns auto', async () => {
        const result = await parseRunnerVersion(true, 'token');
        expect(result).toEqual(Version.auto());
    });
});

describe('parseValgrindStrategies', () => {
    it('when input provided then parses strategies', async () => {
        (core.getInput as jest.Mock).mockReturnValue('builder,system');
        await expect(parseValgrindStrategies()).resolves.toEqual(['builder', 'system']);
    });

    it('when input empty then uses default', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        await expect(parseValgrindStrategies()).resolves.toEqual(
            DEFAULT_VALGRIND_STRATEGY.split(',').map((s) => s.trim())
        );
    });

    it('when invalid strategy then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('invalid');
        await expect(parseValgrindStrategies()).rejects.toThrow('Invalid valgrind-strategy:');
    });
});

describe('parseValgrindUrl', () => {
    it('when input provided then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('https://example.com/valgrind.tar.gz');
        await expect(parseValgrindUrl()).resolves.toEqual(
            new URL('https://example.com/valgrind.tar.gz')
        );
    });

    it('when input empty then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        await expect(parseValgrindUrl()).rejects.toThrow('Invalid valgrind-url:');
    });

    it('when invalid url then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('https////missing.colon.com');
        await expect(parseValgrindUrl()).rejects.toThrow('Invalid valgrind-url:');
    });
});

describe('parseValgrindShaUrl', () => {
    it('when input provided then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('https://example.com/valgrind.tar.gz.sha256');
        await expect(parseValgrindShaUrl()).resolves.toEqual(
            new URL('https://example.com/valgrind.tar.gz.sha256')
        );
    });

    it('when input empty then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        await expect(parseValgrindShaUrl()).rejects.toThrow('Invalid valgrind-sha-url:');
    });

    it('when invalid url then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('https////missing.colon.com');
        await expect(parseValgrindShaUrl()).rejects.toThrow('Invalid valgrind-sha-url:');
    });
});

describe('parseValgrindVersion', () => {
    it('when latest then returns Version.latest()', async () => {
        (core.getInput as jest.Mock).mockReturnValue('latest');
        const result = await parseValgrindVersion();
        expect(result).toEqual(Version.latest());
    });

    it('when auto then returns Version.auto()', async () => {
        (core.getInput as jest.Mock).mockReturnValue('auto');
        const result = await parseValgrindVersion();
        expect(result).toEqual(Version.auto());
    });

    it('when valid specific version then returns it', async () => {
        (core.getInput as jest.Mock).mockReturnValue('3.22.0');
        (fetchSortedValgrindVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(3, 16, 0),
            new ResolvedVersion(3, 22, 0)
        ]);

        const result = await parseValgrindVersion();
        expect(result).toEqual(new Version(3, 22, 0));
    });

    it('when invalid version string then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('not-a-version');

        await expect(parseValgrindVersion()).rejects.toThrow('Invalid valgrind-version:');
    });

    it('when version not in valid list then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('3.15.0');
        (fetchSortedValgrindVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(3, 16, 0),
            new ResolvedVersion(3, 22, 0)
        ]);

        await expect(parseValgrindVersion()).rejects.toThrow("Invalid valgrind-version '3.15.0'");
    });

    it('when fetchSortedValgrindVersions fails then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('3.22.0');
        (fetchSortedValgrindVersions as jest.Mock).mockRejectedValue(new Error('network error'));

        await expect(parseValgrindVersion()).rejects.toThrow('Failed to validate valgrind version');
    });

    it('when version has major < 3 then filtered out and throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('2.22.0');
        (fetchSortedValgrindVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(2, 22, 0),
            new ResolvedVersion(3, 22, 0)
        ]);

        await expect(parseValgrindVersion()).rejects.toThrow("Invalid valgrind-version '2.22.0'");
    });

    it('when version has minor < 16 then filtered out and throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('3.15.0');
        (fetchSortedValgrindVersions as jest.Mock).mockResolvedValue([
            new ResolvedVersion(3, 15, 0),
            new ResolvedVersion(3, 22, 0)
        ]);

        await expect(parseValgrindVersion()).rejects.toThrow("Invalid valgrind-version '3.15.0'");
    });
});

describe('parseInstallBuildDeps', () => {
    it('when input is true then returns true', async () => {
        (core.getBooleanInput as jest.Mock).mockReturnValue(true);
        await expect(parseInstallBuildDeps()).resolves.toBe(true);
    });

    it('when input is false then returns false', async () => {
        (core.getBooleanInput as jest.Mock).mockReturnValue(false);
        await expect(parseInstallBuildDeps()).resolves.toBe(false);
    });
});

describe('parseValgrindConfigureArgs', () => {
    it('when input empty then returns empty array', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([]);
    });

    it('when input is whitespace only then returns empty array', async () => {
        (core.getInput as jest.Mock).mockReturnValue('  \n  ');
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([]);
    });

    it('when simple unquoted args then splits on whitespace', async () => {
        (core.getInput as jest.Mock).mockReturnValue('--without-mpicc --enable-only64bit');
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([
            '--without-mpicc',
            '--enable-only64bit'
        ]);
    });

    it('when double-quoted arg then preserves as single token', async () => {
        (core.getInput as jest.Mock).mockReturnValue('--flags="-fno-stack-protector -no-pie"');
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([
            '--flags=-fno-stack-protector -no-pie'
        ]);
    });

    it('when single-quoted arg then preserves as single token', async () => {
        (core.getInput as jest.Mock).mockReturnValue("--flags='-fno-stack-protector -no-pie'");
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([
            '--flags=-fno-stack-protector -no-pie'
        ]);
    });

    it('when mixed quoted and unquoted then parses correctly', async () => {
        (core.getInput as jest.Mock).mockReturnValue(
            '--without-mpicc --flags="-fno-stack-protector -no-pie" --enable-only64bit'
        );
        await expect(parseValgrindConfigureArgs()).resolves.toEqual([
            '--without-mpicc',
            '--flags=-fno-stack-protector -no-pie',
            '--enable-only64bit'
        ]);
    });

    it('when invalid token then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('--without-mpicc || true');
        await expect(parseValgrindConfigureArgs()).rejects.toThrow(
            'Invalid valgrind-configure-args:'
        );
    });
});

describe('parseValgrindMakeEnvs', () => {
    it('when input empty then returns empty Map', async () => {
        (core.getInput as jest.Mock).mockReturnValue('');
        const result = await parseValgrindMakeEnvs();
        expect(result.size).toBe(0);
    });

    it('when input is whitespace only then returns empty Map', async () => {
        (core.getInput as jest.Mock).mockReturnValue('  \n  ');
        const result = await parseValgrindMakeEnvs();
        expect(result.size).toBe(0);
    });

    it('when simple KEY=VALUE then parses correctly', async () => {
        (core.getInput as jest.Mock).mockReturnValue('CFLAGS=-O0');
        const result = await parseValgrindMakeEnvs();
        expect(Object.fromEntries(result)).toEqual({ CFLAGS: '-O0' });
    });

    it('when multiple env vars then parses all', async () => {
        (core.getInput as jest.Mock).mockReturnValue('CFLAGS="-O0 -g" LDFLAGS=-static');
        const result = await parseValgrindMakeEnvs();
        expect(Object.fromEntries(result)).toEqual({ CFLAGS: '-O0 -g', LDFLAGS: '-static' });
    });

    it('when duplicate keys then last value wins', async () => {
        (core.getInput as jest.Mock).mockReturnValue('FOO=bar FOO=baz');
        const result = await parseValgrindMakeEnvs();
        expect(Object.fromEntries(result)).toEqual({ FOO: 'baz' });
    });

    it('when value contains equals then splits on first equals only', async () => {
        (core.getInput as jest.Mock).mockReturnValue('FOO=a=b');
        const result = await parseValgrindMakeEnvs();
        expect(Object.fromEntries(result)).toEqual({ FOO: 'a=b' });
    });

    it('when key without value then sets empty string', async () => {
        (core.getInput as jest.Mock).mockReturnValue('VERBOSE');
        const result = await parseValgrindMakeEnvs();
        expect(Object.fromEntries(result)).toEqual({ VERBOSE: '' });
    });

    it('when invalid token then throws', async () => {
        (core.getInput as jest.Mock).mockReturnValue('CFLAGS=-O0 || true');
        await expect(parseValgrindMakeEnvs()).rejects.toThrow('Invalid valgrind-make-envs:');
    });
});
