/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { ExtensionContext, Uri } from "vscode";
import * as Stacktrace from "stack-trace";
import * as CircularJson from "circular-json";
import Project from "./microclimate/project/Project";

// non-nls-file

// tslint:disable no-console

export class Log {

    private static readonly LOG_NAME: string = "codewind-tools.log";

    private static logFilePath: string;

    private static disabledLevels: Log.Levels[] = [];

    public static get getLogFilePath(): string {
        return this.logFilePath;
    }

    public static setLogFilePath(context: ExtensionContext): void {
        // Directory provided by extension context may not exist
        const logDir = context.logPath;
        const mode = 0o744;

        try {
            fs.accessSync(logDir, mode);
        }
        catch (err) {
            // logDir doesn't exist, we must create it
            try {
                fs.mkdirSync(logDir, mode);
                console.log("Codewind Tools created logs dir", logDir);
            }
            catch (err) {
                // This shouldn't happen, but fall back to console.log if it does.
                console.error("Error creating log file!", err);
                this.logInner = util.promisify(console.log);
            }
        }

        const fullPath = path.join(context.logPath, this.LOG_NAME);
        this.logFilePath = fullPath;
        console.log("Codewind Tools log file is at " + this.logFilePath);
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
        if (this.logFilePath == null) {
            console.error("Logger.log error - No log file path set!");
            console.log(s, args);
            return;
        }
        else if (this.disabledLevels.includes(level)) {
            return;
        }

        const argsStr: string = args.reduce( (result: string, arg: any): string => {
            if (arg instanceof Object) {
                try {
                    // Can fail eg on objects with circular references
                    // arg = JSON.stringify(arg, undefined, 2);
                    arg = CircularJson.stringify(arg, replacer, 2);
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

        const label: string = `[${level}: ${getDateTime()}${caller}]:`;
        const msg: string = `${label} ${argsStr}${os.EOL}`;

        return new Promise<void>((resolve) => {
            // Send the message to both the 'console' and the logfile.
            const consoleFn = level === this.Levels.ERROR ? console.error : console.log;
            if (args.length > 0) {
                consoleFn(label, s, ...args);
            }
            else {
                consoleFn(label, s);
            }

            fs.appendFile(this.logFilePath, msg, (err) => {
                if (err != null) {
                    console.error("FS error when logging:", err);
                }
                return resolve();
            });
        });
    }

    private static getCaller(): string {
        // get the stack trace above logInner. casting is necessary because the stack trace package only accepts () => void functions.
        const stack = Stacktrace.get(Log.logInner as unknown as () => void);
        // 6 frames is the magic number to get around __awaiters, past the Log.x function, and up to the frame we care about.
        const frame = stack[6];
        if (frame == null) {
            return "N/A";
        }

        let methodName = frame.getMethodName() || frame.getFunctionName();
        if (methodName != null) {
            // If it's a callback, there will be extra stuff we aren't interested in separated by dots
            // eg "Project.__dirname.constructor.connection.update"
            // strip out everything up to the last dot, if there is one
            const splitByPeriod: string[] = methodName.split(".");
            if (splitByPeriod.length > 1) {
                methodName = splitByPeriod[splitByPeriod.length - 1];
            }
            methodName = `.${methodName}()`;
        }
        else {
            methodName = "";
        }

        const fileName = path.basename(frame.getFileName());
        return `${fileName}${methodName}:${frame.getLineNumber()}`;
    }
}

function replacer(name: string, val: any): string | undefined {
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

function getDateTime(): string {
    const now = new Date();
    // formats to eg. 22/10/2018 9:40:15.832
    // Note add 1 to month because months are 0-indexed
    // return `${leftPad(now.getDate())}/${leftPad(now.getMonth() + 1)}/${now.getFullYear()} ` +
    return `${leftPad(now.getHours(), 2)}:${leftPad(now.getMinutes(), 2)}:${leftPad(now.getSeconds(), 2)}.${leftPad(now.getMilliseconds(), 3)}`;
}

/**
 * Convert the given number to a string of at least the given length.
 * Eg:
 * leftPad(3, 2) -> "03"
 * leftPad(20, 2) -> "20"
 * leftpad(400, 2) -> "400"     (just converts to string)
 */
function leftPad(n: number, desiredLen: number): string {
    const nStr = n.toString();
    const diff = desiredLen - nStr.length;
    if (diff <= 0) {
        return nStr;
    }
    return "0".repeat(diff) + nStr;
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
