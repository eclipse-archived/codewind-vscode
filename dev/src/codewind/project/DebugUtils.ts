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

import * as vscode from "vscode";

import Project from "./Project";
import Log from "../../Logger";
import ProjectType from "./ProjectType";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";

const STRING_NS = StringNamespaces.DEBUG;

export default class DebugUtils {

    private constructor() {}

    /**
     * Start a debug session for the given project.
     * @return Success status
     */
    public static async startDebugSession(project: Project): Promise<void> {
        Log.i("startDebugSession for project " + project.name);
        if (project.type.debugType == null) {
            // Just in case.
            throw new Error(Translator.t(STRING_NS, "noDebugTypeKnown", { type: project.type.type }));
        }
        else if (project.ports.debugPort == null) {
            throw new Error(Translator.t(STRING_NS, "noDebugPort", { projectName: project.name }));
        }

        const debugConfig: vscode.DebugConfiguration = await DebugUtils.setDebugConfig(project);
        const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
        const pfName: string = projectFolder != null ? projectFolder.name : "undefined";        // non-nls
        Log.i("Running debug launch on project folder: " + pfName, debugConfig);

        // const priorDebugSession = vscode.debug.activeDebugSession;
        const debugSuccess = await vscode.debug.startDebugging(projectFolder, debugConfig);

        if (!debugSuccess) {
            Log.w("Debugger failed to attach");
            throw new Error(this.getFailMsg(project));
        }
        else if (vscode.debug.activeDebugSession?.name !== debugConfig.name) {
            Log.w("A debug session is active but is not the one we just launched");
            throw new Error(this.getFailMsg(project));
        }
        else {
            Log.i("Debugger attach appeared to succeed");
        }
    }

    private static getFailMsg(project: Project, err?: Error): string {
        const debugUrl = project.debugUrl;
        let failMsg;
        if (debugUrl != null) {
            failMsg = Translator.t(STRING_NS, "failedToAttachWithUrl", { projectName: project.name, debugUrl });
        }
        else {
            failMsg = Translator.t(STRING_NS, "failedToAttach", { projectName: project.name });
        }

        if (err) {
            const extraErrMsg: string = err.message ? err.message : "";         // non-nls
            if (extraErrMsg) {
                failMsg += Translator.t(STRING_NS, "errDetailSeparator") + extraErrMsg;
            }
        }
        Log.e(failMsg, err || "No error provided");

        return failMsg;
    }

    /**
     * Search the workspace's launch configurations for one that is for this project, and delete it if it exists.
     * Returns a promise that resolves to whether or not a matching launch config was found and deleted.
     */
    public static async removeDebugLaunchConfigFor(project: Project): Promise<boolean> {
        const workspaceConfig = this.getWorkspaceLaunchConfig(project);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

        const debugName = this.getDebugName(project);
        let indexToDelete = -1;
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                indexToDelete = i;
                break;
            }
        }

        if (indexToDelete !== -1) {
            launchConfigs.splice(indexToDelete, 1);
            await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
            Log.i(`Removed debug launch config for project ${project.name}`);

            return true;
        }
        else {
            Log.d(`Requested to delete launch for ${project.name}, but no launch was found`);
            return false;
        }
    }

    // public static async cleanDebugLaunchConfigsFor(connection: Connection): Promise<void> {
    //     Log.d("Clean launch configs from " + connection.workspacePath);

    //     // The potential names of the projects' debug configurations, whether or not they exist
    //     const projectDebugNames: string[] = connection.projects.map( (project) => this.getDebugName(project));

    //     const workspaceConfig = this.getWorkspaceConfigFor(connection);
    //     const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

    //     // Loop backwards so we can remove elements
    //     for (let i = launchConfigs.length - 1; i >= 0; i--) {
    //         const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
    //         if (!projectDebugNames.includes(existingLaunch.name)) {
    //             // This launch config does not map to an existing project, so we delete it.
    //             Log.i(`Delete launch config: ${existingLaunch.name}`);
    //             launchConfigs.splice(i, 1);
    //         }
    //     }

    //     await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
    // }

    // keys for launch.json
    private static readonly LAUNCH: string = "launch";                      // non-nls
    private static readonly CONFIGURATIONS: string = "configurations";      // non-nls

    private static getWorkspaceLaunchConfig(project: Project): vscode.WorkspaceConfiguration {
        // Prefer the project's workspace folder if it exists, otherwise fall back to whatever is open
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
        if (!workspaceFolder) {
            workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;
        }
        return vscode.workspace.getConfiguration(DebugUtils.LAUNCH, workspaceFolder ? workspaceFolder.uri : undefined);
    }

    private static getLaunchConfigurationsFrom(workspaceConfig: vscode.WorkspaceConfiguration): vscode.DebugConfiguration[] {
        return workspaceConfig.get(DebugUtils.CONFIGURATIONS, [{}]) as [vscode.DebugConfiguration];
    }

    private static async updateWorkspaceLaunchConfigs(
            workspaceConfig: vscode.WorkspaceConfiguration,
            newLaunchConfigs: vscode.DebugConfiguration[]
        ): Promise<void> {

        return workspaceConfig.update(DebugUtils.CONFIGURATIONS, newLaunchConfigs, vscode.ConfigurationTarget.Workspace);
    }

    private static getDebugName(project: Project): string {
        return Translator.t(STRING_NS, "debugLaunchName", { projectName: project.name });
    }

    /**
     * Updates the existing launch config for debugging this project, or generates and saves a new one if one does not exist.
     *
     * The launch config will be stored under the workspace folder.
     *
     * @return The new debug configuration which can then be passed to startDebugging
     */
    public static async setDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
        const debugName: string = DebugUtils.getDebugName(project);

        let launchToWrite: vscode.DebugConfiguration | undefined;

        const workspaceConfig = this.getWorkspaceLaunchConfig(project);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

        // See if we already have a debug launch for this project, so we can replace it
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                // updatedLaunch might be the same as existingLaunch.
                const updatedLaunch: vscode.DebugConfiguration = DebugUtils.updateDebugLaunchConfig(project, existingLaunch);

                Log.d(`Replacing existing debug launch ${debugName}`);
                launchConfigs[i] = updatedLaunch;
                launchToWrite = updatedLaunch;
                break;
            }
        }

        if (launchToWrite == null) {
            // We didn't find an existing launch; need to generate a new one
            launchToWrite = DebugUtils.generateDebugLaunchConfig(debugName, project);

            // already did this in startDebugSession, but just in case
            if (launchToWrite == null) {
                const msg = Translator.t(STRING_NS, "noDebugTypeKnown", { type: project.type.type });
                Log.e(msg);
                throw new Error(msg);
            }

            Log.d("Pushing new debug launch: " + launchToWrite.name, launchToWrite);
            launchConfigs.push(launchToWrite);
        }

        await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
        // Logger.log("New config", launchConfig.get(CONFIGURATIONS));
        return launchToWrite;
    }

    private static readonly RQ_ATTACH: string = "attach";       // non-nls

    private static generateDebugLaunchConfig(debugName: string, project: Project): vscode.DebugConfiguration | undefined {

        switch (project.type.debugType) {
            case ProjectType.DebugTypes.JAVA: {
                return {
                    type: project.type.debugType.toString(),
                    name: debugName,
                    request: DebugUtils.RQ_ATTACH,
                    hostName: project.connection.host,
                    port: project.ports.debugPort,
                    // sourcePaths: project.localPath + "/src/"
                    projectName: project.name,
                };
            }
            case ProjectType.DebugTypes.NODE: {
                return {
                    type: project.type.debugType.toString(),
                    name: debugName,
                    request: DebugUtils.RQ_ATTACH,
                    address: project.connection.host,
                    port: project.ports.debugPort,
                    localRoot: project.localPath.fsPath,
                    // /app is the default containerAppRoot for node
                    remoteRoot: project.containerAppRoot || "/app",         // non-nls
                    restart: true
                };
            }
            default:
                return undefined;
        }
    }

    /**
     * Update the existingLaunch with the new values of config fields that could have changed since the last launch, then return it.
     * As far as I can tell, only the port can change.
     */
    private static updateDebugLaunchConfig(project: Project, existingLaunch: vscode.DebugConfiguration): vscode.DebugConfiguration {
        const newLaunch: vscode.DebugConfiguration = existingLaunch;

        if (existingLaunch.port === project.ports.debugPort) {
            Log.d(`Debug port for ${project.name} didn't change`);
        }
        else {
            Log.d(`Debug port for ${project.name} changed from ${existingLaunch.port} to ${newLaunch.port}`);
            newLaunch.port = project.ports.debugPort;
        }

        return newLaunch;
    }
}
