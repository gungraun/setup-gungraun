import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { withGroup, logInstalledVersion, printWarning, printInfo } from "../utils";

jest.mock("@actions/core");
jest.mock("@actions/exec");

describe("withGroup", () => {
    it("calls startGroup and endGroup around the function", async () => {
        const mockFn = jest.fn().mockResolvedValue("result");
        const result = await withGroup("my-group", mockFn);

        expect(result).toBe("result");
        expect(core.startGroup).toHaveBeenCalledWith("my-group");
        expect(core.endGroup).toHaveBeenCalled();
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("calls endGroup even if the function throws", async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error("boom"));

        await expect(withGroup("err-group", mockFn)).rejects.toThrow("boom");
        expect(core.startGroup).toHaveBeenCalledWith("err-group");
        expect(core.endGroup).toHaveBeenCalled();
    });

    it("returns the resolved value from the function", async () => {
        const mockFn = jest.fn().mockResolvedValue(42);
        const result = await withGroup("num-group", mockFn);
        expect(result).toBe(42);
    });
});

describe("logInstalledVersion", () => {
    it("logs version output with label", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({
            stdout: "gungraun-runner 1.2.3\n",
        });

        await logInstalledVersion("gungraun-runner", "gungraun-runner");

        expect(exec.getExecOutput).toHaveBeenCalledWith("gungraun-runner", ["--version"], {
            silent: true,
            ignoreReturnCode: true,
        });
        expect(core.info).toHaveBeenCalledWith("gungraun-runner installed: gungraun-runner 1.2.3");
    });

    it("uses fallback when stdout is empty", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: "   \n" });

        await logInstalledVersion("some-binary", "some-binary", "v1.0.0");

        expect(core.info).toHaveBeenCalledWith("some-binary installed: v1.0.0");
    });

    it("defaults to 'version unknown' when stdout and fallback are empty", async () => {
        (exec.getExecOutput as jest.Mock).mockResolvedValue({ stdout: "" });

        await logInstalledVersion("some-binary", "Tool");

        expect(core.info).toHaveBeenCalledWith("Tool installed: version unknown");
    });
});

describe("printWarning", () => {
    it("delegates to core.warning", () => {
        printWarning("watch out");
        expect(core.warning).toHaveBeenCalledWith("watch out");
    });
});

describe("printInfo", () => {
    it("delegates to core.info", () => {
        printInfo("hello");
        expect(core.info).toHaveBeenCalledWith("hello");
    });
});
