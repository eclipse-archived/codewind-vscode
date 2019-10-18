/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { expect } from "chai";
import * as vscode from "vscode";
import * as fs from "fs";

import Log from "../Logger";
import ConnectionManager from "../codewind/connection/ConnectionManager";

import SocketTestUtil from "./SocketTestUtil";
import ProjectObserver from "./ProjectObserver";
import TestConfig from "./TestConfig";
import Project from "../codewind/project/Project";
import Connection from "../codewind/connection/Connection";
import TestUtil from "./TestUtil";
import LocalCodewindManager from "../codewind/connection/local/LocalCodewindManager";

const extensionID = "IBM.codewind";
Log.t(`Starting ${extensionID} tests`);
// Will be re-used by other tests
export let testConnection: Connection;
// Set this to true when the connection set up and project creation succeeds
export let initializeSucceeded: boolean = false;

describe("Codewind for VSCode basic test", async function() {

    // The test needs to be launched with the codewind-workspace open, so that the extension is activated.

    before("Activate the extension", async function() {
        this.timeout(TestUtil.getMinutes(5));
        const wsFolders = vscode.workspace.workspaceFolders;
        Log.t("Workspace folders:", wsFolders);
        expect(wsFolders).to.have.length.greaterThan(0);

        const workspaceDirName = "codewind-workspace";
        const badWsMsg = `Active workspace is not valid. Point the test launch configuration to your ${workspaceDirName}.`;
        expect(wsFolders![0].uri.fsPath.endsWith(workspaceDirName), badWsMsg).to.be.true;

        Log.t("Loaded extensions:", vscode.extensions.all.map((ext) => ext.id).join(", "));
        const extension_ = vscode.extensions.getExtension(extensionID);
        expect(extension_, `Extension ${extensionID} isn't installed!`).to.exist;
        const extension = extension_!;

        // This should never happen.
        // The tests will never run if the extension is not active. It seems to be a VS Code bug.
        // It will print a message like "TypeError: path must be of type string, received type undefined".
        expect(extension.isActive, `Extension ${extensionID} isn't active`).to.be.true;

        Log.t("Workspace is good and extension is loaded.");

        // Log.t("Environment:", process.env);

        Log.t(`${"=".repeat(10)} TEST CONFIGURATION: ${"=".repeat(10)}`);
        const projectTypesToTest = TestConfig.getProjectTypesToTest();
        Log.t("Testing project types:", projectTypesToTest.map((t) => t.projectType.type));
        Log.t("Extended tests enabled: " + TestConfig.isScopeEnabled("extended"));
        Log.t("Restart tests enabled: " + TestConfig.isScopeEnabled("restart"));
        Log.t(`${"=".repeat(10)} END TEST CONFIGURATION ${"=".repeat(10)}`);
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Log.getLogFilePath;

        expect(logPath).to.exist;
        Log.t("The logs are at " + logPath);

        fs.readFile(logPath, (err, data) => {
            expect(err, "Couldn't read log file, error was " + err).to.be.null;
            const logContents = data.toString("utf8");
            expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
        });
    });

    it("should start the backend, installing it if necessary", async function() {
        this.timeout(TestUtil.getMinutes(10));
        this.slow(TestUtil.getMinutes(5));
        Log.t("Waiting for Codewind to start and/or install...");
        // await CodewindManager.instance.initPromise;
        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (LocalCodewindManager.instance.isStarted) {
                    clearInterval(interval);
                    resolve();
                }
            }, 1000);
        });
    });

    it("should connect to the backend", async function() {
        this.timeout(10 * 1000);
        const connMan = ConnectionManager.instance;

        expect(connMan.connections.length).to.eq(1, "No connection exists");

        const connection = connMan.connections[0];
        // expect(connection.isConnected).to.be.true;
        expect(connection.url.authority).to.contain("localhost:9090");
        testConnection = connection;
    });

    it("should have a test socket connection", async function() {
        expect(testConnection, "No Codewind connection").to.exist;
        const socketUri = testConnection.socketURI!;
        const testSocket = await SocketTestUtil.createTestSocket(socketUri);
        expect(testSocket.connected, "Socket did not connect").to.be.true;
    });

    it("should initialize the ProjectObserver", async function() {
        expect(testConnection, "No Codewind connection").to.exist;
        const obs = new ProjectObserver(testConnection);
        expect(obs, "Failed to initialize ProjectObserver").to.exist;
        expect(obs.connection, "Failed to initialize ProjectObserver connection").to.exist;
    });

    // it("should open the connection's workspace", async function() {
    //     Log.t(`Opening workspace ${testConnection.workspacePath.fsPath}`);
    //     await vscode.commands.executeCommand(Commands.OPEN_WS_FOLDER, testConnection);
    //     Log.t("Finished opening workspace");
    // });

    it("should create test projects", async function() {
        // Long timeout because project creation is slow
        this.timeout(TestUtil.getMinutes(10));

        expect(testConnection, "No Codewind connection").to.exist;

        const projectTypesToTest = TestConfig.getProjectTypesToTest();
        Log.t("Testing project types:", projectTypesToTest);

        const createPromises: Array<Promise<Project>> = [];

        for (const testType of projectTypesToTest) {
            Log.t(`Create ${testType.projectType.type} project`);

            // the tiniest of delays, because if the projects are created in the same millisecond the initialize container falls over :)
            await new Promise((resolve) => setTimeout(resolve, 5));
            const createPromise = TestUtil.createProject(testConnection, testType.projectType);
            createPromises.push(createPromise);

            createPromise
            .then((p) => {
                testType.projectID = p.id;
                Log.t(`Created test project of type ${p.type.type} with name ${p.name} and ID ${p.id}`);
            })
            .catch((err) => Log.e("Create test project threw error", err));
        }

        Log.t("Awaiting test project creation");
        await Promise.all(createPromises);

        Log.t("Done creating test projects", projectTypesToTest);
        // If we made it this far, we can run the rest of the tests
        initializeSucceeded = true;
    });
});
