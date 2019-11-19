[![Marketplace](https://img.shields.io/vscode-marketplace/v/IBM.codewind.svg?label=marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=IBM.codewind)
[![License](https://img.shields.io/badge/License-EPL%202.0-red.svg?label=license&logo=eclipse)](https://www.eclipse.org/legal/epl-2.0/)
[![Build Status](https://ci.eclipse.org/codewind/buildStatus/icon?job=Codewind%2Fcodewind-vscode%2Fmaster)](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/job/master/)
[![Chat](https://img.shields.io/static/v1.svg?label=chat&message=mattermost&color=145dbf)](https://mattermost.eclipse.org/eclipse/channels/eclipse-codewind)

# Codewind for VS Code
Create and develop cloud-native, containerized web applications from VS Code.

## Installing Codewind
You can install Codewind locally in VS Code. For more information about installing Codewind, see [Installing Codewind for VS Code](https://www.eclipse.org/codewind/mdtvscinstallinfo.html).

Prerequisites
- Install [VS Code](https://code.visualstudio.com/download) 1.28.0 or later.
- Install Docker 17.06 or later.
- If you use Linux, you also need to install Docker Compose.

Complete the installation:
1. Find Codewind for VS Code in the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.codewind) or by searching for `Codewind` in the [VS Code Extensions view](https://code.visualstudio.com/docs/editor/extension-gallery#_browse-for-extensions).
2. Open the **Codewind** view in the Explorer view group or enter `Focus on Codewind View` into the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette). If you do not see the Codewind view in either the Explorer view or the **Command Palette**, the extension did not install correctly.
3. Choose **Install** when prompted to complete the installation of additional Docker images that Codewind requires to run. The installation may take a few minutes to complete.

## Using Codewind for VS Code
To see the actions available, open the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and type `Codewind`.</br>

Features:</br>
- [**Create New Project** and **Add Existing Project**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): Create new projects from application templates or import existing container-ready projects.
- [**Codewind view**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): View Codewind projects, including application and build statuses.
- [**Attach debugger**](https://www.eclipse.org/codewind/mdt-vsc-commands-restart-and-debug.html): Debug Microprofile, Spring, and Node.js projects in their containers.
- [**Show all logs**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): View application and build logs in the VS Code **Output** view.
- [**Open folder as workspace**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): View and edit project deployment information.
- [**Open container shell**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): Open a shell session into a Codewind application container.
- [**Toggle auto build**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): Toggle project auto build and manually initiate project builds.
- [**Enable or disable project** and **Show project overview**](https://www.eclipse.org/codewind/mdt-vsc-commands-project.html): Disable, enable, and delete projects.

## Contributing
Submit issues and contributions:
- [Submitting issues](https://github.com/eclipse/codewind/issues)
- [Contributing](CONTRIBUTING.md)
- [Development Builds](https://download.eclipse.org/codewind/codewind-vscode/)
- [Jenkins](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/)

## Developing
See [DEVELOPING.md](https://github.com/eclipse/codewind-vscode/blob/master/DEVELOPING.md).
