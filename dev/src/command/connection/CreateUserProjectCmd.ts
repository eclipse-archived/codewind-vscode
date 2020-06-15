/*******************************************************************************
 * Copyright (c) 2019, 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as path from "path";

import Log from "../../Logger";
import Connection from "../../codewind/connection/Connection";
import MCUtil from "../../MCUtil";
import { CWConfigurations } from "../../constants/Configurations";
import RegistryUtils from "../../codewind/connection/registries/ImageRegistryUtils";
import { CLICommandRunner } from "../../codewind/cli/CLICommandRunner";
import manageSourcesCmd from "./ManageSourcesCmd";
import SocketEvents from "../../codewind/connection/SocketEvents";
import { ThemedImages } from "../../constants/CWImages";
import { CWTemplateData } from "../../codewind/Types";
import CWExtensionContext from "../../CWExtensionContext";
import InputUtil from "../../InputUtil";

const CREATE_PROJECT_WIZARD_NO_STEPS = 2;

const HAS_SELECTED_SOURCE_KEY = "first-create-done";

export default async function createProjectCmd(connection: Connection): Promise<void> {
    if (!connection.isRemote) {
        // On initial project create, prompt the user to select a template source
        const extState = CWExtensionContext.get().globalState;
        const hasSelectedSource = extState.get(HAS_SELECTED_SOURCE_KEY) as boolean;
        if (!hasSelectedSource) {
            try {
                const selectedSource = await showTemplateSourceQuickpick(connection);
                if (selectedSource == null) {
                    return;
                }

                if (connection.sourcesPage) {
                    connection.sourcesPage.refresh();
                }

                extState.update(HAS_SELECTED_SOURCE_KEY, true);
                if (selectedSource === "managed") {
                    manageSourcesCmd(connection);
                    // Don't continue with the create in this case.
                    return;
                }
            }
            catch (err) {
                const errMsg = `Error fetching template sources`;
                Log.e(errMsg, err);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(err)}`);
            }
        }
    }

    try {
        let template: CWTemplateData | undefined;
        let projectName: string | undefined;
        while (!template || !projectName) {
            template = await promptForTemplate(connection);
            if (template == null) {
                return;
            }
            else if (await RegistryUtils.doesNeedPushRegistry(template.projectType, connection)) {
                // The user needs to configure a push registry before they can create this type of project
                return;
            }

            // Add a brief delay while the template picker disposes https://github.com/eclipse/codewind/issues/2330
            await MCUtil.delay(10);

            try {
                projectName = await promptForProjectName(connection, template);
                if (projectName == null) {
                    return;
                }
            }
            catch (err) {
                if (err !== InputUtil.BTN_BACK) {
                    // unexpected error
                    throw err;
                }
                // else user clicked back, return to top of loop
            }
        }

        const parentDir = await getParentDirectory();
        if (parentDir == null) {
            // cancelled
            return undefined;
        }

        const response = await createProject(connection, template, parentDir, projectName);
        vscode.window.showInformationMessage(`Created project ${response.projectName} at ${MCUtil.containerPathToFsPath(response.projectPath)}`);
    }
    catch (err) {
        const errMsg = "Error creating new project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}

const MANAGE_SOURCES_ITEM = "Template Source Manager";

async function showTemplateSourceQuickpick(connection: Connection): Promise<"selected" | "managed" | undefined> {
    const sources = await connection.templateSourcesList.get();

    if (sources.length === 0) {
        // Should not be possible because Codewind templates are always present.
        throw new Error("No template sources are configured. Use the Template Source Manager command to add the Codewind templates.");
    }
    if (sources.length === 1) {
        // if there is exactly one repo, just enable it and move on.
        await connection.templateSourcesList.toggleEnablement({
            repos: [{
                enable: true,
                repoID: sources[0].url,
            }]
        });
        return "selected";
    }

    const qpis: ({ url: string } & vscode.QuickPickItem)[] = sources.map((repo) => {
        const label = repo.name || repo.description || "No name available";
        const description = repo.name ? repo.description : undefined;

        return {
            url: repo.url,
            label,
            // description: repo.url,
            detail: description,
        };
    });

    qpis.push({
        label: MANAGE_SOURCES_ITEM,
        detail: "Select multiple sources and learn more about template sources.",
        // special case
        url: "",
    });

    const selection = await vscode.window.showQuickPick(qpis, {
        placeHolder: `Select one of the template sources below, or select "${MANAGE_SOURCES_ITEM}".`
    });

    if (selection == null) {
        return undefined;
    }
    if (selection.label === MANAGE_SOURCES_ITEM) {
        return "managed";
    }

    // enable the selected repo, only
    const repoEnablement: { enable: boolean, repoID: string }[] = sources.map((repo) => {
        return {
            enable: repo.url === selection.url,
            repoID: repo.url,
        };
    });

    await connection.templateSourcesList.toggleEnablement({ repos: repoEnablement });

    vscode.window.showInformationMessage(
        `Set template source to ${selection.label}. The other sources have been disabled. ` +
        `You can change this setting at any time with the Template Source Manager command. `
    );
    return "selected";
}

function getWizardTitle(connection: Connection): string {
    return `(${connection.label}) Create a New Project`;
}

const MANAGE_SOURCES_QP_BTN = "Template Source Manager";

async function promptForTemplate(connection: Connection): Promise<CWTemplateData | undefined> {

    return InputUtil.showQuickPick<CWTemplateData>({
        items: {
            fetchItems: async () => {
                const templates = await getTemplateQpis(connection);
                if (templates == null) {
                    return [];
                }
                return templates;
            },
            fetchMsg: `Fetching project templates for ${connection.label}...`,
        },
        buttons: [{
            iconPath: ThemedImages.Edit,
            tooltip: MANAGE_SOURCES_QP_BTN,
            closeOnClick: true,
            onClick: () => manageSourcesCmd(connection)
        }],
        matchOnDetail: true,
        placeholder: "Select the project type to create",
        stepNum: {
            step: 1,
            totalSteps: CREATE_PROJECT_WIZARD_NO_STEPS,
        },
        title: getWizardTitle(connection),
    });
}

async function getTemplateQpis(connection: Connection): Promise<CWTemplateData[] | undefined>  {
    const templates = await connection.enabledTemplates;
    // if there are multiple sources enabled, we append the source name to the template label to clarify where the template is from
    const areMultipleSourcesEnabled = new Set(templates.map((template) => template.source)).size > 1;

    if (areMultipleSourcesEnabled) {
        templates.forEach((template) => {
            const source = template.source || "Unnamed source";
            template.label += ` (${source})`;
        });
    }

    const templateQpis = templates.map((template) => {
            return {
                ...template,
                description: MCUtil.uppercaseFirstChar(template.language),
                detail: template.description,
                extension: template.url,
            };
        });

    if (templateQpis.length === 0) {
        // The user has no repos or has disabled all repos
        const manageReposBtn = "Template Source Manager";
        vscode.window.showErrorMessage(
            "You have no enabled template sources. You must enable at least one template source in order to create projects.",
            manageReposBtn
        ).then((res) => {
            if (res === manageReposBtn) {
                manageSourcesCmd(connection);
            }
        });

        return undefined;
    }
    return templateQpis;
}

async function promptForProjectName(connection: Connection, template: CWTemplateData): Promise<string | undefined> {
    return InputUtil.showInputBox({
        title: getWizardTitle(connection),
        stepNum: {
            step: 2,
            totalSteps: CREATE_PROJECT_WIZARD_NO_STEPS,
        },
        showBackBtn: true,
        placeholder: `my-${template.language}-project`,
        prompt: `Enter a name for your new ${template.language} project`,
        validator: validateProjectName,
    });
}

/**
 * Get parent directory to create the project under.
 */
async function getParentDirectory(): Promise<vscode.Uri | undefined> {
    // if in che or alwaysCreateInWorkspace, then create in the one workspace folder.

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
        && (CWExtensionContext.get().isChe || CWConfigurations.ALWAYS_CREATE_IN_WORKSPACE.get())) {

        // if it is a single-root workspace, create the project under that root
        if (vscode.workspace.workspaceFolders.length === 1) {
            return vscode.workspace.workspaceFolders[0].uri;
        }
    }

    return MCUtil.promptForProjectDir("Select Parent Directory");
}

const ILLEGAL_CHARS = [
    `"`, "/", "\\", "?", "%", "*", ":", "|", "<", ">", "&", " "
];

function validateProjectName(projectName: string): string | undefined {
    const firstIllegalChar = [...projectName].find((c) => ILLEGAL_CHARS.includes(c));

    if (firstIllegalChar != null) {
        return `Invalid project name "${projectName}". Project names may not contain "${firstIllegalChar}"`;
    }

    // const matches: boolean = /^[a-z0-9_.-]+$/.test(projectName);
    // if (!matches) {
    // tslint:disable-next-line: max-line-length
    //     return `Invalid project name "${projectName}". Project name can only contain numbers, lowercase letters, periods, hyphens, and underscores.`;
    // }
    return undefined;
}

export async function createProject(connection: Connection, template: CWTemplateData, parentDir: vscode.Uri, projectName: string)
    : Promise<{ projectName: string, projectPath: string, projectID: string }> {

    const projectPath = path.join(parentDir.fsPath, projectName);
    const creationResult = await vscode.window.withProgress({
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: `Creating ${projectName} into ${projectPath}...`
    }, async () => {
        const creationRes = await CLICommandRunner.createProject(connection.id, projectPath, template.url);
        if (creationRes.status !== SocketEvents.STATUS_SUCCESS) {
            // failed
            let failedReason = `Unknown error creating ${projectName} at ${projectPath}`;
            try {
                failedReason = (creationRes.result as any).error || creationRes.result as string;
            }
            // tslint:disable-next-line: no-empty
            catch (err) {}
            throw new Error(failedReason);
        }

        // create succeeded, now we bind
        const projectType = { projectType: template.projectType, language: template.language };
        return CLICommandRunner.bindProject(connection.id, projectName, projectPath, projectType);
    });

    return { projectName, projectPath, projectID: creationResult.projectID };
}
