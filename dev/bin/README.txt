Usage: ./pull.sh

The CLI version is the latest available from master.
You may override the branch with CW_CLI_BRANCH in the env.
The download will be skipped if the version on disk matches.

The Appsody version must be set with APPSODY_VERSION in the env, or passed as the first argument to the script.
The download will always proceed and overwrite the version on disk if necessary.
