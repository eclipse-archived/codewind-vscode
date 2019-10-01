#!/usr/bin/env bash

set -e
set -o pipefail

cli_branch=${CW_CLI_BRANCH}

if [[ -z $cli_branch ]]; then
    cli_branch="master"
fi

echo "Downloading latest Codewind CLI built from $cli_branch"

cli_basename="cwctl"

download () {
    local url=$1
    local outfile=$2

    echo "Downloading $url"
    curl -fsSL "$url" -o "$outfile"
}

# Get a property value from a .properties file
extract_property () {
    local file=$1
    local property=$2

    grep $property $file | cut -d '=' -f 2
}

# Test the linux cli's sha vs the build_info linux cli's sha
# Return 1 for no upgrade, 0 for upgrade available
is_cli_upgrade_available () {
    local cli_props_file="cli_version.properties";
    local cli_props_url="$download_dir_url/build_info.properties"
    download $cli_props_url $cli_props_file
    cli_lastbuild=$(extract_property $cli_props_file build_info.url)
    echo "Latest cli $cli_branch build is $cli_lastbuild"

    latest_sha=$(extract_property $cli_props_file build_info.macos.SHA-1)
    #rm $cli_props_file

    local test_file="darwin/$cli_basename"
    if [[ ! -f $test_file ]]; then
        return 0;
    fi

    if [[ $(uname) == "Darwin" ]]; then
        actual_sha=$(shasum $test_file | awk '{ print $1 }')
    else
        actual_sha=$(sha1sum $test_file | awk '{ print $1 }')
    fi

    if [[ $latest_sha == $actual_sha ]]; then
        echo "Shasums match; your current cli version is up-to-date with $cli_branch"
        return 1
    else
        echo "Current shasum $actual_sha doesn't match latest $latest_sha"
        return 0
    fi
}

download_dir_url="https://download.eclipse.org/codewind/codewind-installer/${cli_branch}/latest"
get_cli () {
    local platform=$1
    local filename="${cli_basename}-${platform}"
    if [[ $platform == "windows" ]]; then
        filename="${cli_basename}-win.exe"
    elif [[ $platform == "darwin" ]]; then
        filename="${cli_basename}-macos";
    fi
    local url="${download_dir_url}/${filename}"

    download $url $filename
    chmod +x $filename

    local target_dir=$platform
    local target_file=$cli_basename
    if [[ $platform == "windows" ]]; then
        target_file="${target_file}.exe"
    fi
    mv -v "$filename" "${target_dir}/${target_file}"
}

if ! is_cli_upgrade_available; then
    echo "No CLI update required"
    exit 0
fi

platforms=("linux" "darwin" "windows")
for platform in ${platforms[*]}; do
    mkdir -p $platform
    get_cli $platform
done

echo "Successfully pulled Codewind CLI"
