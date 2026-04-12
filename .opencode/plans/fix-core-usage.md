# Fix inconsistent core.info/core.error usages — use utils wrappers

## Changes

### `src/install.ts`

1. Remove `import * as core from "@actions/core";` (line 1)
2. Add `printInfo, printError` to the `./utils` import (line 14):
   ```
   import { getCargoBin, logInstalledVersion, bail, printInfo, printError, withGroup } from "./utils";
   ```
3. Line 89: `core.error(...)` → `printError(...)`
4. Line 102: `core.info(...)` → `printInfo(...)`
5. Line 159: `core.info(...)` → `printInfo(...)`
6. Line 165: `core.info(...)` → `printInfo(...)`
7. Line 183: `core.info(...)` → `printInfo(...)`
8. Line 199: `core.info(...)` → `printInfo(...)`
9. Line 203: `core.info(...)` → `printInfo(...)`
10. Line 211: `core.info(...)` → `printInfo(...)`

### `src/main.ts`

1. Add `printInfo` to the `./utils` import (line 16):
   ```
   import { getCargoBin, bail, printInfo } from "./utils";
   ```
2. Line 54: `core.info(...)` → `printInfo(...)`
3. Leave `core.getInput` (lines 31, 38, 43) and `core.setFailed` (line 63) as-is.

### `src/download.ts`

1. Remove `import * as core from "@actions/core";` (line 1)
2. Add `printInfo` to the `./utils` import (line 6):
   ```
   import { GITHUB_REPO, VALGRIND_REPO, printInfo } from "./utils";
   ```
3. Line 64: `core.info(...)` → `printInfo(...)`

### `src/utils.ts`

No changes needed — wrappers call `core.*` internally, which is correct.