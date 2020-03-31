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

if [[ $1 == "che" ]]; then
    is_che="true"
fi

set -ex

cd $(dirname $0)/../dev

npm ci
# Test build to catch any errors (vsce suppresses error output from the prepublish script for some reason)
npm run versions
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
