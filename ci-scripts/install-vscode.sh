#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

set -ex

# https://medium.com/@yavuz255/how-to-run-visual-studio-code-as-root-7c0d5df0e764
# udd_arg=""
# if [[ $EUID == 0 ]]; then
#     udd_arg="--user-data-dir='~/.vscode-root'"
# fi

code --version $udd_arg
code --install-extension "vscjava.vscode-java-debug" --force $udd_arg
