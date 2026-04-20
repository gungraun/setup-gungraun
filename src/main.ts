import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import { installRunner, installValgrind } from './install';
import { getCargoBin, bail, printInfo, isDebug } from './utils';
import { Inputs, parseInputs } from './inputs';
import { detectPlatform } from './detect';

/** Main entry point: validates environment, detects versions, and installs gungraun-runner and valgrind. */
async function run(): Promise<void> {
    if (process.platform !== 'linux') {
        bail('This action currently only supports Linux runners');
    }

    let inputs: Inputs;
    try {
        inputs = await parseInputs();
    } catch (error) {
        bail(`Error parsing inputs: ${(error as Error).message}`);
    }

    if (!inputs.runnerStrategies.includes('none') && !(await io.which(getCargoBin(), false))) {
        bail(
            'cargo is not installed. This action requires Rust/Cargo to be able to install gungraun-runner.'
        );
    }

    const {
        githubToken,
        installBuildDeps,
        runnerStrategies,
        runnerVersion,
        runnerTarget,
        valgrindConfigureArgs,
        valgrindMakeEnvs,
        valgrindStrategies,
        valgrindUrl,
        valgrindShaUrl,
        valgrindVersion
    } = inputs;

    const valgrindPath = await io.which('valgrind', false);
    if (valgrindPath) {
        try {
            const { stdout } = await exec.getExecOutput('valgrind', ['--version'], {
                silent: !isDebug(),
                ignoreReturnCode: true
            });
            printInfo(`Valgrind already installed: ${stdout.trim()} (${valgrindPath})`);
        } catch {
            printInfo(`Valgrind already installed (${valgrindPath})`);
        }
    } else {
        try {
            await installValgrind(
                valgrindVersion,
                valgrindStrategies,
                installBuildDeps,
                githubToken,
                valgrindUrl,
                valgrindShaUrl,
                valgrindConfigureArgs,
                valgrindMakeEnvs
            );

            const { id, relatedIds } = await detectPlatform();
            if (relatedIds.length === 0 ? id === 'arch' : relatedIds.includes('arch')) {
                core.exportVariable('DEBUGINFOD_URLS', 'https://debuginfod.archlinux.org');
            }
        } catch (error) {
            bail(`Error installing Valgrind: ${(error as Error).message}`);
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
