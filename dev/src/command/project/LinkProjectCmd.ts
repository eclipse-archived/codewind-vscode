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

import Project from "../../codewind/project/Project";
import { ThemedImages } from "../../constants/CWImages";
import CWDocs from "../../constants/CWDocs";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";
import { CLICommandRunner } from "../../codewind/cli/CLICommandRunner";
import Translator from "../../constants/strings/Translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import projectOverviewCmd from "./ProjectOverviewCmd";

const LINK_WIZARD_TITLE = "Link Project";
const LINK_WIZARD_TOTAL_STEPS = 2;
const MORE_INFO_BTN = {
    iconPath: ThemedImages.Info,
    tooltip: `More Info`
};
const BACK_BTN_MSG = "Back button";

export default async function linkProjectCmd(project: Project, launchedThroughOverview: boolean = false): Promise<void> {

    if (!beforeModifyingLink(project)) {
        return;
    }

    let targetProject: Project | undefined;
    let envVarName: string | undefined;

    while (targetProject == null || envVarName == null) {
        targetProject = await getLinkTargetProject(project);
        if (targetProject == null) {
            return;
        }
        // Add a brief delay while the template picker disposes https://github.com/eclipse/codewind/issues/2330
        await MCUtil.delay(10);
        try {
            envVarName = await getLinkEnvVar(project, targetProject.name, true);
            if (envVarName == null) {
                return;
            }
        }
        catch (err) {
            if (err !== BACK_BTN_MSG) {
                throw err;
            }
        }
    }

    Log.i(`Linking ${project.name} to ${targetProject.name} through ${envVarName}`);
    try {
        await CLICommandRunner.addLink(project.id, targetProject.id, envVarName);

        const moreInfoBtn = Translator.t(StringNamespaces.ACTIONS, "moreInfo");
        const projectOverviewBtn = Translator.t(StringNamespaces.ACTIONS, "openProjectOverview");

        let successMsg = `${project.name} is now connected to ${targetProject.name} through ${envVarName}.`;
        const btns = [ moreInfoBtn ];
        if (!launchedThroughOverview) {
            btns.push(projectOverviewBtn);
            successMsg += ` To manage links, go to the Project Overview page.`;
        }

        vscode.window.showInformationMessage(successMsg, ...btns)
        .then((res) => {
            if (res === moreInfoBtn) {
                onDidClickMoreInfo();
            }
            else if (res === projectOverviewBtn) {
                projectOverviewCmd(project, true);
            }
        });
        afterModifyingLink(project);
    }
    catch (err) {
        const errMsg = `Error linking ${project.name} to ${targetProject.name}`;
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
    }
}

export async function renameProjectLink(project: Project, targetProjectName: string, oldEnvName: string): Promise<void> {
    if (!beforeModifyingLink(project)) {
        return;
    }

    const newEnvName = await getLinkEnvVar(project, targetProjectName, false);
    if (newEnvName == null) {
        return;
    }

    await CLICommandRunner.renameLink(project.id, oldEnvName, newEnvName);
    vscode.window.showInformationMessage(`Renamed ${oldEnvName} to ${newEnvName}.`);
    afterModifyingLink(project);
}

export async function removeProjectLink(project: Project, envName: string): Promise<void> {
    if (!beforeModifyingLink(project)) {
        return;
    }

    await CLICommandRunner.removeLink(project.id, envName);
    vscode.window.showInformationMessage(`Removed ${envName} from ${project.name}.`);
    afterModifyingLink(project);
}

function beforeModifyingLink(project: Project): boolean {
    if (project.isRestarting) {
        vscode.window.showWarningMessage(`Wait for ${project.name} to finish restarting before modifying links.`);
        return false;
    }
    return true;
}

async function afterModifyingLink(project: Project): Promise<void> {
    try {
        await project.doRestart(project.startMode, true);
    }
    catch (err) {
        Log.e(`${project.name}: Failed to set pending restart after modifying link`, err);
    }
}

async function getLinkTargetProject(firstProject: Project): Promise<Project | undefined> {
    const thisConnectionOtherProjects = firstProject.connection.projects.filter((p) => p.id !== firstProject.id && p.state.isEnabled);
    if (thisConnectionOtherProjects.length === 0) {
        vscode.window.showWarningMessage(`There are no other projects on ${firstProject.connection.label}, so there is nothing to link to.`);
        return undefined;
    }

    const otherProjectQP = vscode.window.createQuickPick<Project>();
    otherProjectQP.ignoreFocusOut = true;
    otherProjectQP.buttons = [ MORE_INFO_BTN ];
    otherProjectQP.items = thisConnectionOtherProjects;
    otherProjectQP.placeholder = `Select the project you want ${firstProject.name} to link to.`;

    otherProjectQP.step = 1;
    otherProjectQP.totalSteps = LINK_WIZARD_TOTAL_STEPS;
    otherProjectQP.title = LINK_WIZARD_TITLE;

    otherProjectQP.onDidTriggerButton((_btn) => {
        // only button
        onDidClickMoreInfo();
    });

    return new Promise<Project | undefined>((resolve) => {
        otherProjectQP.onDidChangeSelection((selected) => {
            resolve(selected[0]);
        });
        otherProjectQP.onDidHide(() => {
            resolve(undefined);
        });

        otherProjectQP.show();
    })
    .finally(() => {
        otherProjectQP.dispose();
    });
}

async function getLinkEnvVar(firstProject: Project, linkProjectName: string, isInWizard: boolean): Promise<string | undefined> {
    const envVarIB = vscode.window.createInputBox();
    envVarIB.ignoreFocusOut = true;

    const btns: vscode.QuickInputButton[] = [ MORE_INFO_BTN ];
    if (isInWizard) {
        btns.push(vscode.QuickInputButtons.Back);
        envVarIB.step = 2;
        envVarIB.totalSteps = LINK_WIZARD_TOTAL_STEPS;
        envVarIB.title = LINK_WIZARD_TITLE;
    }
    else {
        envVarIB.title = "Rename Environment Variable";
    }
    envVarIB.buttons = btns;

    envVarIB.placeholder = (MCUtil.slug(linkProjectName) + "_HOST")
        .replace(/-/g, "_")
        .toUpperCase();

    envVarIB.prompt = `Enter a name for the environment variable that you want to expose in ${firstProject}. ` +
        `This variable contains the domain (hostname) of ${linkProjectName}.`;

    return new Promise<string | undefined>((resolve, reject) => {
        envVarIB.onDidTriggerButton((btn) => {
            if (btn.iconPath === MORE_INFO_BTN.iconPath) {
                onDidClickMoreInfo();
            }
            else if (btn.iconPath === vscode.QuickInputButtons.Back.iconPath) {
                return reject(BACK_BTN_MSG);
            }
        });

        envVarIB.onDidChangeValue((value) => {
            const errMsg = validateEnvVar(value);
            envVarIB.validationMessage = errMsg;
        });

        envVarIB.onDidAccept(() => {
            if (envVarIB.validationMessage) {
                return;
            }
            resolve(envVarIB.value)
        });
        envVarIB.onDidHide(() => {
            resolve(undefined);
        });

        envVarIB.show();
    })
    .finally(() => envVarIB.dispose());
}

function onDidClickMoreInfo(): void {
    // TODO link
    CWDocs.HOME.open();
}

function validateEnvVar(input: string): string | undefined {
    if (input.length === 0) {
        return `Enter a name for the environment variable.`;
    }
    if (input[0] >= "0" && input[0] <= "9") {
        return `Environment variables may not start with a number.`;
    }
    if(!/^[a-zA-Z0-9_]+$/.test(input)){
        return `Environment variables may only contain alphanumeric characters and underscores.`;
    }
    return undefined;
}
