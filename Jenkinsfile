#!groovy

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
                    // Reset changes from the vs code package.sh
                    sh 'git reset --hard HEAD'
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
                    export REPO_NAME="codewind-vscode"
                    export OUTPUT_NAME="codewind"
                    export OUTPUT_THEIA_NAME="codewind-theia"
                    export DOWNLOAD_AREA_URL="https://download.eclipse.org/codewind/$REPO_NAME"
                    export LATEST_DIR="latest"
                    export BUILD_INFO="build_info.properties"
                    export sshHost="genie.codewind@projects-storage.eclipse.org"
                    export deployParentDir="/home/data/httpd/download.eclipse.org/codewind/$REPO_NAME"
                    export BACKUP_DIR=temp_backup

                    UPLOAD_DIR="$GIT_BRANCH/$BUILD_ID"
                    BUILD_URL="$DOWNLOAD_AREA_URL/$UPLOAD_DIR"

                    ssh $sshHost rm -rf $deployParentDir/$GIT_BRANCH/$LATEST_DIR
                    ssh $sshHost mkdir -p $deployParentDir/$GIT_BRANCH/$LATEST_DIR

                    cp $OUTPUT_THEIA_NAME-*.vsix $OUTPUT_THEIA_NAME.vsix
                    scp $OUTPUT_THEIA_NAME.vsix $sshHost:$deployParentDir/$GIT_BRANCH/$LATEST_DIR/$OUTPUT_THEIA_NAME.vsix

                    echo "build_info.url=$BUILD_URL" >> $BUILD_INFO
                    SHA1_THEIA=$(sha1sum ${OUTPUT_THEIA_NAME}.vsix | cut -d ' ' -f 1)
                    echo "build_info.theia.SHA-1=${SHA1_THEIA}" >> $BUILD_INFO
                    rm $OUTPUT_THEIA_NAME.vsix
                    mkdir $BACKUP_DIR
                    mv $OUTPUT_THEIA_NAME-*.vsix $BACKUP_DIR/

                    cp $OUTPUT_NAME-*.vsix $OUTPUT_NAME.vsix
                    scp $OUTPUT_NAME.vsix $sshHost:$deployParentDir/$GIT_BRANCH/$LATEST_DIR/$OUTPUT_NAME.vsix

                    SHA1=$(sha1sum ${OUTPUT_NAME}.vsix | cut -d ' ' -f 1)
                    echo "build_info.SHA-1=${SHA1}" >> $BUILD_INFO

                    scp $BUILD_INFO $sshHost:$deployParentDir/$GIT_BRANCH/$LATEST_DIR/$BUILD_INFO
                    rm $BUILD_INFO
                    rm $OUTPUT_NAME.vsix
                    mv $BACKUP_DIR/* .
                    rmdir $BACKUP_DIR

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
