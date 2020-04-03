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

import WebviewUtil from "../WebviewUtil";
import { WebviewResourceProvider } from "../WebviewWrapper";
import { ThemedImages, ThemelessImages } from "../../../constants/CWImages";
import { CWConfigurations } from "../../../constants/Configurations";
import { HomePageWVMessages, CREATE_PROJECT_DATA, ADD_PROJECT_DATA } from "../HomePageWrapper";
import CWDocs from "../../../constants/CWDocs";
import { USEFUL_EXTENSIONS } from "../UsefulExtensionsPageWrapper";
import CLILifecycleWrapper from "../../../codewind/cli/CLILifecycleWrapper";

export const DOCKER_INSTALL_URL = "https://docs.docker.com/install/";

export default function getHomePage(
    rp: WebviewResourceProvider, localCWInstallStatus: CLILifecycleWrapper.LocalCWInstallStatus, doesARemoteConnectionExist: boolean): string {

    const isDockerStarted = localCWInstallStatus !== "no-docker";
    const isLocalStarted = localCWInstallStatus === "started-correct-version";

    return `
    <!DOCTYPE html>
    <html>
    ${WebviewUtil.getHead(rp, "homepage.css")}
    <body>
    <div id="content">
        <div id="home-title-section">
            <img id="logo" alt="Codewind Logo" src="${rp.getImage(ThemelessImages.Logo)}"/>
            <div id="home-title-left">
                <div id="home-title">Codewind</div>
                <div id="home-subtitle">Container development unleashed</div>
            </div>
            <div id="home-title-right">
                <input type="checkbox" id="show-this-page-checkbox"
                    ${CWConfigurations.SHOW_HOMEPAGE.get() ? "checked" : ""}
                    onclick="sendMsg('${HomePageWVMessages.SHOW_ON_START}', this.checked)"
                />
                <label for="show-this-page-checkbox">Show Home on startup</label>
            </div>
        </div>
        <div id="home-main-section">
            <div id="left-section">
                <div id="welcome-section">
                    <div id="welcome-text">
                        <h2>Welcome</h2>
                        <p>
                            Codewind simplifies and enhances development in containers by extending your IDE
                            with features to write, debug, and deploy cloud-native applications.
                            <br><br>
                            Locate the
                            <a title="Open the Codewind View" onclick="sendMsg('${HomePageWVMessages.OPEN_CODEWIND_VIEW}')" tabindex="0">
                                Codewind View
                            </a>
                            within the Explorer View.
                            Here you can access commonly used commands through buttons and right-click menus.
                        </p>
                    </div>
                    <div id="view-location-screenshot-container">
                        <img src="${rp.getImage(ThemelessImages.Welcome_Screenshot)}" id="view-location-screenshot" class="clickable"
                            alt="Codewind view"
                            title="Open the Codewind view"
                            onclick="sendMsg('${HomePageWVMessages.OPEN_CODEWIND_VIEW}')"
                        />
                    </div>
                </div>
                <div id="quick-start-section">
                    <h2>Quick Start</h2>
                    <div id="quick-start-text">
                        <p>
                            Get started quickly with templates or pull in your applications and let Codewind prepare them for the cloud.<br>
                            Choose whether you want to build and run your project
                            <a href="${CWDocs.FIRST_PROJECT_LOCAL.uri}">locally</a>
                            or
                            <a href="${CWDocs.REMOTE_DEPLOYING.uri}">remotely</a>.
                        </p>
                    </div>
                    <div id="local-remote-tabgroup">
                        <div id="local-tab" class="clickable quick-start-tab selected" onclick="toggleQuickStart(this)" tabindex="0">
                            <img src="${rp.getImage(ThemedImages.Local_Connected)}" alt="Local" title="Local"/>Local
                        </div>
                        <div id="remote-tab" class="clickable quick-start-tab" onclick="toggleQuickStart(this)" tabindex="0">
                            <img src="${rp.getImage(ThemedImages.Connection_Connected, "dark")}" alt="Remote" title="Remote"/>Remote
                        </div>
                    </div>
                    <div id="local-steps" class="quickstart-steps">
                        <div class="steps-section">
                            <div class="steps-header">Set-up</div>
                            <div>Step 1</div>
                            <div class="step-btn btn btn-prominent" title="${DOCKER_INSTALL_URL}"
                                onclick="sendMsg('${HomePageWVMessages.INSTALL_DOCKER}')" tabindex="0"
                            >
                                Install and Start Docker
                                ${isDockerStarted ?
                                    `<img src="${rp.getImage(ThemelessImages.Connected_Checkmark)}" alt="Complete" title="Complete"/>`
                                    :
                                    `<img src="${rp.getImage(ThemelessImages.Download)}" alt="Download"/>`
                                }
                            </div>
                            <div>Step 2</div>
                            <div class="step-btn btn btn-prominent" title="Start Local Codewind"
                                onclick="sendMsg('${HomePageWVMessages.START_LOCAL}')" tabindex="0"
                            >
                                Start Local Codewind
                                ${isLocalStarted ?
                                    `<img src="${rp.getImage(ThemedImages.Local_Connected, "dark")}" alt="Complete" title="Complete"/>`
                                    :
                                    `<img src="${rp.getImage(ThemedImages.Local_Disconnected, "dark")}" alt="Start Local Codewind"/>`
                                }
                            </div>
                        </div>
                        <div class="step-separator"></div>
                        ${getStartProjectStepsSection(rp, isLocalStarted, false)}
                    </div>
                    <div id="remote-steps" class="quickstart-steps" style="display: none">
                        <div class="steps-section">
                            <div class="steps-header">Set-up</div>
                            <div>Step 1</div>
                            <div class="step-btn btn btn-prominent" title="New Codewind Connection"
                                onclick="sendMsg('${HomePageWVMessages.NEW_REMOTE_CONNECTION}')" tabindex="0"
                            >
                                New Codewind Connection
                                ${doesARemoteConnectionExist ?
                                    `<img src="${rp.getImage(ThemelessImages.Connected_Checkmark, "dark")}" alt="Complete" title="Complete"/>`
                                    :
                                    `<img src="${rp.getImage(ThemedImages.New_Connection, "dark")}" alt="New Codewind Connection"/>`
                                }
                            </div>
                        </div>
                        <div class="step-separator"></div>
                        ${getStartProjectStepsSection(rp, doesARemoteConnectionExist, true)}
                    </div>
                </div>
            </div>  <!-- End left side -->
            <div id="right-section">
                <h2>Learn</h2>
                <div class="learn-card">
                    <div class="learn-card-header">
                        <a href="${CWDocs.COMMANDS_OVERVIEW.uri}">
                            <h3>Commands</h3>
                            <input type="image" alt="Open Commands" src="${rp.getImage(ThemedImages.Launch)}" tabindex="-1"/>
                        </a>
                    </div>
                    <p>
                        Access all commands by opening the
                        <a href="https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette">Command Palette</a>
                        and typing <b>Codewind</b>.
                        For more information, see the <a href="${CWDocs.COMMANDS_OVERVIEW.uri}">Commands Overview</a>.
                    </p>
                </div>
                <div class="learn-card">
                    <div class="learn-card-header">
                        <a href="${CWDocs.HOME.uri}">
                            <h3>Docs</h3>
                            <input type="image" alt="Open Docs" src="${rp.getImage(ThemedImages.Launch)}" tabindex="-1"/>
                        </a>
                    </div>
                    <p>
                        Find the instructions on how to use Codewind.
                        Documentation includes
                        <a href="${CWDocs.REMOTE_DEPLOYING.uri}">Deploying Codewind Remotely</a> and
                        <a href="${CWDocs.PERF_MONITORING.uri}">Performance Monitoring</a>.
                    </p>
                </div>
                <div class="learn-card">
                    <div class="learn-card-header">
                        <a title="Useful Extensions" onclick="sendMsg('${HomePageWVMessages.OPEN_USEFUL_EXTENSIONS}')">
                            <h3>Useful Extensions</h3>
                            <input type="image"
                                title="Open Useful Extensions"
                                alt="Open Useful Extensions"
                                src="${rp.getImage(ThemedImages.Split_Horizontal)}"
                            />
                        </a>
                    </div>
                    <p>
                        Access a list of useful extensions that work well with Codewind, such as the
                        ${getUsefulExtensionA("NODE_PROFILER")},
                        ${getUsefulExtensionA("OPENAPI_TOOLS")} and
                        ${getUsefulExtensionA("DOCKER")}.
                    </p>
                </div>
            </div>
        </div>  <!-- End main section -->
    </div>  <!-- End content -->

    <script>
        const vscode = acquireVsCodeApi();

        function sendMsg(type, data = undefined) {
            const msg = { type: type, data: data };
            // console.log("Send message " + JSON.stringify(msg));
            vscode.postMessage(msg);
        }

        function toggleQuickStart(toggleTab) {
            const classList = Array.from(toggleTab.classList);
            if (classList.some((clazz) => clazz === "selected")) {
                // it's already selected, no-op
                return;
            }

            const isLocal = toggleTab.id.includes("local");         // else, it is remote
            // if local was selected, hide remote and show local. else, do the opposite

            // select the one that was clicked and deselect the other one
            toggleTab.classList.add("selected");
            const otherToggleTabID = isLocal ? "remote-tab" : "local-tab";
            document.querySelector("#" + otherToggleTabID).classList.remove("selected");

            // show the steps for the tab that was clicked and hide the other ones
            const stepsStyle = "inline-flex";
            document.querySelector("#local-steps").style.display = isLocal ? stepsStyle : "none";
            document.querySelector("#remote-steps").style.display = isLocal ? "none" : stepsStyle;
        }
    </script>
    </body>
    </html>
`;
}

function getStartProjectStepsSection(rp: WebviewResourceProvider, isEnabled: boolean, isRemote: boolean): string {
    const onClickMsg = isRemote ? HomePageWVMessages.PROJECT_REMOTE : HomePageWVMessages.PROJECT_LOCAL;
    const stepIndex = isRemote ? 2 : 3;

    const btnClasses = "step-btn btn " + (isEnabled ? "btn-prominent" : "btn-disabled");

    return `
    <div class="project-steps-section">
        <div class="steps-header">Start a Project</div>
        <div>Step ${stepIndex}</div>
        <div class="steps-section">
            <div class="${btnClasses}" title="${isEnabled ? "Create New Project" : "Complete the Set-up before creating a project"}" tabindex="0"
                ${isEnabled ? `onclick="sendMsg('${onClickMsg}', '${CREATE_PROJECT_DATA}')"` : ""}
            >
                <div>Create New Project</div>
                <img src="${rp.getImage(ThemedImages.New, "dark")}" alt="Create New Project"/>
            </div>
            <div class="project-step-or">
                or
            </div>
            <div class="${btnClasses}" title="${isEnabled ? "Add Existing Project" : "Complete the Set-up before adding a project"}" tabindex="0"
                ${isEnabled ? `onclick="sendMsg('${onClickMsg}', '${ADD_PROJECT_DATA}')"` : ""}
            >
                <div>Add Existing Project</div>
                <img src="${rp.getImage(ThemedImages.Bind, "dark")}" alt="Add Existing Project"/>
            </div>
        </div>
    </div>`;
}

function getUsefulExtensionA(extensionKey: keyof typeof USEFUL_EXTENSIONS): string {
    const extension = USEFUL_EXTENSIONS[extensionKey];
    return `<a href="${extension.link}">${extension.name}</a>`;
}
