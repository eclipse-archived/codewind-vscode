#!groovy​

pipeline {
    agent {
		kubernetes {
      		label 'node'
			yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node
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
        stage('Build for VS Code') {
            steps {
                container("node") {
                    dir('dev') {
                        sh '''#!/usr/bin/env bash
                            # Test compilation to catch any errors
                            npm run vscode:prepublish

                            # Package for prod
                            npm i vsce
                            npx vsce package

                            # rename to have datetime for clarity + prevent collisions
                            export artifact_name=$(basename *.vsix)
                            mv -v $artifact_name ${artifact_name/.vsix/_$(date +'%F-%H%M').vsix}
                        '''

                        stash includes: '*.vsix', name: 'deployables'
                    }
                }
            }
        }
        stage("Build for Theia") {
            steps {
                container("node") {
                    dir('dev') {
                        sh '''#!/usr/bin/env bash

                            ./theia-prebuild.js

                            # Test compilation to catch any errors
                            npm run vscode:prepublish

                            # Package for prod
                            npm i vsce
                            npx vsce package

                            # rename to have datetime for clarity + prevent collisions
                            export artifact_name=$(basename *.vsix)
                            mv -v $artifact_name ${artifact_name/.vsix/-theia_$(date +'%F-%H%M').vsix}
                        '''

                        stash includes: '*.vsix', name: 'deployables'
                    }
                }
            }
        }
        stage ("Upload") {
            agent any
            steps {
                sshagent (['projects-storage.eclipse.org-bot-ssh']) {
                    unstash 'deployables'
                    sh '''#!/usr/bin/env bash
                        # ls -lA

                        if [ -z $CHANGE_ID ]; then
    					    UPLOAD_DIR="$GIT_BRANCH/$BUILD_ID"
					    else
    					    UPLOAD_DIR="pr/$CHANGE_ID/$BUILD_ID"
					    fi
 
                        export sshHost="genie.codewind@projects-storage.eclipse.org"
                        export deployDir="/home/data/httpd/download.eclipse.org/codewind/codewind-vscode/${UPLOAD_DIR}"

                        ssh $sshHost mkdir -p $deployDir
                        scp *.vsix ${sshHost}:${deployDir}
                        echo "Uploaded to https://download.eclipse.org${deployDir##*download.eclipse.org}"
                    '''
                }
            }
        }
    }
}
