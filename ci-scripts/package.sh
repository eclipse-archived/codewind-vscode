#!/usr/bin/env bash

if [[ $1 == "che" ]]; then
    is_che="true"
fi

set -ex

cd $(dirname $0)/../dev

if [[ $is_che ]]; then
    echo "Building for Che"
    ./prebuild.js che
else
    echo "Building for VS Code"
    ./prebuild.js vscode
fi

# Test compilation to catch any errors
npm ci
npm run vscode:prepublish

# Package for prod
npm i vsce
npx vsce package

# rename to have datetime for clarity + prevent collisions
artifact_name=$(basename *.vsix)
# name is the part before first hyphen eg "codewind"
new_name="${artifact_name%-*}"
if [[ $is_che ]]; then
    new_name="${new_name}-che"
fi
# artifact name without extension
artifact_basename="${artifact_name%.*}"
version="${artifact_basename##*-}"

mv -v $artifact_name $OLDPWD/${new_name}-${version}-$(date +'%Y%m%d%H%M').vsix

cd -
