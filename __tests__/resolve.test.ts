import * as exec from '@actions/exec';
import { getOctokit } from '@actions/github';
import {
    fetchReleaseAssetData,
    fetchRunnerVersions,
    fetchSortedValgrindVersions,
    resolveRunnerVersion,
    resolveValgrindBuilderAssetName,
    resolveValgrindVersion
} from '../src/resolve';
import { ResolvedVersion, Version } from '../src/version';

jest.mock('@actions/github');
jest.mock('@actions/exec');

afterEach(() => jest.restoreAllMocks());

function mockOctokit(repos: {
    getLatestRelease?: jest.Mock;
    getReleaseByTag?: jest.Mock;
    listReleases?: jest.Mock;
}) {
    const octokit = {
        rest: {
            repos: {
                getLatestRelease: repos.getLatestRelease,
                getReleaseByTag: repos.getReleaseByTag,
                listReleases: repos.listReleases
            }
        }
    };
    (getOctokit as jest.Mock).mockReturnValue(octokit);
    return octokit;
}

describe('fetchReleaseAssetData', () => {
    it('when version is latest', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: {
                    tag_name: 'v3.20.0',
                    assets: [
                        {
                            name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz',
                            browser_download_url: 'https://example.com/a'
                        }
                    ]
                }
            })
        });

        const result = await fetchReleaseAssetData('owner/repo', Version.latest(), 'token');

        expect(result.tagName).toBe('v3.20.0');
        expect(result.assets).toEqual([
            {
                name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz',
                browserDownloadUrl: 'https://example.com/a'
            }
        ]);
    });

    it('when version is specific', async () => {
        const version = new Version(3, 19, 0);
        mockOctokit({
            getReleaseByTag: jest.fn().mockResolvedValue({
                data: {
                    tag_name: 'v3.19.0',
                    assets: [
                        {
                            name: 'valgrind-3.19.0-x86_64-ubuntu-22.04.tar.gz',
                            browser_download_url: 'https://example.com/b'
                        }
                    ]
                }
            })
        });

        const result = await fetchReleaseAssetData('owner/repo', version, 'token');

        expect(result.tagName).toBe('v3.19.0');
        expect(result.assets).toHaveLength(1);
    });

    it('when empty assets array then return empty', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: { tag_name: 'v1.0.0', assets: [] }
            })
        });

        const result = await fetchReleaseAssetData('owner/repo', Version.latest(), 'token');

        expect(result.assets).toEqual([]);
    });

    it('when specific version', async () => {
        const version = new Version(2, 5, 1);
        const getReleaseByTag = jest.fn().mockResolvedValue({
            data: { tag_name: 'v2.5.1', assets: [] }
        });
        mockOctokit({ getReleaseByTag });

        await fetchReleaseAssetData('owner/repo', version, 'token');

        expect(getReleaseByTag).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            tag: 'v2.5.1'
        });
    });

    it('when API error then throws with descriptive message', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockRejectedValue(new Error('not found'))
        });

        await expect(
            fetchReleaseAssetData('owner/repo', Version.latest(), 'token', 0)
        ).rejects.toThrow('Failed to fetch release assets: not found');
    });
});

describe('fetchRunnerVersions', () => {
    it('when releases are fetched', async () => {
        mockOctokit({
            listReleases: jest.fn().mockResolvedValue({
                data: [{ tag_name: 'v1.0.0' }, { tag_name: 'v2.0.0' }]
            })
        });

        const result = await fetchRunnerVersions('token');

        expect(result).toEqual([new ResolvedVersion(1, 0, 0), new ResolvedVersion(2, 0, 0)]);
    });

    it('when API error then throws with descriptive message', async () => {
        mockOctokit({
            listReleases: jest.fn().mockRejectedValue(new Error('API rate limit'))
        });

        await expect(fetchRunnerVersions('token', 0)).rejects.toThrow(
            'Failed to fetch gungraun-runner versions: API rate limit'
        );
    });

    it('when no releases then throws with descriptive message', async () => {
        mockOctokit({
            listReleases: jest.fn().mockResolvedValue({ data: [] })
        });

        await expect(fetchRunnerVersions('token', 0)).rejects.toThrow(
            'Failed to fetch gungraun-runner versions: At least one version should be present'
        );
    });
});

describe('fetchSortedValgrindVersions', () => {
    it('when valgrind versions are fetched sorted', async () => {
        const stdout = `abc123\trefs/tags/VALGRIND_3_19_0"
def456\trefs/tags/VALGRIND_3_20_0
ghi789\trefs/tags/VALGRIND_3_18_0`;

        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await fetchSortedValgrindVersions();

        expect(result).toEqual([
            new ResolvedVersion(3, 18, 0),
            new ResolvedVersion(3, 19, 0),
            new ResolvedVersion(3, 20, 0)
        ]);
    });

    it('when ^{} refs present then filters them', async () => {
        const stdout = `abc123\trefs/tags/VALGRIND_3_20_0^{}
def456\trefs/tags/VALGRIND_3_20_0`;

        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await fetchSortedValgrindVersions();

        expect(result).toEqual([new ResolvedVersion(3, 20, 0)]);
    });

    it('when no versions found then throws', async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: '' });

        await expect(fetchSortedValgrindVersions()).rejects.toThrow('Invalid Valgrind version tag');
    });

    it('when only ^{} refs present then throws', async () => {
        const stdout = 'abc123\trefs/tags/VALGRIND_3_20_0^{}';
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        await expect(fetchSortedValgrindVersions()).rejects.toThrow(
            'Could not determine latest valgrind version from sourceware.org'
        );
    });

    it('when whitespace-only stdout then throws', async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: '   \n  ' });

        await expect(fetchSortedValgrindVersions()).rejects.toThrow('Invalid Valgrind version tag');
    });

    it('when full format with hash prefix', async () => {
        const stdout = 'b1d97947cec771ad75372b682792b281a55d6cc2        refs/tags/VALGRIND_3_9_0';
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await fetchSortedValgrindVersions();

        expect(result).toEqual([new ResolvedVersion(3, 9, 0)]);
    });

    it('when mixed ^{} and non-^{} refs', async () => {
        const stdout = [
            'abc123\trefs/tags/VALGRIND_3_19_0',
            'def456\trefs/tags/VALGRIND_3_19_0^{}',
            'ghi789\trefs/tags/VALGRIND_3_20_0',
            'jkl012\trefs/tags/VALGRIND_3_20_0^{}'
        ].join('\n');
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await fetchSortedValgrindVersions();

        expect(result).toEqual([new ResolvedVersion(3, 19, 0), new ResolvedVersion(3, 20, 0)]);
    });
});

describe('resolveRunnerVersion', () => {
    it('when version is already resolved', async () => {
        const version = new ResolvedVersion(1, 2, 3);

        const result = await resolveRunnerVersion(version, 'token');

        expect(result).toBe(version);
    });

    it('when version is latest', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: { tag_name: 'v2.0.0' }
            })
        });

        const result = await resolveRunnerVersion(Version.latest(), 'token');

        expect(result).toEqual(new ResolvedVersion(2, 0, 0));
    });

    it('when version is auto', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: { tag_name: 'v3.0.0' }
            })
        });

        const result = await resolveRunnerVersion(Version.auto(), 'token');

        expect(result).toEqual(new ResolvedVersion(3, 0, 0));
    });

    it('when API fails then throws with descriptive message', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockRejectedValue(new Error('not found'))
        });

        await expect(resolveRunnerVersion(Version.latest(), 'token', 0)).rejects.toThrow(
            'Could not determine latest release version for gungraun-runner: not found'
        );
    });

    it('when API returns tag without v prefix', async () => {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: { tag_name: '2.0.0' }
            })
        });

        const result = await resolveRunnerVersion(Version.latest(), 'token');

        expect(result).toEqual(new ResolvedVersion(2, 0, 0));
    });
});

describe('resolveValgrindBuilderAssetName', () => {
    const assets = [
        { name: 'valgrind-3.18.0-x86_64-ubuntu-22.04.tar.gz', browser_download_url: 'url-18' },
        { name: 'valgrind-3.19.0-x86_64-ubuntu-22.04.tar.gz', browser_download_url: 'url-19' },
        { name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz', browser_download_url: 'url-20' },
        { name: 'valgrind-3.20.0-aarch64-ubuntu-22.04.tar.gz', browser_download_url: 'url-arm' }
    ];

    function mockReleaseWithAssets(assetsList: { name: string; browser_download_url: string }[]) {
        mockOctokit({
            getLatestRelease: jest.fn().mockResolvedValue({
                data: { tag_name: 'v1.0.0', assets: assetsList }
            })
        });
    }

    describe('when version is auto or latest', () => {
        it('when multiple matching assets', async () => {
            mockReleaseWithAssets(assets);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toEqual({
                version: new ResolvedVersion(3, 20, 0),
                name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz'
            });
        });

        it('when no matching assets then returns null', async () => {
            mockReleaseWithAssets(assets);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'fedora-38',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when no assets at all then returns null', async () => {
            mockReleaseWithAssets([]);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when single matching asset', async () => {
            mockReleaseWithAssets([
                { name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz', browser_download_url: 'url' }
            ]);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toEqual({
                version: new ResolvedVersion(3, 20, 0),
                name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz'
            });
        });

        it('when wrong arch then returns null', async () => {
            mockReleaseWithAssets([
                {
                    name: 'valgrind-3.20.0-aarch64-ubuntu-22.04.tar.gz',
                    browser_download_url: 'url'
                }
            ]);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when wrong platform then returns null', async () => {
            mockReleaseWithAssets([
                { name: 'valgrind-3.20.0-x86_64-fedora-38.tar.gz', browser_download_url: 'url' }
            ]);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when extra characters after .tar.gz then returns null', async () => {
            mockReleaseWithAssets([
                {
                    name: 'valgrind-3.20.0-x86_64-ubuntu-22.04.tar.gz.bak',
                    browser_download_url: 'url'
                }
            ]);

            const result = await resolveValgrindBuilderAssetName(
                Version.latest(),
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });
    });

    describe('when version is specific', () => {
        it('when exact asset name match', async () => {
            mockReleaseWithAssets(assets);

            const version = new Version(3, 19, 0);
            const result = await resolveValgrindBuilderAssetName(
                version,
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toEqual({
                version: new ResolvedVersion(3, 19, 0),
                name: 'valgrind-3.19.0-x86_64-ubuntu-22.04.tar.gz'
            });
        });

        it('when no matching asset then returns null', async () => {
            mockReleaseWithAssets(assets);

            const version = new Version(3, 21, 0);
            const result = await resolveValgrindBuilderAssetName(
                version,
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when arch differs then returns null', async () => {
            mockReleaseWithAssets(assets);

            const version = new Version(3, 19, 0);
            const result = await resolveValgrindBuilderAssetName(
                version,
                'aarch64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });

        it('when extension differs then returns null', async () => {
            mockReleaseWithAssets([
                { name: 'valgrind-3.19.0-x86_64-ubuntu-22.04.zip', browser_download_url: 'url' }
            ]);

            const version = new Version(3, 19, 0);
            const result = await resolveValgrindBuilderAssetName(
                version,
                'x86_64',
                'ubuntu-22.04',
                'token'
            );

            expect(result).toBeNull();
        });
    });
});

describe('resolveValgrindVersion', () => {
    it('when version is specific and exists', async () => {
        const stdout = [
            'abc123\trefs/tags/VALGRIND_3_19_0',
            'def456\trefs/tags/VALGRIND_3_20_0'
        ].join('\n');
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const version = new Version(3, 19, 0);
        const result = await resolveValgrindVersion(version);

        expect(result).toEqual(new ResolvedVersion(3, 19, 0));
    });

    it('when version is specific and does not exist then throws', async () => {
        const stdout = 'abc123\trefs/tags/VALGRIND_3_20_0';
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const version = new Version(3, 99, 0);

        await expect(resolveValgrindVersion(version)).rejects.toThrow('Invalid version 3.99.0');
    });

    it('when version is latest', async () => {
        const stdout = [
            'abc123\trefs/tags/VALGRIND_3_18_0',
            'def456\trefs/tags/VALGRIND_3_20_0',
            'ghi789\trefs/tags/VALGRIND_3_19_0'
        ].join('\n');
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await resolveValgrindVersion(Version.latest());

        expect(result).toEqual(new ResolvedVersion(3, 20, 0));
    });

    it('when version is auto', async () => {
        const stdout = [
            'abc123\trefs/tags/VALGRIND_3_19_0',
            'def456\trefs/tags/VALGRIND_3_20_0'
        ].join('\n');
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await resolveValgrindVersion(Version.auto());

        expect(result).toEqual(new ResolvedVersion(3, 20, 0));
    });

    it('when single version available and latest', async () => {
        const stdout = 'abc123\trefs/tags/VALGRIND_3_20_0';
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await resolveValgrindVersion(Version.latest());

        expect(result).toEqual(new ResolvedVersion(3, 20, 0));
    });

    it('when single version available and auto', async () => {
        const stdout = 'abc123\trefs/tags/VALGRIND_3_20_0';
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout });

        const result = await resolveValgrindVersion(Version.auto());

        expect(result).toEqual(new ResolvedVersion(3, 20, 0));
    });
});
