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
import { getCargoBin, bail } from "./utils";

/** Main entry point: validates environment, detects versions, and installs gungraun-runner and valgrind. */
async function run(): Promise<void> {
    if (process.platform !== "linux") {
        bail("This action only supports Linux runners");
    }

    if (!(await io.which(getCargoBin(), false))) {
        bail("cargo is not installed. This action requires Rust/Cargo.");
    }
    if (!(await io.which("rustc", false))) {
        bail("rustc is not installed. This action requires Rust/Cargo.");
    }

    let runnerVersion = core.getInput("runner-version") || "auto";
    if (runnerVersion === "auto") {
        const detected = await detectProjectVersion();
        runnerVersion = `v${detected}`;
    }

    const valgrindStrategies = parseStrategies<ValgrindStrategy>(
        core.getInput("valgrind-strategy") || DEFAULT_VALGRIND_STRATEGY,
        VALID_VALGRIND_STRATEGIES,
        "valgrind",
    );
    const runnerStrategies = parseStrategies<RunnerStrategy>(
        core.getInput("runner-strategy") || DEFAULT_RUNNER_STRATEGY,
        VALID_RUNNER_STRATEGIES,
        "runner",
    );

    const valgrindPath = await io.which("valgrind", false);
    if (valgrindPath) {
        const { stdout } = await exec.getExecOutput("valgrind", ["--version"], {
            silent: true,
            ignoreReturnCode: true,
        });
        core.info(`Valgrind already installed: ${stdout.trim()} (${valgrindPath})`);
    } else {
        await installValgrind(valgrindStrategies);
    }

    await installRunner(runnerVersion, runnerStrategies);
}

run().catch((error) => {
    core.setFailed(`Action failed: ${(error as Error).message}`);
});
