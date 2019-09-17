#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

if [[ "$skip_tests" == "true" ]]; then
    echo "skip_tests is true, skipping tests";
    exit 0
fi

echo "Running as user $(whoami)"
if [[ $EUID == 0 ]]; then
    echo "Running with root permissions"
else
    echo "Running WITHOUT root permissions"
fi

set -ex

# Install vs code and test prereqs

curl -sSLf https://update.code.visualstudio.com/latest/linux-deb-x64/stable -o vscode.deb
apt update -y
apt install -y ./vscode.deb
# https://askubuntu.com/questions/482478/libasound-so-2-cannot-open-shared-object-file-no-such-file-or-directory
apt install -y libasound2
# xvfb is required so vs code thinks it has a display
apt install -y xvfb

# https://medium.com/@yavuz255/how-to-run-visual-studio-code-as-root-7c0d5df0e764
udd_arg=""
if [[ $EUID == 0 ]]; then
    udd_arg="--user-data-dir='~/.vscode-root'"
fi

code --version $udd_arg
code --install-extension "vscjava.vscode-java-debug" --force $udd_arg

# Working directory must be dev/ (since this is where package.json is for npm test)
cd "$(dirname $0)/../dev"

if [[ -z $CODE_TESTS_WORKSPACE ]]; then
    export CODE_TESTS_WORKSPACE="${HOME}/codewind-workspace/"
fi

# Make codewind workspace and create a file which will trigger the extension's activation
# If the tests are run before the extension is activated, it will fail with a TypeError, something like "path must be of type string, received undefined"
mkdir -p $CODE_TESTS_WORKSPACE
touch "$CODE_TESTS_WORKSPACE/.cw-settings"

# Run virtual framebuffer (installed above) https://code.visualstudio.com/api/working-with-extensions/continuous-integration#travis-ci
export DISPLAY=':99.0'
/usr/bin/Xvfb :99 -screen 0 1024x768x24 > /dev/null &

set +e

$(which npm) test --verbose
result=$?

rm -rf "$CODE_TESTS_WORKSPACE"

cd -

exit $result
