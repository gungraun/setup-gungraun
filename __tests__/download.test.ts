import * as tc from '@actions/tool-cache';
import * as path from 'path';
import { verifySha } from '../src/hash';
import { fetchReleaseAssetData } from '../src/resolve';
import {
    downloadAndExtractRelease,
    downloadAndExtractRunner,
    downloadAndExtractValgrindUrl,
    downloadAndExtractValgrindSource,
    downloadAndExtractValgrind
} from '../src/download';
import { ResolvedVersion } from '../src/version';

jest.mock('@actions/tool-cache');
jest.mock('../src/hash');
jest.mock('../src/resolve');
jest.mock('../src/utils', () => ({
    GUNGRAUN_REPO: 'gungraun/gungraun',
    VALGRIND_BUILDER_REPO: 'gungraun/valgrind-builder',
    retry: jest.fn((_n: number, fn: () => Promise<unknown>) => fn())
}));

afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
});

describe('downloadAndExtractRelease', () => {
    const version = new ResolvedVersion(1, 2, 3);

    it('when archive and sha assets exist', async () => {
        (fetchReleaseAssetData as jest.Mock).mockResolvedValue({
            tagName: 'v1.2.3',
            assets: [
                { name: 'app.tar.gz', browserDownloadUrl: 'https://example.com/app.tar.gz' },
                {
                    name: 'app.tar.gz.sha256',
                    browserDownloadUrl: 'https://example.com/app.tar.gz.sha256'
                }
            ]
        });
        (tc.downloadTool as jest.Mock).mockImplementation((url: string) => {
            if (url.endsWith('.sha256')) return '/tmp/app.tar.gz.sha256';
            return '/tmp/app.tar.gz';
        });
        (verifySha as jest.Mock).mockResolvedValue(undefined);
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const result = await downloadAndExtractRelease(
            'owner/repo',
            version,
            'app.tar.gz',
            'token'
        );

        expect(result).toBe('/tmp/extracted');
        expect(fetchReleaseAssetData).toHaveBeenCalledWith('owner/repo', version, 'token');
        expect(tc.downloadTool).toHaveBeenCalledWith('https://example.com/app.tar.gz');
        expect(tc.downloadTool).toHaveBeenCalledWith('https://example.com/app.tar.gz.sha256');
        expect(verifySha).toHaveBeenCalledWith(
            256,
            '/tmp/app.tar.gz',
            '/tmp/app.tar.gz.sha256',
            'app.tar.gz'
        );
        expect(tc.extractTar).toHaveBeenCalledWith('/tmp/app.tar.gz');
    });

    it('when no sha256 asset then skips verification', async () => {
        (fetchReleaseAssetData as jest.Mock).mockResolvedValue({
            tagName: 'v1.2.3',
            assets: [{ name: 'app.tar.gz', browserDownloadUrl: 'https://example.com/app.tar.gz' }]
        });
        (tc.downloadTool as jest.Mock).mockResolvedValue('/tmp/app.tar.gz');
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const result = await downloadAndExtractRelease(
            'owner/repo',
            version,
            'app.tar.gz',
            'token'
        );

        expect(result).toBe('/tmp/extracted');
        expect(tc.downloadTool).toHaveBeenCalledWith('https://example.com/app.tar.gz');
        expect(verifySha).not.toHaveBeenCalled();
        expect(tc.extractTar).toHaveBeenCalledWith('/tmp/app.tar.gz');
    });

    it('when archive asset not found then throws', async () => {
        (fetchReleaseAssetData as jest.Mock).mockResolvedValue({
            tagName: 'v1.2.3',
            assets: []
        });

        await expect(
            downloadAndExtractRelease('owner/repo', version, 'missing.tar.gz', 'token')
        ).rejects.toThrow('Could not find release asset: missing.tar.gz');
    });
});

describe('downloadAndExtractRunner', () => {
    it('when called then delegates to downloadAndExtractRelease', async () => {
        const version = new ResolvedVersion(1, 2, 3);
        const target = 'x86_64-unknown-linux-gnu';
        const assetName = `gungraun-runner-v1.2.3-${target}.tar.gz`;

        (fetchReleaseAssetData as jest.Mock).mockResolvedValue({
            tagName: 'v1.2.3',
            assets: [{ name: assetName, browserDownloadUrl: `https://example.com/${assetName}` }]
        });
        (tc.downloadTool as jest.Mock).mockResolvedValue('/tmp/archive.tar.gz');
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const result = await downloadAndExtractRunner(version, target, 'token');

        expect(result).toBe('/tmp/extracted');
        expect(fetchReleaseAssetData).toHaveBeenCalledWith('gungraun/gungraun', version, 'token');
        expect(tc.downloadTool).toHaveBeenCalledWith(`https://example.com/${assetName}`);
    });
});

describe('downloadAndExtractValgrind', () => {
    it('when called then delegates to downloadAndExtractRelease with VALGRIND_BUILDER_REPO', async () => {
        const version = new ResolvedVersion(3, 20, 0);
        const assetName = 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz';

        (fetchReleaseAssetData as jest.Mock).mockResolvedValue({
            tagName: 'v1.0.0',
            assets: [
                { name: assetName, browserDownloadUrl: `https://example.com/${assetName}` },
                {
                    name: `${assetName}.sha256`,
                    browserDownloadUrl: `https://example.com/${assetName}.sha256`
                }
            ]
        });
        (tc.downloadTool as jest.Mock).mockImplementation((url: string) => {
            if (url.endsWith('.sha256')) return '/tmp/archive.tar.gz.sha256';
            return '/tmp/archive.tar.gz';
        });
        (verifySha as jest.Mock).mockResolvedValue(undefined);
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const result = await downloadAndExtractValgrind(version, assetName, 'token');

        expect(result).toBe('/tmp/extracted');
        expect(fetchReleaseAssetData).toHaveBeenCalledWith(
            'gungraun/valgrind-builder',
            version,
            'token'
        );
    });
});

describe('downloadAndExtractValgrindUrl', () => {
    it('when sha URL provided', async () => {
        (tc.downloadTool as jest.Mock).mockImplementation((url: string) => {
            if (url === 'https://example.com/valgrind.tar.gz') return '/tmp/valgrind.tar.gz';
            return '/tmp/valgrind.tar.gz.sha256';
        });
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');
        (verifySha as jest.Mock).mockResolvedValue(undefined);

        const result = await downloadAndExtractValgrindUrl(
            new URL('https://example.com/valgrind.tar.gz'),
            new URL('https://example.com/valgrind.tar.gz.sha256')
        );

        expect(result).toEqual({ extractDir: '/tmp/extracted', name: 'valgrind.tar.gz' });
        expect(verifySha).toHaveBeenCalledWith(
            'auto',
            '/tmp/valgrind.tar.gz',
            '/tmp/valgrind.tar.gz.sha256',
            'valgrind.tar.gz'
        );
        expect(tc.extractTar).toHaveBeenCalledWith('/tmp/valgrind.tar.gz');
    });

    it('when sha URL is falsy then skips verification and extracts', async () => {
        (tc.downloadTool as jest.Mock).mockResolvedValue('/tmp/valgrind.tar.gz');
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const result = await downloadAndExtractValgrindUrl(
            new URL('https://example.com/valgrind.tar.gz')
        );

        expect(result).toEqual({
            extractDir: '/tmp/extracted',
            name: path.basename('/tmp/valgrind.tar.gz')
        });
        expect(verifySha).not.toHaveBeenCalled();
        expect(tc.extractTar).toHaveBeenCalledWith('/tmp/valgrind.tar.gz');
    });
});

describe('downloadAndExtractValgrindSource', () => {
    it('when called then uses correct URLs, verifies SHA-512, and extracts with xj flag', async () => {
        (tc.downloadTool as jest.Mock).mockImplementation((url: string) => {
            if (url === 'https://sourceware.org/pub/valgrind/valgrind-3.20.0.tar.bz2') {
                return '/tmp/valgrind-3.20.0.tar.bz2';
            }
            return '/tmp/sha512.sum';
        });
        (verifySha as jest.Mock).mockResolvedValue(undefined);
        (tc.extractTar as jest.Mock).mockResolvedValue('/tmp/extracted');

        const v = new ResolvedVersion(3, 20, 0);
        const result = await downloadAndExtractValgrindSource(v);

        expect(result).toBe('/tmp/extracted');
        expect(tc.downloadTool).toHaveBeenCalledWith(
            'https://sourceware.org/pub/valgrind/valgrind-3.20.0.tar.bz2'
        );
        expect(tc.downloadTool).toHaveBeenCalledWith(
            'https://sourceware.org/pub/valgrind/sha512.sum'
        );
        expect(verifySha).toHaveBeenCalledWith(
            512,
            '/tmp/valgrind-3.20.0.tar.bz2',
            '/tmp/sha512.sum',
            'valgrind-3.20.0.tar.bz2'
        );
        expect(tc.extractTar).toHaveBeenCalledWith('/tmp/valgrind-3.20.0.tar.bz2', undefined, 'xj');
    });
});
