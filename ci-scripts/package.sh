#!/usr/bin/env bash

if [[ $1 == "che" ]]; then
    is_che="true"
fi

set -ex

cd $(dirname $0)/../dev

if [[ $is_che ]]; then
    export CW_PREBUILD_TYPE = "che"
fi

# Test build to catch any errors (vsce is bad at reporting them)
npm ci
npm run compile

npm run package

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
