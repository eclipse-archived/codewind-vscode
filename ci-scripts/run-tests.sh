#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2019, 2020 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

cleanup() {
    if [[ -n $CODE_TESTS_WORKSPACE ]]; then
        ls -lA "$CODE_TESTS_WORKSPACE"
        rm -rf "$CODE_TESTS_WORKSPACE"
    fi

    docker stop $(docker ps -q)
    docker image rm -f $(docker images | grep "eclipse/codewind\|<none>" | awk '{ print $3 }')
    docker network prune -f
    docker volume prune -f
    docker builder prune -a -f
}

set -e

# Working directory must be dev/ (since this is where package.json is for npm test)
cd "$(dirname $0)/../dev"

if ! [[ -x "$(command -v nvm)" ]]; then
    echo "Installing nvm"
    curl -fsS -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

export NODE_VERSION=10
export NPM_VERSION=6

# Install node
if ! [[ $(node --version) == v${NODE_VERSION}* ]]; then
    echo "Installing Node ${NODE_VERSION}"
    nvm install $NODE_VERSION
else
    echo "Node ${NODE_VERSION} is already in use"
fi

nvm use --delete-prefix $NODE_VERSION

# Install npm
if ! [[ $(npm --version) == ${NPM_VERSION}* ]]; then
    echo "Installing npm ${NPM_VERSION}"
    npm i -g npm@${NPM_VERSION}
else
    echo "npm ${NPM_VERSION} is already in use"
fi

set -x
npm config delete prefix

npm ci
npm run versions
npm run lint

if [[ -z $CODE_TESTS_WORKSPACE ]]; then
    export CODE_TESTS_WORKSPACE="${PWD}/codewind-workspace/"
fi

mkdir -p $CODE_TESTS_WORKSPACE

# Allow cwctl to run in insecure keyring mode (no keyring on the jenkins machines)
export INSECURE_KEYRING=true

# Run virtual framebuffer
export DISPLAY=':99.0'
/usr/bin/Xvfb :99 -screen 0 1024x768x24 &

# Increase the docker-compose timeout; sometimes this gets hit when running cwctl stop
export COMPOSE_HTTP_TIMEOUT=120

set +e

npm test
result=$?

cleanup

cd -

exit $result
