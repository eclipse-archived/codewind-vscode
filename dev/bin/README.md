### cli-pull

Downloads `cwctl` from [https://download.eclipse.org/codewind/codewind-installer](https://download.eclipse.org/codewind/codewind-installer/).
By default, the CLI version is the latest available from master.
You may override the branch with `CW_CLI_BRANCH` in the env.
The download will be skipped if the version on disk matches.

By default, cli-pull.sh will download binaries for Linux, Darwin, and Windows. ppc64le binaries are also available.

Select the platform(s) to download by passing them as arguments

eg: `./cli-pull.sh ppc64le`

or in the environment, eg.
`export CW_CLI_PLATFORM=ppc64le`

### appsody-pull

The Appsody version must be set with `APPSODY_VERSION` in the env, or passed as the first argument to the script.
If no version override is provided, the version to use is fetched from the [Jenkinsfile](https://github.com/eclipse/codewind-vscode/blob/master/Jenkinsfile#L42).
The download will always proceed and overwrite the version on disk if necessary.

`pull.sh` invokes both `cli-pull.sh` and `appsody-pull.sh`.
