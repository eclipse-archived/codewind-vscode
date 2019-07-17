#!groovy​

pipeline {
    agent {
		kubernetes {
      		label 'vscode-builder'
			yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: vscode-builder
    image: node:lts
    tty: true
    command:
      - cat
"""
    	}
	}

	options {
        timestamps()
        skipStagesAfterUnstable()
    }

    environment {
        // https://stackoverflow.com/a/43264045
        HOME="."
    }

    stages {
        stage("Build for VS Code") {
            steps {
                container("vscode-builder") {
                    sh 'ci-scripts/package.sh'
                    stash includes: '*.vsix', name: 'deployables'
                }
            }
        }
        stage("Build for Theia") {
            steps {
                container("vscode-builder") {
                    sh 'ci-scripts/package.sh theia'
                    stash includes: '*.vsix', name: 'deployables'
                }
            }
        }

        stage ("Upload") {
            // This when clause disables PR build uploads; you may comment this out if you want your build uploaded.
            when {
                beforeAgent true
                not {
                    changeRequest()
                }
            }

            agent any
            steps {
                sshagent (['projects-storage.eclipse.org-bot-ssh']) {
                    unstash 'deployables'
                    sh '''#!/usr/bin/env bash

                    export sshHost="genie.codewind@projects-storage.eclipse.org"
                    export deployParentDir="/home/data/httpd/download.eclipse.org/codewind/codewind-vscode"

                    if [ -z $CHANGE_ID ]; then
                        UPLOAD_DIR="$GIT_BRANCH/$BUILD_ID"

                        ssh $sshHost rm -rf $deployParentDir/$GIT_BRANCH/latest
                        ssh $sshHost mkdir -p $deployParentDir/$GIT_BRANCH/latest
                        scp *.vsix $sshHost:$deployParentDir/$GIT_BRANCH/latest
                    else
                        UPLOAD_DIR="pr/$CHANGE_ID/$BUILD_ID"
                    fi

                    export deployDir="$deployParentDir/$UPLOAD_DIR"

                    printf "Uploading files:\n$(ls -l *.vsix)\n"

                    ssh $sshHost mkdir -p $deployDir
                    scp *.vsix $sshHost:$deployDir
                    echo "Uploaded to https://download.eclipse.org${deployDir##*download.eclipse.org}"

                    '''
                }
            }
        }
    }
}
