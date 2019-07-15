#!/usr/bin/env bash

if [[ $1 == "theia" ]]; then
    is_theia="true"
fi

# In the eclipse jenkins the two pods share a filesystem

target_dir="$(dirname $0)/../dev"
if [[ $is_theia ]]; then
    # This was created in the 'duplicate' stage.
    target_dir=${target_dir}-theia
fi

set -ex

cd $target_dir/
ls -lA

if [[ $is_theia ]]; then
    echo "Building for Theia"
    npm i rimraf
    ./theia-prebuild.js
else
    echo "Building for VS Code"
fi

# Test compilation to catch any errors
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

ls -lA
mv -v $artifact_name $OLDPWD/${new_name}-${version}-$(date +'%Y%m%d%H%M').vsix

cd -
