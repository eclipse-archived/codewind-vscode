## Developing Codewind for VS Code
1. First, clone this repository and download our dependencies.
```
    git clone https://github.com/eclipse/codewind-vscode && \
    cd codewind-vscode && \
    cd dev/ && \
    npm install && \
    bin/pull.sh
```
2. Open [`codewind.code-workspace`](https://github.com/eclipse/codewind-vscode/blob/master/codewind.code-workspace), or just the `dev/` folder, in VS Code.
3. Create a workspace (directory or `.code-workspace`) for Codewind extension use, and add the path to the `args` array in `dev/.vscode/launch.json`. An empty directory will work. VS Code will launch into this workspace.
    - Do not modify the `--extensionDevelopmentPath`.
4. Run the **Extension** launch in `launch.json` (hit F5). See [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions) for more information.
- To use a version of Codewind other than latest:
    - `git checkout <release branch>`, eg `0.6.0`
    - `export CW_CLI_BRANCH=0.6.0`
    - If the release branch uses a different verison of Appsody,
        - `export APPSODY_VERSION=<version>`, eg `0.4.10`
    - `bin/pull.sh`
    - Delete `CW_ENV: "dev"` from the `launch.json` `env`, so as to pull release images instead of `latest.` You can override the Codewind image tag to use by setting `CW_TAG: "0.6.0"` here.
        - You can also `export CW_TAG=0.6.0` in the terminal, before launching VS Code from that same terminal. This works even outside of Extension Development mode.
- You can build the extension `.vsix` yourself by running [`vsce package`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) from `dev/`. Refer to the [`Jenkinsfile`](https://github.com/eclipse/codewind-vscode/blob/master/Jenkinsfile) to see the exact steps the build runs.
- The extension bundles dependency executables. These are gitignored, but should be kept up-to-date on your local system with the same versions used in the `Jenkinsfile` `parameters` section. Run `dev/bin/pull.sh` to download the dependencies. Also see `dev/bin/README.txt`.
- The [`prebuild`](https://github.com/eclipse/codewind-vscode/blob/master/dev/prebuild.js) script is used in the CI builds to build separate versions of the extension for VS Code and Theia, since each of those has some commands that the other does not. It deletes inapplicable commands from the `package.json`, and does not modify any ts/js code. Run this before `vsce package` to get a closer-to-production build, but be ready to revert the changes.

## Building Codewind from the source
1. Clone the [`codewind`](https://github.com/eclipse/codewind) repository.
2. Clone the `codewind-vscode` repo.
3. Run `codewind/script/build.sh` to run the Codewind build, or run `codewind/run.sh` to build and start Codewind.
4. Run the extension by following the instructions in **Developing**.
