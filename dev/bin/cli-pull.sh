#!/usr/bin/env bash

set -e
set -o pipefail

cli_basename="cwctl"

cli_branch=${CW_CLI_BRANCH}

# Platforms to download can be specified as command-line args, or in CW_CLI_PLATFORM. Args take precedence if both are used.
if [[ -n $1 ]]; then
    cli_platform_input=$@
else
    cli_platform_input=${CW_CLI_PLATFORM}
fi

if [[ -z $cli_branch ]]; then
    cli_branch="master"
fi

all_platforms=("linux" "darwin" "windows" "ppc64le")
if [[ -z $cli_platform_input ]]; then
    # Default platforms if no override given
    cli_platforms=("linux" "darwin" "windows")
else
    # Args are platforms to download; make sure we have a matching platform binary.
    for platform in ${cli_platform_input[*]}; do
        found=0
        for supported_platform in ${all_platforms[*]}; do
            if [[ $platform == $supported_platform ]]; then
                found=1
                break
            fi
        done
        if [[ $found != 1 ]]; then
            echo "Unsupported platform '$platform', supported platforms are: ${all_platforms[*]}"
        else
            cli_platforms="${cli_platforms} $platform"
        fi
    done

    if [[ -z $cli_platforms ]]; then
        # No platforms were valid
        exit 1
    fi
    # convert from space-delimited string to array
    cli_platforms=($cli_platforms)
fi

echo "Downloading latest Codewind CLI built from $cli_branch for platforms: ${cli_platforms[*]}"

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
        echo "Shasums match; your current $test_file version is up-to-date with $cli_branch"
        return 1
    else
        echo "Current shasum $actual_sha doesn't match latest $latest_sha"
        return 0
    fi
}

download_dir_url="https://archive.eclipse.org/codewind/codewind-installer/${cli_branch}/latest"
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

for platform in ${cli_platforms[*]}; do
    mkdir -p $platform
    get_cli $platform
done

echo "Successfully pulled Codewind CLI for ${cli_platforms[*]}"
