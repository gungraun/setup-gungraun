# gungraun/action

GitHub Action to install `gungraun-runner` and `valgrind` on Linux runners.

## Usage

```yaml
- name: Setup gungraun-runner and valgrind
  uses: gungraun/action@v1
```

### Install a specific version

```yaml
- name: Setup gungraun-runner v0.1.0 and valgrind
  uses: gungraun/action@v1
  with:
      runner-version: v0.1.0
```

### Use the latest release

```yaml
- name: Setup gungraun-runner (latest) and valgrind
  uses: gungraun/action@v1
  with:
      runner-version: latest
```

### Specify a target triple

```yaml
- name: Setup gungraun-runner (musl target)
  uses: gungraun/action@v1
  with:
      target: x86_64-unknown-linux-musl
```

### With GitHub token (avoids rate limits)

```yaml
- name: Setup gungraun-runner and valgrind
  uses: gungraun/action@v1
  with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input              | Description                                                                                                                              | Default  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `runner-version`   | Version of gungraun-runner to install. `auto` detects from Cargo.toml, `latest` uses the newest GitHub release, or specify e.g. `v0.1.0` | `auto`   |
| `target`           | Rust target triple (e.g. `x86_64-unknown-linux-gnu`). Auto-detected from `rustc -vV` if omitted.                                         | `""`     |
| `valgrind-version` | Valgrind release tag (e.g. `v0.1.1`). `latest` uses the newest release from `gungraun/valgrind-builder`.                                 | `latest` |
| `github-token`     | GitHub token for API requests (avoids rate limits)                                                                                       | `""`     |

## How it works

1. Installs **valgrind** by trying in order:
    - GitHub Release download from `gungraun/valgrind-builder` (matched by
      arch + platform, verified with SHA-256)
    - System package manager fallback
2. Resolves the runner version (`auto` reads from `Cargo.toml`, `latest` queries
   GitHub, or use an explicit version)
3. Determines the Rust target triple (from the `target` input, or via
   `rustc -vV`)
4. Installs **gungraun-runner** by trying in order:
    - `cargo binstall` (fast, prebuilt binary)
    - GitHub Release download (with SHA-256 verification)
    - `cargo install` (compiles from source)

## Requirements

- Linux runner (Ubuntu, etc.)
- Node.js 20+ (used by the action runtime)
- `cargo` (required when `runner-version` is `auto`)
- `rustc` (required if `target` input is not provided)

> **Note:** When installing from a GitHub release, `gungraun-runner` is placed
> in `$CARGO_HOME/bin` (defaults to `$HOME/.cargo/bin`). This directory must be
> on `PATH` for subsequent workflow steps to find it. On GitHub-hosted runners
> with Rust pre-installed, this is already the case. Otherwise, add:
>
> ```yaml
> - run: echo "$HOME/.cargo/bin" >> $GITHUB_PATH
> ```

## Development

### Build

```bash
npm run build
```

### Type check

```bash
npm run check
```

### Test locally with Docker

```bash
podman compose build
podman compose run test bash
# Inside the container:
cd /action && node dist/index.js
```
