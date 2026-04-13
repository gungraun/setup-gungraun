import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { detectProjectVersion } from "./detect";
import {
    DEFAULT_RUNNER_STRATEGY,
    DEFAULT_VALGRIND_STRATEGY,
    installRunner,
    installValgrind,
    parseStrategies,
    RunnerStrategy,
    ValgrindStrategy,
    VALID_RUNNER_STRATEGIES,
    VALID_VALGRIND_STRATEGIES,
} from "./install";
import { getCargoBin, bail, printInfo } from "./utils";
import { Version } from "./version";

/** Main entry point: validates environment, detects versions, and installs gungraun-runner and valgrind. */
async function run(): Promise<void> {
    if (process.platform !== "linux") {
        bail("This action only supports Linux runners");
    }

    if (!(await io.which(getCargoBin(), false))) {
        bail("cargo is not installed. This action requires Rust/Cargo.");
    }

    // TODO: use an Inputs class or interface with all inputs
    let runnerVersionInput = core.getInput("runner-version") || "auto";
    let runnerVersion: Version;
    if (runnerVersionInput === "auto") {
        try {
            runnerVersion = await detectProjectVersion();
        } catch (error) {
            bail(`Unable to detect gungraun-runner version: ${(error as Error).message}`);
        }
    } else {
        try {
            runnerVersion = Version.from_tag(runnerVersionInput);
        } catch (error) {
            bail(`Invalid runner-version: ${(error as Error).message}`);
        }
    }

    let runnerStrategies;
    try {
        runnerStrategies = parseStrategies<RunnerStrategy>(
            core.getInput("runner-strategy") || DEFAULT_RUNNER_STRATEGY,
            VALID_RUNNER_STRATEGIES,
            "runner",
        );
    } catch (error) {
        bail(`Invalid runner-strategy: ${(error as Error).message}`);
    }

    let valgrindStrategies;
    try {
        valgrindStrategies = parseStrategies<ValgrindStrategy>(
            core.getInput("valgrind-strategy") || DEFAULT_VALGRIND_STRATEGY,
            VALID_VALGRIND_STRATEGIES,
            "valgrind",
        );
    } catch (error) {
        bail(`Invalid valgrind-strategy: ${(error as Error).message}`);
    }

    const installBuildDeps = core.getBooleanInput("install-build-deps") || false;

    const valgrindVersionInput = core.getInput("valgrind-version") || "latest";
    let valgrindVersion: Version;
    try {
        valgrindVersion = Version.from_tag(valgrindVersionInput);
    } catch (error) {
        bail(`Invalid valgrind-version: ${(error as Error).message}`);
    }

    const valgrindPath = await io.which("valgrind", false);
    if (valgrindPath) {
        try {
            const { stdout } = await exec.getExecOutput("valgrind", ["--version"], {
                silent: true,
                ignoreReturnCode: true,
            });
            printInfo(`Valgrind already installed: ${stdout.trim()} (${valgrindPath})`);
        } catch (error) {
            printInfo(`Valgrind already installed (${valgrindPath})`);
        }
    } else {
        try {
            await installValgrind(valgrindVersion, valgrindStrategies, installBuildDeps);
        } catch (error) {
            bail(`Error installing valgrind: ${(error as Error).message}`);
        }
    }

    try {
        await installRunner(runnerVersion, runnerStrategies);
    } catch (error) {
        bail(`Error installing gungraun-runner: ${(error as Error).message}`);
    }
}

run().catch((error) => {
    core.setFailed(`Action failed: ${(error as Error).message}`);
});
