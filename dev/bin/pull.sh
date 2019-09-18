#!/usr/bin/env bash

set -ex

cd $(dirname $0)

./cli-pull.sh
./appsody-pull.sh

cd -
