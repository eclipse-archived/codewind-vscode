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

import Log from "../../Logger";
import Connection from "../../codewind/connection/Connection";
import MCUtil from "../../MCUtil";
import UserProjectCreator, { ICWTemplateData } from "../../codewind/connection/UserProjectCreator";
import Requester from "../../codewind/project/Requester";
import { isRegistrySet, onRegistryNotSet } from "../../codewind/connection/Registry";
import openWorkspaceCmd from "../OpenWorkspaceCmd";
import manageTemplateReposCmd, { refreshManageReposPage } from "./ManageTemplateReposCmd";
import Resources from "../../constants/Resources";

const CREATE_PROJECT_WIZARD_TITLE = "Create a New Project";
const CREATE_PROJECT_WIZARD_NO_STEPS = 2;
const BACK_BTN_MSG = "Back button";

const HAS_SELECTED_SOURCE_KEY = "first-create-done";

export default async function createProject(connection: Connection): Promise<void> {
    if (!(await isRegistrySet(connection))) {
        onRegistryNotSet(connection);
        return;
    }

    // On initial project create, prompt the user to select a template source
    const extState = global.extGlobalState as vscode.Memento;
    const hasSelectedSource = extState.get(HAS_SELECTED_SOURCE_KEY) as boolean;
    if (!hasSelectedSource) {
        const selectedSource = await showTemplateSourceQuickpick(connection);
        if (selectedSource == null) {
            return;
        }
        extState.update(HAS_SELECTED_SOURCE_KEY, true);
        if (selectedSource === "managed") {
            manageTemplateReposCmd(connection);
            // Don't continue with the create in this case.
            return;
        }
        await refreshManageReposPage(connection);
    }

    try {
        let template: ICWTemplateData | undefined;
        let projectName: string | undefined;
        while (!template || !projectName) {
            template = await promptForTemplate(connection);
            if (template == null) {
                return;
            }
            try {
                projectName = await promptForProjectName(template);
                if (projectName == null) {
                    return;
                }
            }
            catch (err) {
                if (err !== BACK_BTN_MSG) {
                    // unexpected error
                    throw err;
                }
                // else user clicked back, return to top of loop
            }
        }

        const response = await UserProjectCreator.createProject(connection, template, projectName);
        if (!response) {
            // user cancelled
            return;
        }

        const createdMsg = `Created project ${response.projectName} at ${MCUtil.containerPathToFsPath(response.projectPath)}`;
        if (await MCUtil.isUserInCwWorkspaceOrProject()) {
            vscode.window.showInformationMessage(createdMsg);
        }
        else {
            showOpenWorkspacePrompt(connection, createdMsg);
        }
    }
    catch (err) {
        const errMsg = "Error creating new project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}

export async function showOpenWorkspacePrompt(connection: Connection, msg: string): Promise<void> {
    const openWorkspaceBtn = "Open Workspace";
    vscode.window.showInformationMessage(msg, openWorkspaceBtn)
    .then((res) => {
        if (res === openWorkspaceBtn) {
            openWorkspaceCmd(connection);
        }
    });
}

const MANAGE_SOURCES_ITEM = "Manage Template Sources";
async function showTemplateSourceQuickpick(connection: Connection): Promise<"selected" | "managed" | undefined> {
    const repos = await Requester.getTemplateSources(connection);

    if (repos.length === 0) {
        // Should not be possible because Codewind templates are always present.
        throw new Error("No template sources are configured. Use the Manage Template Sources command to add the Codewind templates.");
    }
    if (repos.length === 1) {
        // if there is exactly one repo, just enable it and move on.
        await Requester.enableTemplateRepos(connection, {
            repos: [{
                enable: true,
                repoID: repos[0].url,
            }]
        });
        return "selected";
    }

    const qpis: Array<({ url: string } & vscode.QuickPickItem)> = repos.map((repo) => {
        const label = repo.name || repo.description || "No name available";
        const description = repo.name ? repo.description : undefined;

        return {
            url: repo.url,
            label,
            description,
            detail: repo.url,
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
    const repoEnablement: Array<{ enable: boolean, repoID: string }> = repos.map((repo) => {
        return {
            enable: repo.url === selection.url,
            repoID: repo.url,
        };
    });

    await Requester.enableTemplateRepos(connection, { repos: repoEnablement });

    vscode.window.showInformationMessage(
        `Set template source to ${selection.label}. You can change this setting at any time with the Manage Template Sources command.`
    );
    return "selected";
}

const MANAGE_SOURCES_QP_BTN = "Manage Template Sources";

async function promptForTemplate(connection: Connection): Promise<ICWTemplateData | undefined> {

    const qp = vscode.window.createQuickPick();
    // busy and enabled have no effect in theia https://github.com/eclipse-theia/theia/issues/5059
    qp.busy = true;
    qp.enabled = false;
    qp.placeholder = "Fetching available project templates...";
    qp.buttons = [{
        iconPath: Resources.getIconPaths(Resources.Icons.Edit),
        tooltip: MANAGE_SOURCES_QP_BTN,
    }];

    qp.matchOnDetail = true;
    qp.canSelectMany = false;
    qp.step = 1;
    qp.totalSteps = CREATE_PROJECT_WIZARD_NO_STEPS;
    qp.title = CREATE_PROJECT_WIZARD_TITLE;
    qp.ignoreFocusOut = true;

    if (!global.isTheia) {
        // Theia quickpicks misbehave if the quickpick is shown before populating the items
        // https://github.com/eclipse-theia/theia/issues/6221#issuecomment-533268856
        // In VS Code, the items are populated after showing, so we can show the quickpick sooner, which looks better.
        qp.show();
    }

    const templateQpis = await getTemplateQpis(connection);
    if (templateQpis == null) {
        // getTemplateQpis will have shown the error message
        return undefined;
    }

    qp.items = templateQpis;
    qp.placeholder = "Select the project type to create";
    qp.busy = false;
    qp.enabled = true;

    if (global.isTheia) {
        // it wasn't shown above, so show it now
        qp.show();
    }

    const qpiSelection = await new Promise<readonly vscode.QuickPickItem[] | undefined>((resolve) => {
        qp.onDidTriggerButton((btn) => {
            if (btn.tooltip === MANAGE_SOURCES_QP_BTN) {
                manageTemplateReposCmd(connection);
                resolve(undefined);
            }
        });

        qp.onDidHide((_e) => {
            resolve(undefined);
        });

        // it looks funny to use onDidChangeSelection instead of onDidAccept,
        // but it behaves the same when there's just one item since we can only make one selection.
        // this is a workaround for https://github.com/eclipse-theia/theia/issues/6221

        // qp.onDidAccept(() => {
        //     Log.d("onDidAccept, qp.selectedItems are", qp.selectedItems);
        //     resolve(qp.selectedItems);
        // });
        qp.onDidChangeSelection((selection) => {
            // Log.d("onDidChangeSelection, qp.selectedItems are", qp.selectedItems);
            // Log.d("onDidChangeSelection, selection is ", selection);
            resolve(selection);
        });
    })
    .finally(() => qp.dispose());

    // there are either 1 or 0 items selected because canSelectMany is false
    if (qpiSelection == null || qpiSelection.length === 0 || qpiSelection[0] == null) {
        return undefined;
    }
    const selected = qpiSelection[0];

    // map the selected QPI back to the template it represents
    const selectedProjectType = templateQpis.find((type) => selected.label === type.label);
    if (selectedProjectType == null) {
        // should never happen
        throw new Error(`Could not find template ${selected.label}`);
    }
    return selectedProjectType;
}

async function getTemplateQpis(connection: Connection): Promise<Array<vscode.QuickPickItem & ICWTemplateData> | undefined>  {
    const templates = (await Requester.getTemplates(connection));
    const noEnabledSources = (await Requester.getTemplateSources(connection)).filter((source) => source.enabled).length;

    if (noEnabledSources > 1) {
        // Append the source to the label to clarify which template came from where
        templates.forEach((template) => {
            const source = template.source || "Unnamed source";
            template.label += ` (${source})`;
        });
    }

    const templateQpis = templates.map((template) => {
            return {
                ...template,
                detail: template.language,
                extension: template.url,
            };
        });

    if (templateQpis.length === 0) {
        // The user has no repos or has disabled all repos
        const manageReposBtn = "Manage Template Sources";
        await vscode.window.showErrorMessage(
            "You have no enabled template sources. You must enable at least one template source in order to create projects.",
            manageReposBtn)
        .then((res) => {
            if (res === manageReposBtn) {
                manageTemplateReposCmd(connection);
            }
        });

        return undefined;
    }
    return templateQpis;
}

async function promptForProjectName(template: ICWTemplateData): Promise<string | undefined> {
    const projNamePlaceholder = `my-${template.language}-project`;
    const projNamePrompt = `Enter a name for your new ${template.language} project`;

    const ib = vscode.window.createInputBox();
    ib.title = CREATE_PROJECT_WIZARD_TITLE;
    ib.step = 2;
    ib.totalSteps = CREATE_PROJECT_WIZARD_NO_STEPS;
    ib.buttons = [ vscode.QuickInputButtons.Back ];
    ib.placeholder = projNamePlaceholder;
    ib.prompt = projNamePrompt;
    ib.ignoreFocusOut = true;

    ib.onDidChangeValue((projName) => {
        ib.validationMessage = validateProjectName(projName);
    });

    return new Promise<string | undefined>((resolve, reject) => {
        ib.show();
        ib.onDidHide((_e) => {
            resolve(undefined);
        });
        ib.onDidAccept((_e) => {
            resolve(ib.value);
        });
        ib.onDidTriggerButton((_btn) => {
            // back button is the only button
            reject(BACK_BTN_MSG);
        });
    })
    .finally(() => ib.dispose());
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
