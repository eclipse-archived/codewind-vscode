[![Marketplace](https://img.shields.io/vscode-marketplace/v/IBM.codewind.svg?label=marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=IBM.codewind)
[![License](https://img.shields.io/badge/License-EPL%202.0-red.svg?label=license&logo=eclipse)](https://www.eclipse.org/legal/epl-2.0/)
[![Slack](https://img.shields.io/badge/ibm--cloud--tech-blue.svg?logo=slack&label=slack)](https://slack-invite-ibm-cloud-tech.mybluemix.net/)

# Codewind for VS Code
Create and develop cloud-native, containerized web applications from VS Code.

## Installing Codewind
Prerequisites
- Install [VS Code](https://code.visualstudio.com/download).
- Install Docker.
- If you use Linux, you also need to install Docker Compose.

Complete the installation:
1. Find Codewind for VS Code in the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.codewind) or by searching for `Codewind` in the [VS Code Extensions view](https://code.visualstudio.com/docs/editor/extension-gallery#_browse-for-extensions).
2. Go to the **Explorer** view group and open the **Codewind** view.
3. Click **Install** whem prompted. The download is approximately 1 GB.

## Using Codewind for VS Code
To see the actions available, open the [**Command Palette**](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and type `Codewind`.</br>

Features:</br>
- Create new projects from application templates or import existing Docker-ready projects.
- View Codewind projects, including application and build statuses.
- Debug Microprofile, Spring, and Node.js projects in their Docker containers.
- View application and build logs in the VS Code **Output** view.
- View and edit project deployment information.
- Open a shell session into a Codewind application container.
- Toggle project auto build and manually initiate project builds.
- Disable, enable, and delete projects.

## Contributing
Submit issues and contributions:
- [Submitting issues](https://github.com/eclipse/codewind/issues)
- [Contributing](CONTRIBUTING.md)
- To host the extension yourself so you can develop or debug it, clone this repository and run the **Extension** launch in `dev/.vscode/launch.json`. See [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions) for more information.
- You can also build the extension `.vsix` yourself by running [`vsce package`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) from `dev/`. Refer to the [`ci-scripts`](https://github.com/microclimate-dev2ops/codewind-vscode/blob/master/ci-scripts/) to see the exact steps the build runs.
