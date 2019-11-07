#!/usr/bin/env bash

if [[ $1 == "theia" ]]; then
    is_theia="true"
fi

set -ex

cd $(dirname $0)/../dev

if [[ $is_theia ]]; then
    echo "Building for Theia"
    ./prebuild.js theia
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
if [[ $is_theia ]]; then
    new_name="${new_name}-theia"
fi
# artifact name without extension
artifact_basename="${artifact_name%.*}"
version="${artifact_basename##*-}"

mv -v $artifact_name $OLDPWD/${new_name}-${version}-$(date +'%Y%m%d%H%M').vsix

cd -
