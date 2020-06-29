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
import InputUtil from "../../InputUtil";

const LINK_WIZARD_TITLE = "Link Project";
const LINK_WIZARD_TOTAL_STEPS = 2;

function getMoreInfoBtn(): InputUtil.InputUtilButton {
    return {
        iconPath: ThemedImages.Info,
        tooltip: `More Info`,
        onClick: onDidClickMoreInfo,
    };
}

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
            if (err !== InputUtil.BTN_BACK) {
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
    if (!project.state.isEnabled) {
        return;
    }

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

    const otherProjectQPOptions: InputUtil.QuickPickOptions<Project> = {
        items: thisConnectionOtherProjects,
        buttons: [ getMoreInfoBtn() ],
        placeholder: `Select the project you want ${firstProject.name} to link to.`,
        stepNum: {
            step: 1,
            totalSteps: LINK_WIZARD_TOTAL_STEPS,
        },
        title: LINK_WIZARD_TITLE
    };

    return InputUtil.showQuickPick(otherProjectQPOptions);
}

async function getLinkEnvVar(firstProject: Project, linkProjectName: string, isInWizard: boolean): Promise<string | undefined> {
    const envVarInputOptions: InputUtil.InputBoxOptions = {
        buttons: [ getMoreInfoBtn() ],
        placeholder: (MCUtil.slug(linkProjectName) + "_HOST")
            .replace(/-/g, "_")
            .toUpperCase(),
        prompt: `Enter a name for the environment variable that you want to expose in ${firstProject}. ` +
            `This variable contains the domain (hostname) of ${linkProjectName}.`,
        validator: validateEnvVar
    };

    if (isInWizard) {
        envVarInputOptions.stepNum = {
            step: 2,
            totalSteps: LINK_WIZARD_TOTAL_STEPS
        };
        envVarInputOptions.title = LINK_WIZARD_TITLE;
        envVarInputOptions.showBackBtn = true;
    }
    else {
        envVarInputOptions.title = "Rename Environment Variable";
    }

    return InputUtil.showInputBox(envVarInputOptions);
}

function onDidClickMoreInfo(): void {
    CWDocs.PROJECT_LINKS.open();
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
