#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2018, 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

# To be run from the repository root directory
# $artifact_name must be set and the file it points to must be in the working directory

if [[ $deploy != "true" ]]; then
    echo "$(basename $0): skipping deploy"
    exit 0
fi

datetime="$(date +'%F-%H%M')"
if [[ -n "$TRAVIS_TAG" ]]; then
    echo "Releasing $TRAVIS_TAG"
    # No extra build_label; just the version eg. 19.1
    build_label=""
    deploy_dir="tagged"
elif [[ "$TRAVIS_EVENT_TYPE" == "cron" ]]; then
    build_label="_nightly-${datetime}"
    deploy_dir="nightly"
else
    branch="$TRAVIS_BRANCH"
    build_label="_${branch}"
    deploy_dir="${branch}"
fi

echo "Build label is \"$build_label\""

# Will resolve to something like "codewind-18.12.0_nightly-2018-12-07-2330.vsix"
labelled_artifact_name="${artifact_name/.vsix/$build_label.vsix}"
mv -v "$artifact_name" "$labelled_artifact_name"

# Update the last_build file linking to the most recent vsix
build_info_file="last_build.html"
#build_date="$(date +'%F_%H-%M_%Z')"
commit_info="$(git log $TRAVIS_BRANCH -3 --pretty='%h by %an - %s<br>')"
# This link is only really useful on DHE
artifact_link="<a href=\"./$labelled_artifact_name\">$labelled_artifact_name</a>"
printf "Last build: $artifact_link<br><br><b>Latest commits on $TRAVIS_BRANCH:</b><br>$commit_info" > "$build_info_file"

artifactory_path="${artifactory_path}${deploy_dir}"
artifactory_full_url="${artifactory_url}/${artifactory_path}"
echo "artifactory_full_url is $artifactory_full_url"

artifactory_cred_header="X-JFrog-Art-Api: $artifactory_apikey"

artf_resp=$(curl -X PUT -sS -H "$artifactory_cred_header" -T "$labelled_artifact_name" "$artifactory_full_url/$labelled_artifact_name")
echo "$artf_resp"

if [[ "$artf_resp" != *"created"* ]]; then
    >&2 echo "Artifactory deploy failed!"
    exit 1
fi

curl -X PUT -sS  -H "$artifactory_cred_header" -T "$build_info_file" "$artifactory_full_url/$build_info_file"
