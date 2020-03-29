#!/usr/bin/env bash

if [[ $1 == "che" ]]; then
    is_che="true"
fi

set -ex

cd $(dirname $0)/../dev
npm ci
# Test build to catch any errors (vsce suppresses error output from the prepublish script for some reason)
npm run ts-compile

if [[ $is_che ]]; then
    npm run package-che
else
    npm run package
fi

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
