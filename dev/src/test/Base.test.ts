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
import CLISetup from "../codewind/cli/CLISetup";
import CLIWrapper from "../codewind/cli/CLIWrapper";
import Translator from "../constants/strings/Translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

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

    it("should activate when the Codewind view is opened", async function() {
        this.timeout(TestUtil.ms(60, "sec"));
        this.slow(TestUtil.ms(15, "sec"));

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

        // this is done async from .activate so we have to wait for it separately.
        await new Promise((resolve) => {
            let counter = 0;
            const interval = setInterval(() => {
                const hasInitialized = CLIWrapper.hasInitialized();
                if (hasInitialized) {
                    clearInterval(interval);
                    resolve();
                }
                else if (counter % 5 === 0) {
                    Log.t(`Waiting for CLIWrapper to initialize, ${counter}s elapsed`);
                }
                counter++;
            }, 1000);
        });
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Log.getLogFilePath;

        expect(logPath).to.exist;
        Log.t("The logs are at " + logPath);

        const logContents = (await fs.promises.readFile(logPath)).toString("utf8");
        expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
    });

    it(`should have installed the CLI binaries`, async function() {
        expect(await CLISetup.isCwctlSetup()).to.be.true;
        expect(await CLISetup.isAppsodySetup()).to.be.true;
    });

    it(`should have initialized the translator`, async function() {
        const activeMsg = Translator.t(StringNamespaces.DEFAULT, "activeMsg");
        expect(activeMsg, `activeMsg did not match expected`).to.equal("Codewind Tools for VSCode are active!");
    });
});
