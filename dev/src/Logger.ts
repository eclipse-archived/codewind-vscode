/*******************************************************************************
 * Copyright (c) 2018, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { ExtensionContext, Uri } from "vscode";
import * as CircularJson from "circular-json";

import Project from "./codewind/project/Project";

// non-nls-file

// tslint:disable no-console

export class Log {

    private static readonly LOG_NAME: string = "codewind.log";

    private static logDir: string;
    private static logFilePath: string;

    private static disabledLevels: Log.Levels[] = [];

    public static get getLogFilePath(): string {
        return this.logFilePath;
    }

    public static get getLogDir(): string {
        return this.logDir;
    }

    public static setLogFilePath(context: ExtensionContext): void {
        // Directory provided by extension context may not exist
        const logDir = context.logPath;
        const mode = 0o744;

        try {
            fs.ensureDirSync(logDir, mode);
        }
        catch (err) {
            console.error("Error creating logs dir!", err);
            return;
        }

        this.logDir = context.logPath;
        const fullPath = path.join(context.logPath, this.LOG_NAME);
        this.logFilePath = fullPath;
        // console.log("Codewind Tools log file is at " + this.logFilePath);
        this.i("Logger initialized at " + this.logFilePath);
    }

    public static silenceLevels(level: Log.Levels, ...levels: Log.Levels[]): void {
        levels = levels.concat(level);
        Log.i("Disabling log levels:", levels);
        this.disabledLevels = levels;
    }

    public static async d(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.DEBUG, s, args);
    }

    public static async i(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.INFO, s, args);
    }

    public static async w(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.WARNING, s, args);
    }

    public static async e(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.ERROR, s, args);
    }

    public static async t(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.TEST, s, args);
    }

    private static async logInner(level: Log.Levels, s: string, args: any[]): Promise<void> {
        if (this.disabledLevels.includes(level)) {
            return;
        }

        const argsStr: string = args.reduce( (result: string, arg: any): string => {
            if (arg instanceof Object) {
                try {
                    // Can fail eg on objects with circular references
                    // arg = JSON.stringify(arg, undefined, 2);
                    arg = CircularJson.stringify(arg, Log.replacer, 2);
                }
                catch (err) {
                    if (err.message && err.message.includes("circular")) {
                        arg = "*** Couldn't stringify circular object";
                    }
                    else {
                        arg = `*** Failed to log object`;
                    }
                }
            }

            result = result.concat(os.EOL, arg);
            return result;
        }, s);

        let caller = "";
        try {
            caller = " " + this.getCaller();
        }
        catch (err) {
            console.error(err);
        }

        const label: string = `[${level}: ${Log.getFriendlyTime()}${caller}]:`;

        // Send the message to both the 'console' and the logfile.
        const consoleFn = level === this.Levels.ERROR ? console.error : console.log;
        if (args.length > 0) {
            consoleFn(label, s, ...args);
        }
        else {
            consoleFn(label, s);
        }

        if (this.logFilePath) {
            try {
                const msg: string = `${label} ${argsStr}${os.EOL}`;
                await fs.appendFile(this.logFilePath, msg);
            }
            catch (err) {
                console.error("FS error when logging:", err);
            }
        }
    }

    private static getCaller(): string {
        const failureMsg = "";
        // get the stack trace above logInner. casting is necessary because the stack trace package only accepts () => void functions.
        const stack = (new Error()).stack?.split("\n");
        if (stack == null) {
            return failureMsg;
        }
        const thisFunction = stack.findIndex((stackLine) => stackLine.includes("Function.getCaller"));
        if (thisFunction === -1) {
            return failureMsg;
        }

        // 13 is the magic number to get around __awaiters, past the Log.x function, and up to the frame we care about.
        // The frame-line looks like:
        // "at Function.<anonymous> (/Users/tim/programs/codewind-vscode/dev/src/codewind/Requester.ts:38:13)"
        // but if the function is missing, it'll look like:
        // "at /Users/tim/programs/codewind-vscode/dev/src/extension.ts:65:9"
        const frame = stack[thisFunction + 13]?.trim();
        if (frame == null) {
            return failureMsg;
        }

        let functionName = "";
        if (frame.split(" ").length > 2) {
            // extracts "Function.<anonymous>" then "<anonymous>" from the first example above
            functionName = (frame.split(" ")[1])?.split(".")[1];

            if (!functionName || functionName === "<anonymous>") {
                functionName = "";
            }
            else {
                functionName = ` ${functionName}()`
            }
        }

        // from the example above, this extracts "Requester.ts:38"
        const basename = frame.substring(frame.lastIndexOf(path.sep) + 1).trim();
        const [ filename, lineNo ]: string[] = basename.split(":");

        return `${filename}:${lineNo}${functionName}`;
    }

    public static getFriendlyTime(): string {
        const now = new Date();
        // date no longer used
        // Note add 1 to month because months are 0-indexed
        // return `${leftPad(now.getDate())}/${leftPad(now.getMonth() + 1)}/${now.getFullYear()} ` +

        // formats to eg. 9:40:15.832
        return `${Log.leftPad(now.getHours(), 2)}:${Log.leftPad(now.getMinutes(), 2)}:${Log.leftPad(now.getSeconds(), 2)}` +
            `.${Log.leftPad(now.getMilliseconds(), 3)}`;
    }

    /**
     * Convert the given number to a string of at least the given length.
     * Eg:
     * leftPad(3, 2) -> "03"
     * leftPad(20, 2) -> "20"
     * leftpad(400, 2) -> "400"     (just converts to string)
     */
    private static leftPad(n: number, desiredLen: number): string {
        const nStr = n.toString();
        const diff = desiredLen - nStr.length;
        if (diff <= 0) {
            return nStr;
        }
        return "0".repeat(diff) + nStr;
    }

    private static replacer(name: string, val: any): any {
        // Don't log the Connection fields on the Projects because they recur infinitely
        if (name === "connection" && val instanceof Project) {
            return undefined;
        }
        else if (val instanceof Uri || val.$mid != null) {
            return val.toString();
        }
        else if (val.managerName) {
            // MCLogManager
            return val.managerName;
        }
        return val;
    }
}

export namespace Log {
    export enum Levels {
        DEBUG = "DBUG",
        INFO = "INFO",
        WARNING = "WARN",
        ERROR = "ERRO",
        TEST = "TEST"
    }
}

export default Log;
