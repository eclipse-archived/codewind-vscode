/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as rmrf from "rimraf";

import Project from "./Project";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Requester from "./Requester";
import Log from "../../Logger";
import * as MCUtil from "../../MCUtil";

import { Editable } from "../project/ProjectOverviewPage";

/**
 * Actions which execute on projects and do not map directly to a Command.
 */

namespace MiscProjectActions {

    /**
     * @param prompt - Set this to `false` to skip prompting the user, and instead just do the unbind & delete silently.
     */
    export async function unbind(project: Project, prompt: boolean = true): Promise<void> {
        let doDeleteProjectDir: boolean;

        if (prompt) {
            const deleteMsg = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteProjectMsg", { projectName: project.name });
            const deleteBtn = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteBtn", { projectName: project.name });

            const deleteRes = await vscode.window.showInformationMessage(deleteMsg, { modal: true }, deleteBtn);
            if (deleteRes !== deleteBtn) {
                // cancelled
                return;
            }

            const projectDirPath: string = project.localPath.fsPath;

            const deleteDirMsg = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirMsg", { dirPath: projectDirPath });
            const deleteDirBtn = Translator.t(StringNamespaces.CMD_MISC, "alsoDeleteDirBtn");
            // const dontDeleteDirBtn = Translator.t(StringNamespaces.CMD_MISC, "dontDeleteDirBtn");
            // const deleteNeverBtn = Translator.t(StringNamespaces.CMD_MISC, "neverDeleteDirBtn");
            // const deleteAlwaysBtn = Translator.t(StringNamespaces.CMD_MISC, "alwaysDeleteDirBtn");
            const deleteDirRes = await vscode.window.showWarningMessage(deleteDirMsg, { modal: true },
                deleteDirBtn, /* dontDeleteDirBtn  deleteNeverBtn, deleteAlwaysBtn */);

            doDeleteProjectDir = deleteDirRes === deleteDirBtn;
        }
        else {
            doDeleteProjectDir = true;
        }

        await Promise.all([
            Requester.requestUnbind(project),
            doDeleteProjectDir ? deleteProjectDir(project) : Promise.resolve(),
        ]);
    }

    async function deleteProjectDir(project: Project): Promise<void> {
        const projectDirPath = project.localPath.fsPath;
        return vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: `Deleting ${projectDirPath}...`,
        }, (_progress) => {
            return new Promise<void>((resolve, _reject) => {
                rmrf(projectDirPath, { glob: false }, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage(`Failed to delete ${project.name} directory: ${MCUtil.errToString(err)}`);
                    }
                    return resolve();
                });
            });
        });
    }

    export async function editSetting(type: Editable, project: Project): Promise<void> {
        // https://github.ibm.com/dev-ex/iterative-dev/wiki/File-watcher-External-APIs#post-apiv1projectsprojectidsettings
        let userFriendlySetting: string;
        let settingKey: string;
        let currentValue: OptionalString;
        switch (type) {
            case Editable.CONTEXT_ROOT: {
                userFriendlySetting = "application endpoint path";
                settingKey = "contextRoot";
                currentValue = project.contextRoot;
                if (currentValue.startsWith("/")) {
                    currentValue = currentValue.substring(1, currentValue.length);
                }
                break;
            }
            case Editable.APP_PORT: {
                userFriendlySetting = "application port";
                settingKey = "internalAppPort";
                currentValue = project.ports.internalPort ? project.ports.internalPort.toString() : undefined;
                break;
            }
            case Editable.DEBUG_PORT: {
                userFriendlySetting = "debug port";
                settingKey = "internalDebugPort";
                currentValue = project.ports.internalDebugPort ? project.ports.internalDebugPort.toString() : undefined;
                break;
            }
            default: {
                Log.e("Unrecognized editable type: ", type);
                return;
            }
        }

        const options: vscode.InputBoxOptions = {
            prompt: `Enter a new ${userFriendlySetting} for ${project.name}`,
            value: currentValue,
            valueSelection: undefined,
        };

        const isPort: boolean = type === Editable.APP_PORT || type === Editable.DEBUG_PORT;

        if (isPort) {
            options.validateInput = (inputToValidate: string): OptionalString => {
                if (!MCUtil.isGoodPort(Number(inputToValidate))) {
                    return Translator.t(StringNamespaces.DEFAULT, "invalidPortNumber", { port: inputToValidate });
                }
                return undefined;
            };
        }

        const input = await vscode.window.showInputBox(options);
        if (input == null) {
            return;
        }
        Log.i(`Requesting to change ${type} for ${project.name} to ${input}`);

        try {
            await Requester.requestSettingChange(project, userFriendlySetting, settingKey, input, isPort);
        }
        catch (err) {
            // requester will show the error
        }
    }
}

export default MiscProjectActions;
