import { ResolvedVersion, Version } from '../src/version';

describe('Version from a valgrind tag', () => {
    it('with ^{} suffix', () => {
        expect(
            Version.fromValgrindTag(
                'b1d97947cec771ad75372b682792b281a55d6cc2        refs/tags/svn/VALGRIND_3_9_0^{}'
            )
        ).toEqual(new Version(3, 9, 0));
    });

    it('without ^{} suffix', () => {
        expect(
            Version.fromValgrindTag(
                'b1d97947cec771ad75372b682792b281a55d6cc2        refs/tags/svn/VALGRIND_3_9_0'
            )
        ).toEqual(new Version(3, 9, 0));
    });

    it('without hash prefix', () => {
        expect(Version.fromValgrindTag('refs/tags/svn/VALGRIND_3_9_0')).toEqual(
            new Version(3, 9, 0)
        );
    });

    it('just VALGRIND prefix', () => {
        expect(Version.fromValgrindTag('VALGRIND_3_9_0')).toEqual(new Version(3, 9, 0));
    });

    it('multiple digits', () => {
        expect(Version.fromValgrindTag('VALGRIND_42_0_1000000')).toEqual(
            new Version(42, 0, 1_000_000)
        );
    });
});

describe('Version from a valgrind tag when invalid input', () => {
    it('when lowercase valgrind then throws', () => {
        expect(() => Version.fromValgrindTag('valgrind_3_9_0')).toThrow();
    });

    it('when points instead of underscores then throws', () => {
        expect(() => Version.fromValgrindTag('VALGRIND_3.9.0')).toThrow();
    });

    it('when missing patch version then throws', () => {
        expect(() => Version.fromValgrindTag('VALGRIND_3_9')).toThrow();
    });
});

describe('Version from a string', () => {
    it('just `latest`', () => {
        expect(Version.fromString('latest')).toEqual(Version.latest());
    });

    it('latest uppercase', () => {
        expect(Version.fromString('LATEST')).toEqual(Version.latest());
    });

    it('latest mixed case', () => {
        expect(Version.fromString('LatESt')).toEqual(Version.latest());
    });

    it('latest with whitespace', () => {
        expect(Version.fromString(' latest  ')).toEqual(Version.latest());
    });

    it('just `auto`', () => {
        expect(Version.fromString('auto')).toEqual(Version.auto());
    });

    it('auto uppercase', () => {
        expect(Version.fromString('AUTO')).toEqual(Version.auto());
    });

    it('auto mixed case', () => {
        expect(Version.fromString('AUtO')).toEqual(Version.auto());
    });

    it('auto with whitespace', () => {
        expect(Version.fromString(' auto  ')).toEqual(Version.auto());
    });

    it('ignores v prefix', () => {
        expect(Version.fromString('v3.15.0')).toEqual(new Version(3, 15, 0));
    });

    it('ignores uppercase V prefix', () => {
        expect(Version.fromString('V3.15.0')).toEqual(new Version(3, 15, 0));
    });

    it('all zero', () => {
        expect(Version.fromString('0.0.0')).toEqual(new Version(0, 0, 0));
    });

    it('negative major is interpreted as dash not sign', () => {
        expect(Version.fromString('-1.0.0')).toEqual(new Version(1, 0, 0));
    });

    it('more than two dots', () => {
        expect(Version.fromString('1.0.0.1')).toEqual(new Version(1, 0, 0));
    });

    it('two full versions', () => {
        expect(Version.fromString('1.0.0.2.0.0')).toEqual(new Version(1, 0, 0));
    });

    it('debian version from apt-cache policy', () => {
        expect(Version.fromString('1:3.15.0-1')).toEqual(new Version(3, 15, 0));
    });

    it('apk version from policy', () => {
        expect(Version.fromString('3.15.0-r2')).toEqual(new Version(3, 15, 0));
    });

    it('pacman version from -Si', () => {
        expect(Version.fromString('3.15.0-1')).toEqual(new Version(3, 15, 0));
    });

    it('zypper version from info', () => {
        expect(Version.fromString('3.15.0-1.1')).toEqual(new Version(3, 15, 0));
    });

    it('dnf/yum version from list', () => {
        expect(Version.fromString('valgrind.x86_64   3.15.0-1.fc34   updates')).toEqual(
            new Version(3, 15, 0)
        );
    });
});

describe('Version from a tag when invalid', () => {
    it('when no patch version then throws', () => {
        expect(() => Version.fromString('3.15')).toThrow();
    });

    it('when valgrind version tag then throws', () => {
        expect(() => Version.fromString('VALGRIND_3_15_0')).toThrow();
    });

    it('when negative minor then throws', () => {
        expect(() => Version.fromString('3.-1.0')).toThrow();
    });

    it('when negative patch then throws', () => {
        expect(() => Version.fromString('3.1.-1')).toThrow();
    });
});

describe('Version constructor with unsafe numbers', () => {
    it('when major exceeds MAX_SAFE_INTEGER then throws', () => {
        expect(() => new Version(Number.MAX_SAFE_INTEGER + 1, 0, 0)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });

    it('when minor exceeds MAX_SAFE_INTEGER then throws', () => {
        expect(() => new Version(0, Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });

    it('when patch exceeds MAX_SAFE_INTEGER then throws', () => {
        expect(() => new Version(0, 0, Number.MAX_SAFE_INTEGER + 1)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });

    it('when major is NaN then throws', () => {
        expect(() => new Version(NaN, 0, 0)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });

    it('when minor is a float then throws', () => {
        expect(() => new Version(0, 1.5, 0)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });

    it('when major is Infinity then throws', () => {
        expect(() => new Version(Infinity, 0, 0)).toThrow(
            'A version cannot be represented by an unsafe number'
        );
    });
});

describe('Version latest and auto', () => {
    it('isLatest returns true', () => {
        expect(Version.latest().isLatest()).toBe(true);
    });

    it('isAutoOrLatest returns true when latest', () => {
        expect(Version.latest().isAutoOrLatest()).toBe(true);
    });

    it('isAutoOrLatest returns true when auto', () => {
        expect(Version.auto().isAutoOrLatest()).toBe(true);
    });

    it('isAuto returns true', () => {
        expect(Version.auto().isAuto()).toBe(true);
    });
});

describe('Version compare', () => {
    it('when zero', () => {
        expect(new Version(0, 0, 0).compare(new Version(0, 0, 0))).toBe(0);
    });

    it('when smaller major', () => {
        expect(new Version(0, 0, 0).compare(new Version(1, 0, 0))).toBe(-1);
    });

    it('when smaller minor', () => {
        expect(new Version(0, 0, 0).compare(new Version(0, 1, 0))).toBe(-1);
    });

    it('when smaller patch', () => {
        expect(new Version(0, 0, 0).compare(new Version(0, 0, 1))).toBe(-1);
    });

    it('when smaller all', () => {
        expect(new Version(0, 0, 0).compare(new Version(1, 1, 1))).toBe(-1);
    });

    it('when higher major', () => {
        expect(new Version(1, 0, 0).compare(new Version(0, 0, 0))).toBe(1);
    });

    it('when higher minor', () => {
        expect(new Version(0, 1, 0).compare(new Version(0, 0, 0))).toBe(1);
    });

    it('when higher patch', () => {
        expect(new Version(0, 0, 1).compare(new Version(0, 0, 0))).toBe(1);
    });

    it('when higher all', () => {
        expect(new Version(0, 0, 1).compare(new Version(0, 0, 0))).toBe(1);
    });

    it('auto is smaller than latest', () => {
        expect(Version.auto().compare(Version.latest())).toBe(-1);
    });

    it('latest is smaller than zero version', () => {
        expect(Version.latest().compare(new Version(0, 0, 0))).toBe(-1);
    });
});

describe('Version toString', () => {
    it('when latest', () => {
        expect(Version.latest().toString()).toEqual('latest');
    });

    it('when auto', () => {
        expect(Version.auto().toString()).toEqual('auto');
    });

    it('when zero version', () => {
        expect(new Version(0, 0, 0).toString()).toEqual('0.0.0');
    });

    it('when regular version', () => {
        expect(new Version(3, 20, 0).toString()).toEqual('3.20.0');
    });
});

describe('Version withPrefix', () => {
    it('when latest', () => {
        expect(Version.latest().withPrefix()).toEqual('latest');
    });

    it('when auto', () => {
        expect(Version.auto().withPrefix()).toEqual('auto');
    });

    it('when zero version', () => {
        expect(new Version(0, 0, 0).withPrefix()).toEqual('v0.0.0');
    });

    it('when regular version', () => {
        expect(new Version(3, 20, 0).withPrefix()).toEqual('v3.20.0');
    });
});

describe('ResolvedVersion constructor', () => {
    it('when latest then throws', () => {
        expect(() => new ResolvedVersion(Version.latest().major, 0, 0)).toThrow();
    });

    it('when auto then throws', () => {
        expect(() => new ResolvedVersion(Version.auto().major, 0, 0)).toThrow();
    });

    it('when all zero', () => {
        expect(new ResolvedVersion(0, 0, 0)).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('when regular', () => {
        expect(new ResolvedVersion(2, 42, 1)).toEqual({ major: 2, minor: 42, patch: 1 });
    });
});

describe('ResolvedVersion from a valgrind tag', () => {
    it('calls super function', () => {
        const spy = jest.spyOn(Version, 'fromValgrindTag');

        const version = ResolvedVersion.fromValgrindTag('VALGRIND_3_9_0');

        expect(spy).toHaveBeenCalledWith('VALGRIND_3_9_0');
        expect(version).toEqual({ major: 3, minor: 9, patch: 0 });
        spy.mockRestore();
    });
});

describe('ResolvedVersion from a string', () => {
    it('calls super function', () => {
        const spy = jest.spyOn(Version, 'fromString');

        const version = ResolvedVersion.fromString('10.20.30');

        expect(spy).toHaveBeenCalledWith('10.20.30');
        expect(version).toEqual({ major: 10, minor: 20, patch: 30 });
        spy.mockRestore();
    });

    it('when latest then throws', () => {
        const spy = jest.spyOn(Version, 'fromString');

        expect(() => ResolvedVersion.fromString('latest')).toThrow(
            "A resolved version cannot be 'latest' or 'auto'"
        );
        expect(spy).toHaveBeenCalledWith('latest');
        spy.mockRestore();
    });

    it('when auto then throws', () => {
        const spy = jest.spyOn(Version, 'fromString');

        expect(() => ResolvedVersion.fromString('auto')).toThrow(
            "A resolved version cannot be 'latest' or 'auto'"
        );
        expect(spy).toHaveBeenCalledWith('auto');
        spy.mockRestore();
    });
});

describe('ResolvedVersion function overrides', () => {
    it('when fromVersion', () => {
        expect(ResolvedVersion.fromVersion(new Version(1, 2, 3))).toEqual({
            major: 1,
            minor: 2,
            patch: 3
        });
    });

    it('when fromVersion and Version is latest then throws', () => {
        expect(() => ResolvedVersion.fromVersion(Version.latest())).toThrow();
    });

    it('when fromVersion and Version is auto then throws', () => {
        expect(() => ResolvedVersion.fromVersion(Version.auto())).toThrow();
    });

    it('when trying to create latest then throws', () => {
        expect(() => ResolvedVersion.latest()).toThrow();
    });

    it('when trying to create auto then throws', () => {
        expect(() => ResolvedVersion.auto()).toThrow();
    });

    it('isLatest returns false', () => {
        expect(new ResolvedVersion(1, 2, 3).isLatest()).toBe(false);
    });

    it('isAuto returns false', () => {
        expect(new ResolvedVersion(1, 2, 3).isAuto()).toBe(false);
    });

    it('isAutoOrLatest returns false', () => {
        expect(new ResolvedVersion(1, 2, 3).isAutoOrLatest()).toBe(false);
    });

    it('toString when zero', () => {
        expect(new ResolvedVersion(0, 0, 0).toString()).toEqual('0.0.0');
    });

    it('toString when regular', () => {
        expect(new ResolvedVersion(1, 2, 3).toString()).toEqual('1.2.3');
    });

    it('withPrefix when zero', () => {
        expect(new ResolvedVersion(0, 0, 0).withPrefix()).toEqual('v0.0.0');
    });

    it('withPrefix when regular', () => {
        expect(new ResolvedVersion(1, 2, 3).withPrefix()).toEqual('v1.2.3');
    });
});
