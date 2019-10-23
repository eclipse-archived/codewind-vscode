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
import * as io from "socket.io-client";

import Connection from "./Connection";
import Project from "../project/Project";
import Log from "../../Logger";
import SocketEvents from "./SocketEvents";
import Validator from "../project/Validator";
import projectOverviewCmd from "../../command/project/ProjectOverviewCmd";
import { CWConfigurations } from "../../constants/Configurations";

/**
 * Receives and reacts to socket events from Portal
 *
 * Each Connection has exactly one socket
 */
export default class MCSocket implements vscode.Disposable {

    public readonly uri: string;
    private readonly socket: SocketIOClient.Socket;

    /**
     * Create a SocketIO connection to the server at the given URI.
     * Can throw an error.
     *
     * @param namespace - Socket namespace. Must not start with a slash. Can be the empty string.
     */
    constructor(
        private readonly connection: Connection,
        namespace: string,
    ) {
        this.uri = connection.url.toString();
        if (namespace) {
            if (!this.uri.endsWith("/")) {
                this.uri += "/";
            }
            this.uri += namespace;
        }
        Log.i("Creating MCSocket for URI", this.uri);

        const usingHttps = connection.url.scheme === "https";
        const timeout = global.isTheia ? 15000 : 5000;
        const options: SocketIOClient.ConnectOpts = {
            rejectUnauthorized: !usingHttps,                    // TODO because of our self-signed certs
            secure: usingHttps,
            timeout,
        };

        this.socket = io(this.uri, options);

        this.socket.connect();

        this.socket
            .on("connect",      this.connection.onConnect)      // non-nls
            .on("disconnect",   this.connection.onDisconnect)   // non-nls

            .on(SocketEvents.Types.PROJECT_BOUND,           this.onProjectBound)

            .on(SocketEvents.Types.PROJECT_CREATED,         this.onProjectCreation)
            .on(SocketEvents.Types.PROJECT_CHANGED,         this.onProjectChanged)
            .on(SocketEvents.Types.PROJECT_STATUS_CHANGED,  this.onProjectStatusChanged)
            .on(SocketEvents.Types.PROJECT_CLOSED,          this.onProjectClosed)

            .on(SocketEvents.Types.PROJECT_DELETION,        this.onProjectDeleted)
            .on(SocketEvents.Types.PROJECT_RESTART_RESULT,  this.onProjectRestarted)

            .on(SocketEvents.Types.PROJECT_VALIDATED,       this.onProjectValidated)
            .on(SocketEvents.Types.PROJECT_SETTING_CHANGED, this.onProjectSettingsChanged)
            .on(SocketEvents.Types.LOG_UPDATE,              this.onLogUpdate)
            .on(SocketEvents.Types.LOGS_LIST_CHANGED,       this.onLogsListChanged)
            // .on(SocketEvents.Types.REGISTRY_STATUS,         this.onRegistryStatus)
            ;
    }

    /**
     * This MUST be called when the connection is removed.
     * If there are multiple sockets listening on the same connection,
     * the callbacks will be fired multiple times for the same event, which will lead to serious misbehaviour.
     */
    public async dispose(): Promise<void> {
        this.connection.onDisconnect();
        this.socket.disconnect();
    }

    private readonly onProjectBound = async (payload: { success: boolean; projectID?: string; error?: string; }): Promise<void> => {
        await this.connection.forceUpdateProjectList();

        if (payload.projectID) {
            const newProject = await this.connection.getProjectByID(payload.projectID);
            if (newProject == null) {
                Log.e(`Project ${payload.projectID} was created but not available after a refresh`);
            }
            else {
                const msg = `Project ${newProject.name} has been created`;
                Log.i(msg);

                let showOverviewOnCreate = vscode.workspace.getConfiguration().get(CWConfigurations.OVERVIEW_ON_CREATION);
                if (showOverviewOnCreate == null) {
                    showOverviewOnCreate = true;
                }
                if (showOverviewOnCreate) {
                    projectOverviewCmd(newProject);
                }
                // vscode.window.showInformationMessage(msg);
            }
        }
        else {
            const err = payload.error || "Unknown error";
            Log.e("Error creating project", err);
            vscode.window.showErrorMessage("Project creation failed: " + err);
        }
    }

    private readonly onProjectCreation = async (payload: any): Promise<void> => {
        // https://github.com/eclipse/codewind/issues/720#issuecomment-543801321
        // creation event is now, apparently, the same as changed event
        this.onProjectChanged(payload);
    }

    private readonly onProjectStatusChanged = async (payload: { projectID: string }): Promise<void> => {
        // Log.d("onProjectStatusChanged", payload);
        // portal emits the entire inf file with a statusChanged event, so we can treat this the same as projectChanged
        this.onProjectChanged(payload);
    }

    private readonly onProjectChanged = async (payload: { projectID: string }): Promise<void> => {
        // Log.d("onProjectChanged", payload);
        // Log.d(`PROJECT CHANGED name=${payload.name} appState=${payload.appStatus} ` +
                // `buildState=${payload.buildStatus} startMode=${payload.startMode}`);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        project.update(payload);
    }

    private readonly onProjectClosed = async (payload: { projectID: string }): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.clearValidationErrors();
        this.onProjectChanged(payload);
    }

    private readonly onProjectDeleted = async (payload: { projectID: string }): Promise<void> => {
        Log.d("Project deleted", payload.projectID);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.onDelete();
        this.connection.forceUpdateProjectList();
    }

    private readonly onProjectRestarted = async (payload: SocketEvents.IProjectRestartedEvent): Promise<void> => {
        // Log.d("PROJECT RESTARTED", payload);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        project.onRestartEvent(payload);
    }

    private readonly onLogsListChanged = async (payload: SocketEvents.ILogsListChangedEvent): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        project.logManager.onLogsListChanged(payload);
    }

    private readonly onLogUpdate = async (payload: SocketEvents.ILogUpdateEvent): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        // Log.d(`Received log ${payload.logName} of length ${payload.logs.length} with reset ${payload.reset}`);
        project.logManager.onNewLogs(payload);
    }

    private readonly onProjectValidated = async (payload: { projectID: string, validationResults: SocketEvents.IValidationResult[] })
        : Promise<void> => {

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        if (payload.validationResults != null) {
            Validator.validate(project, payload.validationResults);
        }
        else {
            Log.e("Backend didn't send result with validation event");
        }
    }

    private readonly onProjectSettingsChanged = async (payload: SocketEvents.IProjectSettingsEvent): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }
        // Log.d("projectSettingsChanged", payload);
        return project.onSettingsChangedEvent(payload);
    }

    /*
    private readonly onRegistryStatus = async (payload: SocketEvents.IRegistryStatus): Promise<void> => {
        // tslint:disable-next-line: no-boolean-literal-compare
        if (payload.deploymentRegistryTest === false) {
            Log.i("Deployment registry is not correctly configured", payload.msg);
            vscode.window.showErrorMessage("Deployment registry error: " + payload.msg);
        }
    }
    */

    private readonly getProject = async (payload: { projectID: string }): Promise<Project | undefined> => {
        const projectID = payload.projectID;
        if (projectID == null) {
            // Should never happen
            Log.e("No projectID in socket event!", payload);
            return undefined;
        }

        const result = await this.connection.getProjectByID(projectID);
        if (result == null) {
            Log.w("Received socket event for nonexistent project", payload.projectID);
        }
        return result;
    }

    public toString(): string {
        return "MCSocket @ " + this.uri;        // not displayed to user        // non-nls
    }
}
