# gungraun/action

GitHub Action to install `Valgrind` and `gungraun-runner` to keep
`gungraun-runner` in sync with the repository [`gungraun`] version.

## Requirements

A Linux runner (Ubuntu, AlmaLinux, Alpine, Arch, Fedora, etc.). Check the
workflows of this actions to see on which Linux distributions the action is
tested. However, it might work well on other distributions.

If you are using this inside a container, `git`, `tar`, `gzip` needs to be
included and accessible from the execution path.

## Usage

```yaml
- name: Setup gungraun-runner and Valgrind
  uses: gungraun/action@v1
  with:
      # Version of gungraun-runner. 'auto' detects the version from Cargo
      # metadata and installs the same version as the gungraun library. 'latest'
      # always fetches the newest available version. You can also specify an
      # explicit version in semver format x.y.z like 0.18.0.
      #
      # Default: auto
      runner-version: ''

      # Ordered comma-separated chain of gungraun-runner install strategies to
      # try. Valid values: 'binstall', 'release', 'source', 'none'.
      #
      # The 'binstall' strategy tries to install gungraun-runner with binstall
      # if it is available. 'release' tries to install the runner from the
      # gungraun release. 'source' compiles it with `cargo install` which can be
      # slow. 'none' skips the runner installation entirely.
      #
      # Default: binstall,release,source
      runner-strategy: ''

      # Override the Rust target triple (e.g. x86_64-unknown-linux-gnu).
      # Auto-detected if omitted.
      #
      # Default: '' (auto-detect)
      runner-target: ''

      # The Valgrind version to install. Valid values: 'auto', 'latest' or a
      # concrete version in semver format x.y.z >= 3.16.0.
      #
      # 'latest' tries to fetch the newest Valgrind release for each
      # 'valgrind-strategy'. For example, the Valgrind strategy 'system' fails
      # if the Linux distribution doesn't offer the latest possible Valgrind
      # version, which is usually the case for GitHub CI Ubuntu runners. In
      # contrast, 'auto' also tries to install the latest version but for the
      # 'system' strategy installs the latest available Valgrind package.
      #
      # Default: auto
      valgrind-version: ''

      # Ordered comma-separated chain of install strategies to try.
      # Valid values: builder, source, system, none.
      #
      # 'builder' tries to install the 'valgrind-version' from prebuilt
      # Valgrind tarballs from 'gungraun/valgrind-builder'. If a 'valgrind-url'
      # is provided, the 'builder' strategy uses the Valgrind tarball from this
      # url instead. 'source' tries to build and install Valgrind from source.
      # 'system' uses the system package manager to install Valgrind. 'none'
      # skips Valgrind installation entirely. If valgrind is already installed
      # and available in the PATH, installation is skipped regardless of the
      # strategy.
      #
      # Default: builder,source,system
      valgrind-strategy: ''

      # URL to a (compressed) Valgrind tar archive. When set, the 'builder'
      # strategy downloads this URL instead of resolving from
      # 'gungraun/valgrind-builder'.
      #
      # Default: '' (resolve from 'gungraun/valgrind-builder')
      valgrind-url: ''

      # URL to the SHA checksum file to verify the 'valgrind-url' tarball. The
      # SHA variant is auto-detected.
      #
      # Default: ''
      valgrind-sha-url: ''

      # Extra/Override arguments passed to ./configure when building Valgrind
      # from source with the 'valgrind-strategy': 'source'. Parsed like shell
      # arguments but in a single string.
      #
      # Example: '--prefix=/usr/local --enable-lto'
      #
      # Default: ''
      valgrind-configure-args: ''

      # Environment variables set during `./configure` and `make` when building
      # Valgrind from source (e.g. "CFLAGS=-fno-stack-protector").
      # Parsed as KEY=VALUE pairs.
      #
      # Default: ''
      valgrind-make-envs: ''

      # When true and the 'source' 'valgrind-strategy' is used, install
      # platform-specific build dependencies (gcc, make, etc.) before compiling.
      #
      # Default: false
      install-build-deps: ''

      # Personal access token (PAT) for API requests. Used for GitHub release
      # downloads when using the 'release' runner-strategy or the 'builder'
      # 'valgrind-strategy'.
      #
      # [See also creating encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
      #
      # Default: '${{ github.token }}'
      github-token: ''
```

## Strategies

### Valgrind strategies

| Strategy  | Description                                                                                                                                                                                                                                                                                                                     | Prerequisites                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builder` | Downloads a pre-built binary from `gungraun/valgrind-builder`, matched by arch + platform. The downloaded tarball is verified with sha. The contents of this tarball are directly copied to `/`.                                                                                                                                | root/sudo                                                                                                                                                                                                   |
| `source`  | Compiles Valgrind from the [original][current-valgrind-release] tarball (`.tar.bz2`). The downloaded tarball is verified with sha. Runs `./configure` → `make` → `make install` (the latter requires root/sudo). On Alpine, automatically adds `CFLAGS="-fno-stack-protector -no-pie -U_FORTIFY_SOURCE"` and `--without-mpicc`. | build dependencies: At a minimum `gcc`, `make`, `bzip2`. build dependencies are automatically installed when `install-build-deps` is set to `true`; root/sudo; on Alpine: GNU `sed`, busybox sed won't work |
| `system`  | Installs via the system package manager (apt-get, apk, dnf, yum, microdnf, pacman, zypper)                                                                                                                                                                                                                                      | root/sudo; system package manager must offer Valgrind                                                                                                                                                       |
| `none`    | Skips valgrind installation.                                                                                                                                                                                                                                                                                                    | None                                                                                                                                                                                                        |

All strategies try to install the `libc` debug symbols with the package manager
if possible. They are required by Valgrind and for example the `memcheck` tool.
On Arch Linux the debug symbols are not available and it uses `debuginfod`. This
action sets the environment variable
`DEBUGINFOD_URLS=https://debuginfod.archlinux.org`

### Runner strategies

| Strategy   | Description                                                           | Prerequisites                     |
| ---------- | --------------------------------------------------------------------- | --------------------------------- |
| `binstall` | Installs via `cargo binstall` for fast prebuilt binary download.      | `cargo`, `cargo-binstall` on PATH |
| `release`  | Downloads from `gungraun/gungraun` GitHub releases. Verified with sha | `cargo`                           |
| `source`   | Compiles via `cargo install gungraun-runner`                          | Rust toolchain                    |
| `none`     | Skips runner installation.                                            | None                              |

## Examples

### Basic usage

```yaml
- name: Setup gungraun-runner and Valgrind
  uses: gungraun/action@v1
```

### Install a specific runner version

```yaml
- name: Setup gungraun-runner 0.1.0 and Valgrind
  uses: gungraun/action@v1
  with:
      runner-version: 0.1.0
```

### Skip Valgrind installation

If you want to build/install Valgrind yourself, skip the Valgrind installation
with:

```yaml
- name: Setup gungraun-runner only
  uses: gungraun/action@v1
  with:
      valgrind-strategy: none
```

### Build Valgrind from source without trying other strategies

```yaml
- name: Setup gungraun-runner and Valgrind (from source)
  uses: gungraun/action@v1
  with:
      valgrind-strategy: source
      install-build-deps: true
```

### Custom Valgrind build

If you have a fork of the [gungraun/valgrind-builder][valgrind-builder]
repository or have another custom Valgrind build ready, then you can point the
`valgrind-url` to the release tarball. This should be a link to a tar archive
which contains a ready-to-use build of Valgrind.

```yaml
- name: Setup gungraun-runner and Valgrind (custom binary)
  uses: gungraun/action@v1
  with:
      valgrind-url: https://github.com/custom/valgrind-builder/valgrind-3.23.0-x86_64-linux.tar.gz
      valgrind-sha-url: https://github.com/custom/valgrind-builder/valgrind-3.23.0-x86_64-linux.tar.gz.sha256
```

### Skip runner installation

This will only install Valgrind with this action

```yaml
- name: Setup Valgrind only
  uses: gungraun/action@v1
  with:
      runner-strategy: none
```

[valgrind-builder]: https://github.com/gungraun/valgrind-builder
[`gungraun`]: https://github.com/gungraun/gungraun
[current-valgrind-release]: https://valgrind.org/downloads/current.html#current

## License

The scripts and documentation in this project are released under the
[MIT License](LICENSE)
