#!/usr/bin/env bash

set -e
set -o pipefail

jenkinsfile_url="https://raw.githubusercontent.com/eclipse/codewind-eclipse/master/Jenkinsfile"

appsody_version=${APPSODY_VERSION}

if [[ -z $appsody_version ]]; then
    appsody_version=$1
fi

if [[ -z $appsody_version ]]; then
    echo "\$APPSODY_VERSION not set in the environment or in \$1, using version from Jenkinsfile"

    appsody_param_line=$(curl -fsSL "$jenkinsfile_url" | grep "APPSODY_VERSION" | grep "name")
    appsody_version=$(echo ${appsody_param_line#*defaultValue: } | cut -d \" -f2)
    echo "Appsody version from $jenkinsfile_url is $appsody_version"
fi

echo "Downloading Appsody version \"${appsody_version}\""

download () {
    local url=$1
    local outfile=$2

    echo "Downloading $url"
    curl -fsSL "$url" -o "$outfile"
}

appsody_download_base_url="https://github.com/appsody/appsody/releases/download/${appsody_version}"
get_appsody () {
    local platform=$1

    if [[ $platform != "windows" ]]; then
        local arch="-amd64"
    fi
    local filename="appsody-${appsody_version}-${platform}${arch}.tar.gz"
    local url="${appsody_download_base_url}/${filename}"
    download $url $filename

    local executable="appsody"
    if [[ $platform == "windows" ]]; then
        executable="${executable}.exe"
    fi
    tar xzf $filename $executable
    rm $filename
    mv -v $executable $platform/
}

platforms=("linux" "darwin" "windows")
for platform in ${platforms[*]}; do
    mkdir -p $platform
    get_appsody $platform
done

echo "$appsody_version" > appsody_version.txt;

echo "Successfully pulled Appsody $appsody_version"
