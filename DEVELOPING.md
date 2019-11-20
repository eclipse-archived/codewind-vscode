# Developing Codewind for VS Code

## Setting up a workspace and starting the extension 
1. First, clone this repository and download the dependencies:
```
    git clone https://github.com/eclipse/codewind-vscode && \
    cd codewind-vscode && \
    cd dev/ && \
    npm install && \
    bin/pull.sh
```
2. In Visual Studio Code (VS Code), open either the [`codewind.code-workspace`](https://github.com/eclipse/codewind-vscode/blob/master/codewind.code-workspace) or the `dev/` folder.
3. Create or identify a workspace for Codewind extension use. You can use an empty directory or `.code-workspace`. Add the path to the `args` array in `dev/.vscode/launch.json`. VS Code starts in this workspace.
    - When you edit the `launch.json` file, do not modify the `--extensionDevelopmentPath`.
4. Start the **Extension** in `launch.json` by pressing F5. For more information, see [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions).

## Using a version of Codewind other than the latest
1. Enter `git checkout <release branch>` and specify the release branch that you want to use, such as `0.6.0`.
2. Enter `export CW_CLI_BRANCH=0.6.0`.
3. If the release branch uses a different verison of Appsody, enter `export APPSODY_VERSION=<version>` and specify a version, such as `0.4.10`.
4. Enter `bin/pull.sh`.
5. Delete `CW_ENV: "dev"` from the `launch.json` `env` to pull release images instead of `latest`.
     - For example, you can override the Codewind image tag to use `0.6.0` by setting `CW_TAG: "0.6.0"` in the `launch.json` file.
     - You can also enter `export CW_TAG=0.6.0` in the terminal before you launch VS Code from that same terminal. This command works even outside of Extension Development mode.
6. You can build the extension `.vsix` yourself by running [`vsce package`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) from `dev/`. Refer to the [`Jenkinsfile`](https://github.com/eclipse/codewind-vscode/blob/master/Jenkinsfile) to see the exact steps that the build runs.
7. The extension bundles dependency executables. Git ignores these executables, but keep them up to date on your local system with the same versions used in the `Jenkinsfile` `parameters` section. Run `dev/bin/pull.sh` to download the dependencies. Also see `dev/bin/README.txt`.
8. The [`prebuild`](https://github.com/eclipse/codewind-vscode/blob/master/dev/prebuild.js) script is used in the CI builds to build separate versions of the extension for VS Code and Theia. Each of these programs has some commands that the other does not. The script deletes inapplicable commands from the `package.json` file and does not modify any TS/JS code. Run this script before `vsce package` to get a build that is closer to production, but be ready to revert the changes.

## Building Codewind from the source
1. Clone the [`codewind`](https://github.com/eclipse/codewind) repository.
2. Clone the `codewind-vscode` repo.
3. Run `codewind/script/build.sh` to run the Codewind build, or run `codewind/run.sh` to build and start Codewind.
4. Start the **Extension** in `launch.json` by pressing F5. For more information, see [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions).
