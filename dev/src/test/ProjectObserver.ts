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

import Log from "../Logger";
import ProjectState from "../codewind/project/ProjectState";
import Connection from "../codewind/connection/Connection";
import CodewindEventListener from "../codewind/connection/CodewindEventListener";

interface IProjectCreationAwaiting {
    projectName: string;
    resolveFunc: ( (projectID: string) => void );
}

interface IProjectStateAwaiting {
    projectID: string;
    projectName: string;
    states: ProjectState.AppStates[];
    resolveFunc: (() => void );
}

export default class ProjectObserver {

    private projectPendingState: IProjectStateAwaiting | undefined;
    private readonly projectsPendingCreation: IProjectCreationAwaiting[] = [];

    private static _instance: ProjectObserver;

    public static get instance(): ProjectObserver {
        if (this._instance == null) {
            Log.e("You must first initialize the ProjectObserver by calling new ProjectObserver(connection)");
        }
        return this._instance;
    }

    constructor(
        public readonly connection: Connection
    ) {
        Log.t("Initializing ProjectObserver");
        ProjectObserver._instance = this;
        CodewindEventListener.addOnChangeListener(this.onChange);

        setInterval(() => {
            if (this.projectPendingState != null) {
                Log.t(`Waiting for ${this.projectPendingState.projectName} to be ${this.projectPendingState.states.join(" or ")}`);
            }
            if (this.projectsPendingCreation.length > 0) {
                Log.t("Project(s) pending creation: " + JSON.stringify(this.projectsPendingCreation));
            }
        }, 30000);
    }

    private readonly onChange = async () => {

        const projects = this.connection.projects;
        // Check if any of the projects pending creation have been created.
        for (let i = this.projectsPendingCreation.length - 1; i >= 0; i--) {
            const pendingCreation = this.projectsPendingCreation[i];
            const findResult = projects.find((p) => p.name === pendingCreation.projectName);
            if (findResult != null) {
                Log.t(`Project ${pendingCreation.projectName} was created`);
                pendingCreation.resolveFunc(findResult.id);
                this.projectsPendingCreation.splice(i, 1);
            }
        }

        if (this.projectPendingState != null) {
            const project = await this.connection.getProjectByID(this.projectPendingState.projectID);
            if (!project) {
                Log.t(`Error: couldn't get project with ID ${this.projectPendingState.projectID}`);
            }
            else if (this.projectPendingState.states.includes(project.state.appState)) {
                Log.t(`Project ${project.name} reached pending state ${project.state}`);
                this.projectPendingState!.resolveFunc();
                this.projectPendingState = undefined;
            }
        }
    }

    public onDelete(projectID: string): void {
        if (this.projectPendingState != null && projectID === this.projectPendingState.projectID) {
            Log.t("No longer observing project " + projectID);
            this.projectPendingState = undefined;
        }
    }

    public async awaitProjectStarted(projectID: string): Promise<void> {
        return this.awaitAppState(projectID, ...ProjectState.getStartedStates());
    }

    /**
     * This is really similar to Project.waitForState,
     * but we don't want to have to call that from tests because it will interfere with normal execution.
     */
    public async awaitAppState(projectID: string, ...states: ProjectState.AppStates[]): Promise<void> {
        if (states.length === 0) {
            const msg = "ProjectObserver: Must provide at least one state to wait for";
            Log.e(msg);
            throw new Error(msg);
        }
        else if (this.projectPendingState != null) {
            const msg = "Already awaiting on another project: " + JSON.stringify(this.projectPendingState);
            Log.e(msg);
            throw new Error(msg);
        }

        // we have to get a new Project object each time so that the state is refreshed
        const project = await this.connection.getProjectByID(projectID);
        if (project == null) {
            throw new Error("Could not find project with ID " + projectID);
        }
        if (states.includes(project.state.appState)) {
            Log.t(`No need to wait for states ${JSON.stringify(states)}, ${project.name} is already ${project.state}`);
            return;
        }

        Log.t(`Wait for ${project.name} to be ${JSON.stringify(states)}, is currently ${project.state.appState}`);

        return new Promise<void>((resolve) => {
            this.projectPendingState = {
                projectID: project.id,
                projectName: project.name,
                states: states,
                resolveFunc: resolve
            };

            Log.t(`projectPendingState is now: ${JSON.stringify(this.projectPendingState)}`);
        });
    }

    public async awaitCreate(name: string): Promise<string> {
        return new Promise<string>((resolve) => {
            this.projectsPendingCreation.push({
                projectName: name,
                resolveFunc: resolve
            });

            Log.t(`projectsPendingCreation are now:`, this.projectsPendingCreation);
        });
    }
}
