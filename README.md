[![Marketplace](https://img.shields.io/vscode-marketplace/v/IBM.codewind.svg?label=marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=IBM.codewind)
[![License](https://img.shields.io/badge/License-EPL%202.0-red.svg?label=license&logo=eclipse)](https://www.eclipse.org/legal/epl-2.0/)
[![Build Status](https://ci.eclipse.org/codewind/buildStatus/icon?job=Codewind%2Fcodewind-vscode%2Fmaster)](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/job/master/)
[![Chat](https://img.shields.io/static/v1.svg?label=chat&message=mattermost&color=145dbf)](https://mattermost.eclipse.org/eclipse/channels/eclipse-codewind)

# Codewind for VS Code
Codewind for VS Code provides tools to help build cloud-native, containerized applications from VS Code, regardless of which runtime or language you use. Rapidly create an application from a template project and launch, update, test, and debug in Docker containers on the desktop.

## Why use Codewind?
- Get started quickly with templates or samples.
- Use the tools, runtimes, and languages that you're already familiar with.
- Pull in existing applications and get them ready for the cloud.
- Enjoy quick, iterative development and fast feedback.
- Learn as you go.

## Features
- Create new containerized projects or add existing ones.
- View your containerized projects, including the application and build status.
- Debug Microprofile/Java EE, Node.js, and Spring applications.
- View application and build logs in the Output view.
- See validation errors in the Problems view.
- Open a shell session into an application container.
- Toggle the project auto build setting and manually initiate project builds.
- Open your application or the application monitor in a browser.

For more information, see the [Codewind website](https://www.eclipse.org/codewind/).

## Installing Codewind
You can install Codewind locally in VS Code. For more information about installing Codewind, see [Installing Codewind for VS Code](https://www.eclipse.org/codewind/mdtvscinstallinfo.html).

Prerequisites
- Install [VS Code](https://code.visualstudio.com/download).
- Install Docker.
- If you use Linux, you also need to install Docker Compose.

Complete the installation:
1. Find Codewind for VS Code in the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.codewind) or by searching for `Codewind` in the [VS Code Extensions view](https://code.visualstudio.com/docs/editor/extension-gallery#_browse-for-extensions).
2. Open the **Codewind** view in the Explorer view group or enter `Focus on Codewind View` into the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette). If you do not see the Codewind view in either the Explorer view or the **Command Palette**, the extension did not install correctly.
3. Codewind requires the installation of additional Docker images to run. Choose **Install** when prompted to complete the installation. The installation may take a few minutes to complete. Codewind creates a folder called `codewind-workspace` within your home directory to contain your projects. On Windows, this is the `C:\codewind-workspace` directory. When the installation is complete, you can open the `codewind-workspace` folder or a project within the workspace as your VS Code workspace. The tools offer to open the workspace for you if it’s not open already.

## Using Codewind for VS Code
To see the actions available, open the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and type `Codewind`.</br>

## Contributing
Submit issues and contributions:
- [Submitting issues](https://github.com/eclipse/codewind/issues)
- [Contributing](CONTRIBUTING.md)
- [Development Builds](https://download.eclipse.org/codewind/codewind-vscode/)
- [Jenkins](https://ci.eclipse.org/codewind/job/Codewind/job/codewind-vscode/)

## Developing
- To host the extension yourself so you can develop or debug it, clone this repository and run the **Extension** launch in `dev/.vscode/launch.json`. See [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions) for more information.
- If not run using the **Extension** launch, the tools will pull the latest Codewind release tag, eg. `0.3` (see [`DEFAULT_CW_TAG`](https://github.com/eclipse/codewind-vscode/blob/master/dev/src/codewind/connection/InstallerWrapper.ts)). To run against the latest development version of Codewind:
    1. Start Codewind using [`run.sh`](https://github.com/eclipse/codewind/blob/master/run.sh) or [`start.sh`](https://github.com/eclipse/codewind/blob/master/start.sh).
    2. From a terminal, run `export CW_TAG=latest` (or your Windows equivalent).
    3. Close all instances of VS Code.
    4. Launch VS Code (`code`) from the same shell so the environment is picked up.
- You can also build the extension `.vsix` yourself by running [`vsce package`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) from `dev/`. Refer to the [`Jenkinsfile`](https://github.com/eclipse/codewind-vscode/blob/master/Jenkinsfile) to see the exact steps the build runs.
- The extension bundles dependency executables. These are gitignored, but should be kept up-to-date on your local system with the same versions used in the `Jenkinsfile` `parameters` section. Run `dev/bin/pull.sh` to download the dependencies. Also see `dev/bin/README.txt`.
- The [`prebuild`](https://github.com/eclipse/codewind-vscode/blob/master/dev/prebuild.js) script is used in the CI builds to build separate versions of the extension for VS Code and Theia, since each of those has some commands that the other does not. It deletes inapplicable commands from the `package.json`, and does not modify any ts/js code. Run this before `vsce package` to get a closer-to-production build, but be ready to revert the changes.

## Building Codewind from the source
1. Clone the [`codewind`](https://github.com/eclipse/codewind) repository.
2. Clone the `codewind-vscode` repo.
3. Run `codewind/script/build.sh` to run the Codewind build, or run `codewind/run.sh` to build and start Codewind.
4. Run the extension by following the instructions in **Developing**.