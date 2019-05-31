#!/usr/bin/env bash

if [[ "$skip_tests" != "true" ]]; then
    set -ex

    # Working directory must be dev/ (since this is where package.json is for npm test)
    # Make sure to cd - before exiting
    cd "$(dirname $0)/../dev"

    if [[ -z "$CODE_TESTS_WORKSPACE" ]]; then
        export CODE_TESTS_WORKSPACE="${HOME}/microclimate-workspace/"
    fi

    mkdir -p $CODE_TESTS_WORKSPACE
    # We have to place a file into the workspace which will trigger the extension's activation.
    # If the tests are run before the extension is activated, it will fail with a TypeError, something like "path must be of type string, received undefined"
    touch "$CODE_TESTS_WORKSPACE/.cw-settings"

    # Set artifactory credentials so that installer can pull images from there
    # The installer uses USER and PASS but those can get overridden by the shell.
    # These are handled specially by the InstallerWrapper
    export AF_USER=${artifactory_user}
    export AF_PASS=${artifactory_apikey}

    set +e

    sudo -E env PATH="$PATH" $(which npm) test --verbose
    result=$?

    cd -

    exit $result
else
    echo "skip_tests is true, skipping tests";
fi
