[![Marketplace](https://img.shields.io/vscode-marketplace/v/IBM.codewind.svg?label=marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=IBM.codewind)
[![License](https://img.shields.io/badge/License-EPL%202.0-red.svg?label=license&logo=eclipse)](https://www.eclipse.org/legal/epl-2.0/)
[![Build Status](https://ci.eclipse.org/codewind/buildStatus/icon?job=Codewind%2Fcodewind-vscode%2Fmaster)](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/job/master/)
[![Chat](https://img.shields.io/static/v1.svg?label=chat&message=mattermost&color=145dbf)](https://mattermost.eclipse.org/eclipse/channels/eclipse-codewind)

# Codewind for VS Code
Codewind for VS Code provides tools to help build cloud-native, containerized applications from VS Code, regardless of which runtime or language you use. Rapidly create an application from a template project and launch, update, test, and debug in Docker containers on the desktop.

For more information, see [the Codewind website](https://www.eclipse.org/codewind/).

## Why use Codewind?
- Get started with templates or samples that you can use to quickly create and deploy applications that run in containers.
- Create containerized applications in languages that you're already familiar with. Codewind supports popular runtimes.
- Pull in your existing applications and use Codewind to help get them cloud ready.
- See code changes reflected in your containerized application almost instantaneously. The Codewind advanced inner loop manages your application updates efficiently.
- Develop in containers without feeling like you're developing in containers. Development flow within the IDE feels the same as traditional application development.
- Free up space on your local computer by building and running Codewind applications with cloud resources.

## Features
- Create new containerized projects or add existing ones.
- View your containerized projects, including the application and build status.
- Debug Microprofile/Java EE, Node.js, and Spring applications.
- Access application, build, and container logs in the Output view.
- See validation errors in the Problems view.
- Open a shell session into an application container.
- Toggle the project auto build setting and manually initiate project builds.
- Open your application or the application monitor in a browser.
- Develop your code locally and build and run it remotely and securely in the cloud.

## Getting started with Codewind
For more information about getting started with Codewind, see [Getting started with Codewind for VS Code](https://www.eclipse.org/codewind/mdt-vsc-getting-started.html).

### Prerequisites
- Install [VS Code](https://code.visualstudio.com/download) 1.28.0 or later.
- Install Docker 17.06 or later.
- If you use Linux, you also need to install Docker Compose.

### Complete the installation:

For more information, see [Installing Codewind for VS Code](https://www.eclipse.org/codewind/mdt-vsc-installinfo.html).

1. Find Codewind for VS Code in the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.codewind) or by searching for `Codewind` in the [VS Code Extensions view](https://code.visualstudio.com/docs/editor/extension-gallery#_browse-for-extensions).
2. Open the **Codewind** view in the Explorer view group or enter `Focus on Codewind View` into the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette). If you do not see Codewind in either the Explorer view or the Command Palette, the extension did not install correctly.
3. Choose **Install** when prompted to complete the installation of additional Docker images that Codewind requires to run. The installation may take a few minutes to complete.
4. Now you can create or add a project. Add a project by using either the `Create Project` or `Add Existing Project` command. The new project appears in the Codewind view.
5. To see all actions available, open the Command Palette and type `Codewind`. You can access these same commands through buttons and right-click menus in the Codewind view. For more information, see the [Commands Overview](https://www.eclipse.org/codewind/mdt-vsc-commands-overview.html).

## Contributing
Submit issues and contributions:
- [Submitting issues](https://github.com/eclipse/codewind/issues)
- [Contributing](CONTRIBUTING.md)
- [Development Builds](https://download.eclipse.org/codewind/codewind-vscode/)
- [Jenkins](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/)

## Developing
To develop and debug Codewind for VS Code, see [DEVELOPING.md](https://github.com/eclipse/codewind-vscode/blob/master/DEVELOPING.md).
