Usage: ./pull.sh

The CLI version is the latest available from master.
You may override the branch with CW_CLI_BRANCH in the env.
The download will be skipped if the version on disk matches.

The Appsody version is hard-coded into pull-appsody.sh.
You may change it there, or override it with APPSODY_VERSION in the env.
The download will always proceed and overwrite the version on disk if necessary.
