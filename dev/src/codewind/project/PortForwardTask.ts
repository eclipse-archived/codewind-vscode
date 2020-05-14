/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
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

/**
 * Represents a task which forwards the project's internal debug port out of the pod,
 * to the project's exposedDebugPort on the local system.
 * When the task terminates, this is disposed.
 */
export default class PortForwardTask implements vscode.Task, vscode.Disposable {

    ///// Task implementation /////
    public readonly label: string;
    public readonly name: string;
    public readonly execution: vscode.ShellExecution;
    public readonly source: string;

    public readonly definition: vscode.TaskDefinition;

    public readonly isBackground: boolean = true;
    public readonly presentationOptions: vscode.TaskPresentationOptions = {
        clear: false,
        echo: true,
        focus: false,
        panel: vscode.TaskPanelKind.New,
        reveal: vscode.TaskRevealKind.Always,
        showReuseMessage: false,
    };
    public readonly problemMatchers: string[] = [];
    public readonly runOptions: vscode.RunOptions = {
        reevaluateOnRerun: true,
    };
    public readonly scope: vscode.TaskScope = vscode.TaskScope.Workspace;

    ///// End task implementation /////

    private readonly command: string;
    private readonly args: string[];

    private task: vscode.TaskExecution | undefined;
    private taskListener: vscode.Disposable | undefined;
    private exitCode: number | undefined;

    constructor (
        private readonly project: Project,
        kubeClient: string,
    ) {
        const baseErrMsg = `Cannot forward debug port for ${project.name}`
        if (!project.namespace) {
            throw new Error(`${baseErrMsg}: the project's namespace is not set.`);
        }
        else if (!project.podName) {
            throw new Error(`${baseErrMsg}: the project's pod name is not set.`);
        }
        else if (!project.exposedDebugPort) {
            throw new Error(`${baseErrMsg}: the project's exposed debug port is not set.`);
        }
        else if (!project.internalDebugPort) {
            throw new Error(`${baseErrMsg}: the project's internal debug port is not set.`);
        }

        const portForward = `${project.exposedDebugPort}:${project.internalDebugPort}`;

        this.name = `${project.name} ${kubeClient} port forward ${portForward}`;
        this.label = this.name;

        // VS Code treats tasks with the same definition as the same task, so the definition must correspond one-to-one to a project.
        // IE if the definition was just "codewind port-forward", a second project's port-forward would not run because the task is already running.
        this.definition = { type: this.name + ` ${project.id}` };
        this.source = `Codewind`;

        this.command = kubeClient;
        this.args = [
            "port-forward",
            "-n", project.namespace,
            `pod/${project.podName}`,
            portForward,
        ];

        this.execution = new vscode.ShellExecution(this.command, this.args, {});
        Log.i(`Created PortForwardTask ${this.name}`);
    }

    public async run(): Promise<void> {
        Log.i(`Running port-forward task: ${this.execution.command} ${this.execution.args.join(" ")}`);
        this.task = await vscode.tasks.executeTask(this);

        this.taskListener = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task.name === this.name) {
                this.exitCode = e.exitCode;
                this.project.onPortForwardTaskTerminate(e.exitCode);
                this.taskListener?.dispose();
            }
        });

        // Wait briefly for the task to exit. If it exits in this time, it failed and we cannot proceed.
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this.exitCode) {
                    this.dispose();
                    return reject(`${this.name} failed with exit code ${this.exitCode}. See the task output in the Terminal view for details.`);
                }
                else {
                    // No exit code implies the task did not exit and should have succeeded.
                    resolve();
                }
            }, 3000);
        })
    }

    public dispose(): void {
        this.task?.terminate();
        Log.i(`${this.name} terminated with code ${this.exitCode}`);
    }
}
