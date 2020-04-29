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

import Project from "./Project";
import Log from "../../Logger";
import ProjectType from "./ProjectType";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/Translator";

const STRING_NS = StringNamespaces.DEBUG;

export default class DebugUtils {

    private constructor() {}

    public static async startDebugSession(project: Project): Promise<void> {
        Log.i("startDebugSession for project " + project.name);
        if (project.type.debugType == null) {
            // Just in case.
            throw new Error(Translator.t(STRING_NS, "noDebugTypeKnown", { type: project.type.type }));
        }

        if (project.connection.isRemote) {
            await project.remoteDebugPortForward();
        }

        else if (project.exposedDebugPort == null) {
            throw new Error(Translator.t(STRING_NS, "noDebugPort", { projectName: project.name }));
        }

        const debugConfig: vscode.DebugConfiguration = await DebugUtils.setDebugConfig(project);
        const debugSuccess = await vscode.debug.startDebugging(project.workspaceFolder, debugConfig);

        if (!debugSuccess) {
            Log.w("Debugger failed to attach");
            throw new Error(this.getFailMsg(project));
        }
        Log.i("Debugger attach appeared to succeed");
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
        const workspaceConfig = this.getLaunchConfig(project);
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

        if (indexToDelete === -1) {
            Log.d(`Requested to delete launch for ${project.name}, but no launch was found`);
            return false;
        }

        launchConfigs.splice(indexToDelete, 1);
        try {
            await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
            Log.i(`Removed debug launch config for project ${project.name}`);
            return true;
        }
        catch (err) {
            Log.e(`Error updating debug config for ${project.name}`, err)
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

    private static getLaunchConfig(project: Project): vscode.WorkspaceConfiguration {
        // Prefer the project's workspace folder if it exists, otherwise fall back to whatever is open
           return vscode.workspace.getConfiguration(DebugUtils.LAUNCH, project.workspaceFolder?.uri);
    }

    private static getLaunchConfigurationsFrom(workspaceConfig: vscode.WorkspaceConfiguration): vscode.DebugConfiguration[] {
        return workspaceConfig.get<vscode.DebugConfiguration[]>(DebugUtils.CONFIGURATIONS, []);
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

        const workspaceConfig = this.getLaunchConfig(project);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

        // See if we already have a debug launch for this project, so we can replace it
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                const updatedLaunch = DebugUtils.generateDebugLaunchConfig(debugName, project);

                if (updatedLaunch == null) {
                    Log.e(`Failed to generate debug launch config for ${project.name} when a config already existed`);
                    continue;
                }

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
                    hostName: project.debugHost,
                    port: project.exposedDebugPort,
                    // sourcePaths: project.localPath + "/src/"
                    projectName: project.name,
                };
            }
            case ProjectType.DebugTypes.NODE: {
                return {
                    type: project.type.debugType.toString(),
                    name: debugName,
                    request: DebugUtils.RQ_ATTACH,
                    address: project.debugHost,
                    port: project.exposedDebugPort,
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
}
