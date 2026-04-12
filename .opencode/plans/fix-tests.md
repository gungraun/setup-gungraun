# Fix tests to match source code renames and changes

All 11 test failures fall into 3 categories:

## 1. `printErr` → `bail` rename in mock definitions

Source code renamed `printErr` to `bail` and added a new `printError` export. The test mocks still export the old `printErr`, causing "(0 , utils_1.bail) is not a function" errors.

### `src/__tests__/detect.test.ts` (lines 16-18)

Change:
```js
printErr: jest.fn((msg: string) => {
    throw new Error(msg);
}),
printInfo: jest.fn(),
```
To:
```js
bail: jest.fn((msg: string) => {
    throw new Error(msg);
}),
printError: jest.fn(),
printInfo: jest.fn(),
```

### `src/__tests__/install.test.ts` (lines 49-50)

Change:
```js
printErr: jest.fn((msg: string) => {
    throw new Error(msg);
}),
printWarning: jest.fn(),
```
To:
```js
bail: jest.fn((msg: string) => {
    throw new Error(msg);
}),
printError: jest.fn(),
printWarning: jest.fn(),
```

## 2. `installGrWithBinstall` now adds `--disable-strategies compile`

The source code at `src/install.ts:133` changed the binstall args from `["binstall", "-y"]` to `["binstall", "-y", "--disable-strategies", "compile"]`. Three test assertions need updating:

### `src/__tests__/install.test.ts` line 152-155

Change:
```js
expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
    "binstall",
    "-y",
    "gungraun-runner@1.0.0",
]);
```
To:
```js
expect(mockExec).toHaveBeenCalledWith(getCargoBin(), [
    "binstall",
    "-y",
    "--disable-strategies",
    "compile",
    "gungraun-runner@1.0.0",
]);
```

### `src/__tests__/install.test.ts` line 171

Change:
```js
expect(mockExec).toHaveBeenCalledWith(getCargoBin(), ["binstall", "-y", "gungraun-runner"]);
```
To:
```js
expect(mockExec).toHaveBeenCalledWith(getCargoBin(), ["binstall", "-y", "--disable-strategies", "compile", "gungraun-runner"]);
```

### `src/__tests__/install.test.ts` lines 201-205

Change:
```js
expect(mockExec).toHaveBeenCalledWith("/custom/cargo", [
    "binstall",
    "-y",
    "gungraun-runner@1.0.0",
]);
```
To:
```js
expect(mockExec).toHaveBeenCalledWith("/custom/cargo", [
    "binstall",
    "-y",
    "--disable-strategies",
    "compile",
    "gungraun-runner@1.0.0",
]);
```