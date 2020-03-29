#!groovy

def BUILD_CONTAINER = """
    image: node:10-jessie
    tty: true
    command:
      - cat
    resources:
      limits:
        memory: "2Gi"
        cpu: "1"
      requests:
        memory: "2Gi"
        cpu: "1"
"""

def VSCODE_BUILDER = "vscode-builder"
def CHE_BUILDER = "che-builder"

pipeline {
    agent {
        kubernetes {
            label "vscode-buildpod"
            yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: ${VSCODE_BUILDER}
    ${BUILD_CONTAINER}
  - name: ${CHE_BUILDER}
    ${BUILD_CONTAINER}
"""
        }
    }

    options {
        timestamps()
        skipStagesAfterUnstable()
        timeout(time: 1, unit: 'HOURS')
    }

    environment {
        // https://stackoverflow.com/a/43264045
        HOME="."
    }

    // triggers {

    // }

    stages {
        // we duplicate the cloned repo so that we can build vscode and che-theia in parallel without the builds interfering with one another
        stage("Duplicate code") {
            steps {
                dir ("..") {
                    // The cloned directory will have a name like 'wind_codewind-vscode_master', and there will be another copy with '@tmp' at the end we should ignore
                    sh '''#!/usr/bin/env bash
                        shopt -s extglob
                        export dir_name=$(echo *codewind-vscode_$GIT_BRANCH!(*tmp))
                        echo "Duplicating $dir_name"
                        cp -r "$dir_name" codewind-che
                    '''
                }
            }
        }
        stage("Build") {
            parallel {
                stage("Build for VS Code") {
                    steps {
                        container(VSCODE_BUILDER) {
                            sh 'ci-scripts/package.sh'
                            // The parallel stages cannot share a stash or they will overwrite and corrupt each other
                            stash includes: '*.vsix', name: 'vscode-vsix'
                        }
                    }
                }
                stage("Build for Che") {
                    steps {
                        container(CHE_BUILDER) {
                            dir("../codewind-che") {
                                sh 'ci-scripts/package.sh che'
                                stash includes: '*.vsix', name: 'che-vsix'
                            }
                        }
                    }
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

            options {
                skipDefaultCheckout()
            }

            agent any
            steps {
                sshagent (['projects-storage.eclipse.org-bot-ssh']) {
                    unstash 'vscode-vsix'
                    unstash 'che-vsix'
                    sh '''#!/usr/bin/env bash
                    export REPO_NAME="codewind-vscode"
                    export OUTPUT_NAME="codewind"
                    export OUTPUT_CHE_NAME="codewind-che"
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

                    cp $OUTPUT_CHE_NAME-*.vsix $OUTPUT_CHE_NAME.vsix
                    scp $OUTPUT_CHE_NAME.vsix $sshHost:$deployParentDir/$GIT_BRANCH/$LATEST_DIR/$OUTPUT_CHE_NAME.vsix

                    echo "# Build date: $(date +%F-%T)" >> $BUILD_INFO
                    echo "build_info.url=$BUILD_URL" >> $BUILD_INFO
                    SHA1_CHE=$(sha1sum ${OUTPUT_CHE_NAME}.vsix | cut -d ' ' -f 1)
                    echo "build_info.che.SHA-1=${SHA1_CHE}" >> $BUILD_INFO
                    rm $OUTPUT_CHE_NAME.vsix
                    mkdir $BACKUP_DIR
                    mv $OUTPUT_CHE_NAME-*.vsix $BACKUP_DIR/

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

                    ssh $sshHost rm -rf $deployDir
                    ssh $sshHost mkdir -p $deployDir
                    scp *.vsix $sshHost:$deployDir
                    echo "Uploaded to https://download.eclipse.org${deployDir##*download.eclipse.org}"

                    '''
                }
            }
        }

        stage("Report") {
            when {
                beforeAgent true
                triggeredBy 'UpstreamCause'
            }

            options {
                skipDefaultCheckout()
            }

            steps {
                mail to: 'jspitman@ca.ibm.com, timetchells@ibm.com',
                subject: "${currentBuild.currentResult}: Upstream triggered build for ${currentBuild.fullProjectName}",
                body: "${currentBuild.absoluteUrl}\n${currentBuild.getBuildCauses()[0].shortDescription} had status ${currentBuild.currentResult}"
            }
        }
    }
}
