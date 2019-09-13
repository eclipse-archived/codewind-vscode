#!/usr/bin/env bash

set -e
set -o pipefail

appsody_version=${APPSODY_VERSION}

if [[ -z $appsody_version ]]; then
    echo "\$APPSODY_VERSION needs to be set in the environment!"
    exit 1
fi

echo "Downloading Appsody version ${appsody_version}"

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
