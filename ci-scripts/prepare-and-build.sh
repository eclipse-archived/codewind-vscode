#!/usr/bin/env bash

set -ex

# https://medium.com/@yavuz255/how-to-run-visual-studio-code-as-root-7c0d5df0e764
udd_arg=""
if [[ $EUID == 0 ]]; then
    udd_arg="--user-data-dir='~/.vscode-root'"
fi

code --version $udd_arg
code --install-extension "vscjava.vscode-java-debug" --force $udd_arg
# Working directory must be dev/ (since this is where package.json is)
# Make sure to cd - before exiting
cd "$(dirname $0)/../dev"
npm run vscode:prepublish

cd -
