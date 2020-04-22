### `cli-pull.sh`

Downloads `cwctl` from [https://archive.eclipse.org/codewind/codewind-installer](https://archive.eclipse.org/codewind/codewind-installer/).
By default, the CLI version is the latest available from master.
You may override the branch with `CW_CLI_BRANCH` in the env.
The download will be skipped if the version on disk matches.

By default, cli-pull.sh will download binaries for Linux, Darwin, and Windows. ppc64le binaries are also available.

Select the platform(s) to download by passing them as arguments

eg: `./cli-pull.sh ppc64le`

or in the environment, eg.
`export CW_CLI_PLATFORM=ppc64le`

### `appsody-pull.sh`

Downloads `appsody` from [https://github.com/appsody/appsody/releases/](https://github.com/appsody/appsody/releases/).
By default the version to use is fetched from the [Jenkinsfile](https://github.com/eclipse/codewind-vscode/blob/master/Jenkinsfile#L42).
The Appsody version can be overridden with `APPSODY_VERSION` in the env, or passed as the first argument to the script.
The download will always proceed and overwrite the version on disk if necessary.

`pull.sh` invokes both `cli-pull.sh` and `appsody-pull.sh`, but will ignore positional arguments.
