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
import got, { HTTPError, GotError } from "got";
import { URL } from "url";

import InputUtil from "../../InputUtil";
import { ThemedImages } from "../../constants/CWImages";
import CWDocs from "../../constants/CWDocs";
import { NewTemplateSource, TemplateSourceAuth, TemplateSourceAuthType } from "../Types";
import MCUtil from "../../MCUtil";
import Log from "../../Logger";

interface NameAndDescription {
    name: string,
    description?: string
}

namespace TemplateSourceWizard {

    const ADD_SOURCE_WIZARD_TITLE = "Add New Source";
    const AUTH_REQD_STATUS_CODES = [ 401, 403, 404 ];

    function getMoreInfoBtn(): InputUtil.InputUtilButton {
        return {
            iconPath: ThemedImages.Info,
            tooltip: `More Info`,
            onClick: onDidClickMoreInfo,
        };
    }

    function onDidClickMoreInfo(): void {
        // TODO link
        CWDocs.HOME.open();
    }

    export async function startWizard(): Promise<NewTemplateSource | undefined> {

        let sourceUrl = await InputUtil.showInputBox({
            buttons: [ getMoreInfoBtn() ],
            placeholder: `https://raw.githubusercontent.com/codewind-resources/codewind-templates/master/devfiles/index.json`,
            prompt: "Enter the URL to your template source's index file.",
            title: ADD_SOURCE_WIZARD_TITLE,
            validator: validateRepoURL,
        });

        if (!sourceUrl) {
            return undefined;
        }

        // truncate any querystring
        const sourceUrlAsUrl = new URL(sourceUrl);
        sourceUrlAsUrl.search = "";

        sourceUrl = sourceUrlAsUrl.toString();

        let testErr = await testSourceUrl(sourceUrl, `Testing ${sourceUrl}...`);
        let auth: TemplateSourceAuth | undefined;

        while (testErr instanceof got.GotError) {
            const statusCode = (testErr as any).response?.statusCode;
            if (testErr instanceof got.HTTPError && AUTH_REQD_STATUS_CODES.includes(statusCode)) {
                let baseErrMsg = `Codewind received HTTP status ${statusCode} when testing ${sourceUrl}`;
                if (auth != null) {
                    if (auth.type === "credentials") {
                        baseErrMsg += ` while logged in as ${auth.username}`;
                    }
                    else {
                        baseErrMsg += ` while using your access token`
                    }
                }
                baseErrMsg += ".\n\n";

                let detailErrMsg: string;

                if (statusCode === 404) {
                    if (auth == null) {
                        detailErrMsg = `This means the source requires authentication, ` +
                            `you do not have permission to access the source, or the source does not exist.`;
                    }
                    else {
                        detailErrMsg = `This means the authentication was rejected, ` +
                            `you do not have permission to access the source, or the source does not exist.`;
                    }
                }
                else if (statusCode === 403) {
                    detailErrMsg = "This means you do not have permission to see this source.";
                }
                else {
                    if (auth == null) {
                        detailErrMsg = "This means the source requires authentication.";
                    }
                    else {
                        detailErrMsg = "This means the authentication was rejected.";
                    }
                }

                const authBtn = auth == null ? "Authenticate" : "Re-enter authentication";
                const tryAgainBtn = "Re-enter URL";

                const res = await vscode.window.showWarningMessage(`${baseErrMsg}${detailErrMsg}`,
                    { modal: true },
                    authBtn, tryAgainBtn
                );

                if (res === authBtn) {
                    auth = await getRepoAuthInfo(sourceUrl);
                    if (auth == null) {
                        return undefined;
                    }

                    // retry the test, but with authentication info
                    testErr = await testSourceUrl(sourceUrl, `Testing authentication for ${sourceUrl}...`, auth);
                }
                else if (res === tryAgainBtn) {
                    return startWizard();
                }
                else {
                    // cancelled
                    return undefined;
                }
            }
            else {
                const errMsg = `Failed to add ${sourceUrl}`;
                Log.e(errMsg, testErr);
                vscode.window.showErrorMessage(`${errMsg}: ${MCUtil.errToString(testErr)}. ` +
                    `Please check the URL points to a valid templates index file.`)
                return undefined;
            }
        }

        // see if there is an existing name and description
        const templatesJsonLoc = sourceUrl.replace("index.json", "templates.json");
        const templatesJsonResponse = await testSourceUrl(templatesJsonLoc, `Fetching metadata from ${templatesJsonLoc}...`, auth);

        let existingNameAndDescription: NameAndDescription | undefined;
        if (!(templatesJsonResponse instanceof GotError)) {
            const templatesMetadata = templatesJsonResponse as any;
            if (templatesMetadata.name) {
                existingNameAndDescription = {
                    ...templatesMetadata,
                }
            }
            else {
                Log.w(`Got good response from ${templatesJsonLoc} but it didn't have the expected keys`, templatesJsonResponse);
            }
        }

        const nameAndDescription = await getNameAndDescription(sourceUrl, existingNameAndDescription);
        if (nameAndDescription == null) {
            return undefined;
        }

        return {
            url: sourceUrl,
            auth,
            ...nameAndDescription
        };
    }

    async function testSourceUrl(sourceUrl: string, msg: string, sourceAuth?: TemplateSourceAuth): Promise<HTTPError | GotError | object> {
        let authOptions = {};
        if (sourceAuth) {
            if (sourceAuth.type === "credentials") {
                authOptions = {
                    username: sourceAuth.username,
                    password: sourceAuth.password,
                };
            }
            else {
                authOptions = {
                    headers: {
                        Authorization: `Bearer ${sourceAuth.personalAccessToken}`
                    }
                }
            }
        }

        Log.d(`Testing new template source...`);

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: msg,
        }, async () => {
            try {
                const response = await got.get<object>(sourceUrl, {
                    responseType: "json",
                    ...authOptions,
                    timeout: 5000,
                    followRedirect: true,
                });

                return response.body;
            }
            catch (err) {
                return err;
            }
            // Log.d("res", res.body);
        });
    }

    async function getRepoAuthInfo(sourceUrl: string): Promise<TemplateSourceAuth | undefined> {
        Log.d(`Prompting for auth info for new template source`);
        const sourceUrlAsUri = vscode.Uri.parse(sourceUrl);

        const authType = await InputUtil.showQuickPick<vscode.QuickPickItem & { type: TemplateSourceAuthType }>({
            title: ADD_SOURCE_WIZARD_TITLE,
            buttons: [ getMoreInfoBtn() ],
            placeholder: `Select an authentication method for ${sourceUrlAsUri.authority}.`,
            items: [{
                label: `Username and Password`,
                detail: `Enter credentials for ${sourceUrlAsUri.authority}.`,
                type: "credentials"
            }, {
                label: `Access Token (Personal Access Token or Service Account Token)`,
                detail: `PAT used by services such as GitHub, GitLab, or SAT used by a stackhub.`,
                type: "pat"
            }]
        });

        if (authType == null) {
            return undefined;
        }

        if (authType.type === "pat") {
            const accessToken = await InputUtil.showInputBox({
                buttons: [ getMoreInfoBtn() ],
                prompt: `Enter your access token for ${sourceUrlAsUri.authority}.`,
                title: ADD_SOURCE_WIZARD_TITLE,
            });

            if (accessToken == null) {
                return undefined;
            };

            return {
                type: authType.type,
                personalAccessToken: accessToken,
            };
        }
        else {
            const username = await InputUtil.showInputBox({
                buttons: [ getMoreInfoBtn() ],
                placeholder: "username",
                prompt: `Enter your username for ${sourceUrlAsUri.authority}.`,
                title: ADD_SOURCE_WIZARD_TITLE,
            });

            if (username == null) {
                return undefined;
            }

            const password = await InputUtil.showInputBox({
                buttons: [ getMoreInfoBtn() ],
                password: true,
                prompt: `Enter your password for ${username} at ${sourceUrlAsUri.authority}.`,
                title: ADD_SOURCE_WIZARD_TITLE,
            });

            return {
                type: authType.type,
                username: username,
                password,
            };
        }
    }

    async function getNameAndDescription(sourceUrl: string, existing?: NameAndDescription): Promise<NameAndDescription | undefined> {
        let name = await InputUtil.showInputBox({
            title: ADD_SOURCE_WIZARD_TITLE,
            placeholder: "My Templates",
            prompt: `Enter a name for ${sourceUrl}`,
            value: existing?.name,
        });

        if (!name) {
            return undefined;
        }
        name = name.trim();

        let description = await InputUtil.showInputBox({
            title: ADD_SOURCE_WIZARD_TITLE,
            placeholder: "Description of My Templates",
            prompt: `(Optional) Enter a description for ${name}`,
            value: existing?.description,
        });

        if (description) {
            description = description.trim();
        }

        return {
            name, description
        };
    }

    function validateRepoURL(input: string): string | undefined {
        let asUrl: URL | undefined;
        try {
            // We use URL instead of vscode.Uri because the latter appears to throw errors irregularly.
            asUrl = new URL(input);
        }
        catch (err) {
            // not a url
        }

        if (!asUrl) {
            return "The repository URL must be a valid URL.";
        }
        else if (!asUrl.protocol.startsWith("http")) {
            return "The repository URL must be a valid http(s) URL.";
        }
        return undefined;
    }
}

export default TemplateSourceWizard;
