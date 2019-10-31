/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import { promisify } from "util";

import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { CLILifecycleWrapper } from "./local/CLILifecycleWrapper";
import { CLILifecycleCommand } from "./local/CLILifecycleCommands";
import { CLICommand } from "./CLICommands";

const BIN_DIR = "bin";
const CLI_EXECUTABLE = "cwctl";
const CLI_EXECUTABLE_WIN = "cwctl.exe";
const CLI_PREREQS: { [s: string]: string[]; } = {
    [CLI_EXECUTABLE]: ["appsody"],
    [CLI_EXECUTABLE_WIN]: ["appsody.exe"]
};

namespace CLIWrapper {

    // check error against this to see if it's a real error or just a user cancellation
    export const CLI_CMD_CANCELLED = "Cancelled";

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see initialize()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? CLI_EXECUTABLE_WIN : CLI_EXECUTABLE;
        return path.join(global.__extRoot, BIN_DIR, platform, executable);
    }

    // abs path to copied-out executable. Set and returned by initialize()
    let _executablePath: string;

    /**
     * Copies the CLI to somewhere writeable if not already done, and sets exectablePath.
     * @returns The path to the CLI executable after moving it to a writeable directory.
     */
    export async function initialize(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        const executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableDirname = path.dirname(executable);
        const executableBasename = path.basename(executable);
        _executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${_executablePath}`);
        await promisify(fs.copyFile)(executable, path.join(executableDir, executableBasename));
        Log.d("Copying CLI prerequisites");
        for (const prereq of CLI_PREREQS[executableBasename]) {
            const source = path.join(executableDirname, prereq);
            const target = path.join(executableDir, prereq);
            Log.d(`Copying ${source} to ${target}`);
            await promisify(fs.copyFile)(source, target);
        }
        Log.i("CLI copy-out succeeded, to " + _executablePath);
        return _executablePath;
    }

    export async function getExecutablePath(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        return initialize();
    }

    export async function cliExec(cmd: CLICommand, args: string[] = [], progressPrefix?: string): Promise<any> {
        const executablePath = await initialize();

        args = cmd.command.concat(args);
        if (!(cmd instanceof CLILifecycleCommand)) {
            args.unshift("--insecure");
        }
        args.unshift("--json");

        // cmdStr will be the full command, eg `cwctl --insecure project create <path> --url <url>`
        // is generally only used for debugging
        const cmdStr = [path.basename(executablePath), ...args].join(" ");
        Log.i(`Running CLI command: ${cmdStr}`);

        const executableDir = path.dirname(executablePath);

        return vscode.window.withProgress({
            cancellable: cmd.cancellable,
            location: vscode.ProgressLocation.Notification,
            title: progressPrefix,
        }, (progress, token) => {
            return new Promise<any>((resolve, reject) => {
                const child = child_process.spawn(executablePath, args, {
                    cwd: executableDir
                });

                // only lifecycle commands show updating progress, for now
                if (cmd instanceof CLILifecycleCommand) {
                    CLILifecycleWrapper.updateProgress(cmd, child.stdout, progress);
                }

                child.on("error", (err) => {
                    return reject(err);
                });

                let outStr = "";
                let errStr = "";
                child.stdout.on("data", (chunk) => { outStr += chunk.toString(); });
                child.stderr.on("data", (chunk) => { errStr += chunk.toString(); });

                token.onCancellationRequested((_e) => {
                    child.kill();
                    return reject(CLI_CMD_CANCELLED);
                });

                child.on("close", (code: number | null) => {
                    if (code == null) {
                        // this happens in SIGTERM case, not sure what else may cause it
                        Log.d(`CLI command ${cmdStr} did not exit normally, likely was cancelled`);
                    }
                    else if (code !== 0) {
                        Log.e(`Error running ${cmdStr}:`, errStr);
                        outStr = outStr || "No output";
                        errStr = errStr || `Output:\n${outStr}`;
                        writeOutError(outStr, errStr);
                        Log.e("Stdout:", outStr);
                        Log.e("Stderr:", errStr);
                        reject(`Error running "${cmdStr}": ${errStr}`);
                    }
                    else {
                        Log.i(`Successfully ran CLI command ${cmdStr}`);
                        if (cmd.hasJSONOutput) {
                            if (!outStr) {
                                Log.e(`Missing expected output from CLI command, output was "${outStr}"`);
                                return resolve({});
                            }
                            Log.d("CLI object output:", outStr);
                            const obj = JSON.parse(outStr);
                            return resolve(obj);
                        }
                        return resolve(outStr);
                    }
                });
            });
        });
    }

    export function isCancellation(err: any): boolean {
        return MCUtil.errToString(err) === CLI_CMD_CANCELLED;
    }

    async function writeOutError(outStr: string, errStr: string): Promise<void> {
        const logDir = path.join(Log.getLogDir, `cli-error-${Date.now()}`);
        await promisify(fs.mkdir)(logDir, { recursive: true });

        const stdoutLog = path.join(logDir, "cli-output.log");
        const stderrLog = path.join(logDir, "cli-error-output.log");
        await promisify(fs.writeFile)(stdoutLog, outStr);
        await promisify(fs.writeFile)(stderrLog, errStr);
        Log.e("Wrote failed command output to " + logDir);
    }
}

export default CLIWrapper;
