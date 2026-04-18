import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as utils from "../src/utils";
import * as fs from "fs";

import { afterEach } from "node:test";

jest.mock("@actions/core");
jest.mock("@actions/exec");

jest.mock("fs", () => {
    const realFs = jest.requireActual("fs");
    return {
        ...realFs,
        readdirSync: jest.fn(realFs.readdirSync),
        promises: realFs.promises,
    };
});

afterEach(() => jest.restoreAllMocks());

describe("bail", () => {
    it("when called the action is set to failed and process exits with 1 and the message", () => {
        const exitSpy = jest.spyOn(process, "exit").mockImplementation((code) => {
            throw new Error(`process.exit: ${code}`); // stop execution and make the call observable
        }) as jest.SpyInstance;

        expect(() => utils.bail("message")).toThrow("process.exit: 1");

        expect(core.setFailed).toHaveBeenCalledWith("message");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe("escapeRegex", () => {
    it("with all special chars", () => {
        expect(utils.escapeRegex(".*+?^${}()|[\]\\]")).toEqual(
            "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\\\]",
        );
    });

    it("returns plain strings unchanged", () => {
        expect(utils.escapeRegex("hello")).toBe("hello");
        expect(utils.escapeRegex("ubuntu2204")).toBe("ubuntu2204");
    });
});

describe("execSudoWithOutput", () => {
    it("calls exec.getExecOutput with sudo and returns stdout", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: "output",
        });

        const result = await utils.execSudoWithOutput("cmd", "arg1", "arg2");

        expect(exec.getExecOutput).toHaveBeenCalledWith("sudo", ["cmd", "arg1", "arg2"], {
            silent: true,
        });
        expect(result).toBe("output");
    });
});

describe("execSudo", () => {
    it("calls exec.exec with sudo", async () => {
        (exec.exec as jest.Mock).mockResolvedValue(0);

        await utils.execSudo("cmd", "arg1", "arg2");

        expect(exec.exec).toHaveBeenCalledWith("sudo", ["cmd", "arg1", "arg2"], {
            silent: true,
        });
    });
});

describe("findBinary", () => {
    it("returns joined path when entry matches and has parentPath", async () => {
        const fakeDirents = [
            { name: "other.txt", isFile: () => true, parentPath: "/root/a" },
            { name: "target.txt", isFile: () => true, parentPath: "/root/b" },
        ];

        jest.spyOn(fs, "readdirSync").mockReturnValue(fakeDirents as any);

        await expect(utils.findBinary("/root", "target.txt")).resolves.toBe("/root/b/target.txt");
        expect(fs.readdirSync).toHaveBeenCalledWith("/root", {
            withFileTypes: true,
            recursive: true,
        });
    });

    it("returns null when not found", async () => {
        const fakeDirents = [{ name: "x", isFile: () => false }];
        jest.spyOn(fs, "readdirSync").mockReturnValue(fakeDirents as any);

        await expect(utils.findBinary("/root", "missing.txt")).resolves.toBeNull();
    });
});

describe("getCargoBin", () => {
    it("uses CARGO when set", () => {
        jest.replaceProperty(process, "env", { ...process.env, CARGO: "/custom/cargo" });
        expect(utils.getCargoBin()).toBe("/custom/cargo");
        jest.restoreAllMocks();
    });

    it("falls back when not set", () => {
        jest.replaceProperty(process, "env", { ...process.env }); // no CARGO
        expect(utils.getCargoBin()).toBe("cargo");
        jest.restoreAllMocks();
    });
});

describe("logInstalledVersion", () => {
    it("logs version output with label", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: "binary 1.2.3\n",
        });
        await utils.logInstalledVersion("binary", "label");

        expect(exec.getExecOutput).toHaveBeenCalledWith("binary", ["--version"], {
            silent: true,
            ignoreReturnCode: true,
        });
        expect(core.info).toHaveBeenCalledWith("label installed: binary 1.2.3");
    });

    it("uses fallback when stdout is empty", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: "" });

        await utils.logInstalledVersion("binary", "label", "fallback");

        expect(core.info).toHaveBeenCalledWith("label installed: fallback");
    });

    it("uses fallback when stdout contains only whitespace", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: "   \n" });

        await utils.logInstalledVersion("binary", "label", "fallback");

        expect(core.info).toHaveBeenCalledWith("label installed: fallback");
    });

    it("defaults to 'version unknown' when stdout and fallback are empty", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: "" });

        await utils.logInstalledVersion("binary", "label");

        expect(core.info).toHaveBeenCalledWith("label installed: version unknown");
    });
});

describe("normalizePath", () => {
    it("when path starts with ./ then strips the prefix", () => {
        expect(utils.normalizePath("./foo/bar")).toBe("foo/bar");
    });

    it("when path has no ./ prefix then returns unchanged", () => {
        expect(utils.normalizePath("foo/bar")).toBe("foo/bar");
    });

    it("when path has leading/trailing whitespace then trims before stripping ./", () => {
        expect(utils.normalizePath("  ./foo  ")).toBe("foo");
    });

    it("when path is just ./ then returns just .", () => {
        expect(utils.normalizePath("./")).toBe(".");
    });

    it("when ./ appears in the middle then does not strip it", () => {
        expect(utils.normalizePath("foo/./bar")).toBe("foo/./bar");
    });
});

describe("printError", () => {
    it("delegates to core.error", () => {
        utils.printError("some error");
        expect(core.error).toHaveBeenCalledWith("some error");
    });
});

describe("printInfo", () => {
    it("delegates to core.info", () => {
        utils.printInfo("some info");
        expect(core.info).toHaveBeenCalledWith("some info");
    });
});

describe("printWarning", () => {
    it("delegates to core.warning", () => {
        utils.printWarning("some warning");
        expect(core.warning).toHaveBeenCalledWith("some warning");
    });
});

describe("splitOnce", () => {
    it("when separator is found then splits at first occurrence", () => {
        expect(utils.splitOnce("a:b", ":")).toEqual(["a", "b"]);
    });

    it("when separator is not found then returns [str, '']", () => {
        expect(utils.splitOnce("abc", ":")).toEqual(["abc", ""]);
    });

    it("when separator appears multiple times then splits at first only", () => {
        expect(utils.splitOnce("a-b-c", "-")).toEqual(["a", "b-c"]);
    });

    it("when separator is at the start then returns ['', rest]", () => {
        expect(utils.splitOnce("::b", "::")).toEqual(["", "b"]);
    });

    it("when separator is at the end then returns [before, '']", () => {
        expect(utils.splitOnce("a::", "::")).toEqual(["a", ""]);
    });

    it("when string is empty then returns ['', '']", () => {
        expect(utils.splitOnce("", "::")).toEqual(["", ""]);
    });

    it("when separator is multi-character then works correctly", () => {
        expect(utils.splitOnce("a==b==c", "==")).toEqual(["a", "b==c"]);
    });

    it("when separator is empty then returns ['', 'str']", () => {
        expect(utils.splitOnce("a==b==c", "")).toEqual(["", "a==b==c"]);
    });
});

describe("withGroup", () => {
    it("calls startGroup and endGroup around the function", async () => {
        const mockFn = jest.fn().mockResolvedValue("result");
        const result = await utils.withGroup("my-group", mockFn);

        expect(result).toBe("result");
        expect(core.startGroup).toHaveBeenCalledWith("my-group");
        expect(core.endGroup).toHaveBeenCalled();
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("calls endGroup even if the function throws", async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error("boom"));

        await expect(utils.withGroup("err-group", mockFn)).rejects.toThrow("boom");
        expect(core.startGroup).toHaveBeenCalledWith("err-group");
        expect(core.endGroup).toHaveBeenCalled();
    });
});
