## Developing Codewind for VS Code

1. First, clone this repository and download our dependencies.
```
    git clone https://github.com/eclipse/codewind-vscode && \
    cd codewind-vscode && \
    cd dev/ && \
    npm ci
```
2. In VS Code, open either [`codewind.code-workspace`](https://github.com/eclipse/codewind-vscode/blob/master/codewind.code-workspace) or the `dev/` directory.
3. Create or identify a workspace for Codewind extension use. You can use an empty directory or a `.code-workspace` file. Add the path to the `args` array under the `Extension` launch in `dev/.vscode/launch.json`. When VS Code launches in extension development mode, it uses this workspace.
    - When you edit `launch.json`, do not modify the `--extensionDevelopmentPath`.
4. Start the `Extension` launch in `launch.json` by pressing F5. For more information, ee [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions) for more information.
    - This launches a terminal to incrementally compile the code in the background.

### Notes
- You can build the extension `.vsix` yourself by running `npm run package` which wraps [`vsce package`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) from `dev/`.
- See [the tests README](https://github.com/eclipse/codewind-vscode/blob/master/dev/src/test/README-Tests.md) for instructions on running the tests.

## Building the Codewind Images from the source
1. Clone the [`codewind`](https://github.com/eclipse/codewind) repository.
2. Clone the `codewind-vscode` repo.
3. Run `codewind/script/build.sh` to run the Codewind build, or run `codewind/run.sh` to build and start Codewind.
4. Run the extension by following the instructions in **Developing Codewind for VS Code**.
