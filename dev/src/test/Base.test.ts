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

import * as vscode from "vscode";
import { expect } from "chai";
import * as fs from "fs";

import Log from "../Logger";
import TestUtil from "./TestUtil";
import Commands from "../constants/Commands";

const extensionID = "IBM.codewind";
Log.t(`Starting ${extensionID} tests...`);

// Log.silenceLevels(Log.Levels.DEBUG);

beforeEach(function() {
    if (!this.currentTest) {
        return;
    }
    // const filename = this.currentTest.file ? this.currentTest.file + " - " : "";
    const parent = this.currentTest.parent ? (`[${this.currentTest.parent.title}] `) : "";
    Log.t(`${"*".repeat(5)} ${parent}${this.currentTest.title}`);
});

describe("Codewind for VS Code", function() {

    this.bail(true);

    // If you get the error:
    // TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received type undefined
    // It likely means you called extension code before the extension was activated
    it("should activate when the Codewind view is opened", async function() {
        this.timeout(TestUtil.ms(30, "sec"));
        this.slow(TestUtil.ms(10, "sec"));

        // Log.t("Loaded extensions:", vscode.extensions.all.map((ext) => ext.id).join(", "));
        const extension = vscode.extensions.getExtension(extensionID);
        expect(extension, `Extension ${extensionID} isn't installed!`).to.exist;

        // opening the Codewind view activates the extension
        await vscode.commands.executeCommand(Commands.FOCUS_CW_VIEW);
        await TestUtil.waitForCondition(this, {
            label: "Waiting for extension to activate",
            condition: () => extension!.isActive
        });

        Log.t(`Codewind commands:`, (await vscode.commands.getCommands()).filter((cmd) => cmd.includes("ext.cw")));
        Log.t("Extension is loaded.");
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Log.getLogFilePath;

        expect(logPath).to.exist;
        Log.t("The logs are at " + logPath);

        const logContents = (await fs.promises.readFile(logPath)).toString("utf8");
        expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
    });
});
