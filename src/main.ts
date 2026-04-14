import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import { installRunner, installValgrind } from "./install";
import { getCargoBin, bail, printInfo } from "./utils";
import { Inputs, parseInputs } from "./inputs";

/** Main entry point: validates environment, detects versions, and installs gungraun-runner and valgrind. */
async function run(): Promise<void> {
    if (process.platform !== "linux") {
        bail("This action only supports Linux runners");
    }

    if (!(await io.which(getCargoBin(), false))) {
        bail("cargo is not installed. This action requires Rust/Cargo.");
    }

    let inputs: Inputs;
    try {
        inputs = await parseInputs();
    } catch (error) {
        bail(`Error parsing inputs: ${(error as Error).message}`);
    }

    const {
        githubToken,
        installBuildDeps,
        runnerStrategies,
        runnerVersion,
        runnerTarget,
        valgrindStrategies,
        valgrindVersion,
    } = inputs;

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
            await installValgrind(
                valgrindVersion,
                valgrindStrategies,
                installBuildDeps,
                githubToken,
            );
        } catch (error) {
            bail(`Error installing valgrind: ${(error as Error).message}`);
        }
    }

    try {
        await installRunner(runnerVersion, runnerStrategies, githubToken, runnerTarget);
    } catch (error) {
        bail(`Error installing gungraun-runner: ${(error as Error).message}`);
    }
}

run().catch((error) => {
    core.setFailed(`Action failed: ${(error as Error).message}`);
});
