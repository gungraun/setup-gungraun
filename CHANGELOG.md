<!--
Added for new features.
Changed for changes in existing functionality.
Deprecated for soon-to-be removed features.
Removed for now removed features.
Fixed for any bug fixes.
Security in case of vulnerabilities.
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to
[Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2025-04-29

### Added

- Retry logic for Octokit requests with configurable retry count for higher
  resilience against network errors.

### Changed

- Package installations no longer run silently
- Improved debugging output: `isDebug()` now also checks `ACTIONS_STEP_DEBUG`
  and `RUNNER_DEBUG` environment variables (not just `GUNGRAUN_ACTION_DEBUG`)
- `DEBUGINFOD_URLS` is now read from `/etc/debuginfod/*.urls` files instead of
  being hardcoded to archlinux's URL
- Updated dependency `typescript-eslint` to v8.59.1

### Fixed

- Addressed security warnings from repo code scanning

## [1.0.1] - 2025-04-21

### Changed

- Upgrade @actions/core to v2, @actions/exec to v2, @actions/github to v8,
  @actions/io to v2, @actions/tool-cache to v3

### Fixed

- Fix a dependency vulnerability undici <=6.23.0 with severity: high by updating
  @actions/github to v8

## [1.0.0] - 2025-04-21

### Added

- Initial release
