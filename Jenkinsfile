#!groovy

import java.text.SimpleDateFormat;

@NonCPS
def getChangeDetail() {

    def changeDetail = ""
    def changes = currentBuild.changeSets
    
    for (int i = 0; i < changes.size(); i++) {
        
        def entries = changes[i].items
    
        for (int j = 0; j < entries.length; j++) {
            def entry = entries[j]

            Date entry_timestamp = new Date(entry.timestamp)
            SimpleDateFormat timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            changeDetail += "${entry.commitId.take(7)} by [${entry.author}] on ${timestamp.format(entry_timestamp)}: ${entry.msg}\n\n"
        }
    }

    if (!changeDetail) {
        changeDetail = "No new changes"
    }
    return changeDetail
}

IS_MASTER_BRANCH = env.BRANCH_NAME == "master"
IS_RELEASE_BRANCH = (env.BRANCH_NAME ==~ /\d+\.\d+\.\d+/)

def sendEmailNotification() {    
    final def EXTRECIPIENTS = emailextrecipients([
        [$class: 'CulpritsRecipientProvider'],
        [$class: 'RequesterRecipientProvider'],
        [$class: 'DevelopersRecipientProvider']
    ])

    def RECIPIENTS = EXTRECIPIENTS != null ? EXTRECIPIENTS : env.CHANGE_AUTHOR_EMAIL;
    def SUBJECT = "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - ${currentBuild.currentResult}!"
    def CHANGE = getChangeDetail();
    
    emailext(
        to: RECIPIENTS,
        subject: "${SUBJECT}",
        body: """
            <b>Build result:</b> 
            <br><br>
            ${currentBuild.currentResult}
            <br><br>
            <b>Project name - Build number:</b>
            <br><br>
            ${currentBuild.fullProjectName} - Build #${env.BUILD_NUMBER}
            <br><br>
            <b>Check console output for more detail:</b> 
            <br><br>
            <a href="${currentBuild.absoluteUrl}console">${currentBuild.absoluteUrl}console</a>
            <br><br>
            <b>Changes:</b> 
            <br><br>
            ${CHANGE}
            <br><br>
        """
    );
}

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

echo "Branch is ${env.BRANCH_NAME}"
echo "Is master branch build ? ${IS_MASTER_BRANCH}"
echo "Is release branch build ? ${IS_RELEASE_BRANCH}"

// https://stackoverflow.com/a/44902622
def CRON_STRING = ""
// https://jenkins.io/doc/book/pipeline/syntax/#cron-syntax
if (IS_MASTER_BRANCH || IS_RELEASE_BRANCH) {
    // Build daily between 0600-0659
    CRON_STRING = "H 6 * * *"
}

def VSCODE_BUILDER = "vscode-builder"
def CHE_BUILDER = "che-builder"

def STASH_PJ = "release-package-json"
def STASH_VSCODE = "vscode-vsix"
def STASH_CHE = "che-vsix"

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
        timeout(time: 2, unit: "HOURS")
    }

    triggers {
        cron(CRON_STRING)
    }

    stages {
        stage("Set Codewind version") {
            when {
                equals expected: true, actual: IS_RELEASE_BRANCH
            }

            steps {
                container(VSCODE_BUILDER) {
                    dir("dev") {
                        println "Release branch detected; updating Codewind image version"
                        sh '''#!/usr/bin/env node
                            const fs = require("fs");
                            const { promisify } = require("util");

                            const PJ = "package.json";

                            (async function() {
                                const packageJsonStr = await promisify(fs.readFile)(PJ);
                                const packageJson = JSON.parse(packageJsonStr);
                                const codewindImageVersion = packageJson.version;

                                packageJson.codewindImageVersion = codewindImageVersion;

                                await promisify(fs.writeFile)(PJ, JSON.stringify(packageJson, undefined, 4));

                                console.log(`Updated ${PJ} to have codewindImageVersion=${codewindImageVersion}`);
                            })().catch((err) => {
                                console.error(err);
                                process.exit(1);
                            });
                        '''
                        stash includes: "package.json", name: STASH_PJ
                    }
                }
            }
        }

        stage("Test") {
            when {
                beforeAgent true
                not {
                    environment name: "SKIP_TESTS", value: "true"
                }
            }

            options {
                timeout(time: 1, unit: "HOURS")
            }

            agent {
                label "docker-build"
            }

            steps {
                script {
                    if (IS_RELEASE_BRANCH) {
                        unstash STASH_PJ

                        sh '''#!/usr/bin/env bash
                            echo "Unstashed release package.json"
                            mv -v package.json dev/
                        '''
                    }
                }
                sh '''#!/usr/bin/env bash
                    echo "Git commit is: $(git log --format=medium -1 ${GIT_COMMIT})"
                    ./ci-scripts/run-tests.sh
                '''
            }
        }

        // we duplicate the cloned repo so that we can build vscode and che-theia in parallel without the builds interfering with one another
        // see that 'build for che' uses a different dir
        stage("Duplicate code") {
            steps {
                container(VSCODE_BUILDER) {
                    sh '''#!/usr/bin/env bash
                        set -x
                        cd ..
                        cp -r "$OLDPWD" codewind-che
                    '''
                }
            }
        }

        stage("Build") {
            // In the build containers, HOME gets set to / which causes permissions issues.
            environment {
                HOME="${env.WORKSPACE}"
            }

            parallel {
                stage("Build for VS Code") {
                    steps {
                        container(VSCODE_BUILDER) {
                            sh 'ci-scripts/package.sh'
                            // The parallel stages cannot share a stash or they will overwrite and corrupt each other
                            stash includes: '*.vsix', name: STASH_VSCODE
                        }
                    }
                }
                stage("Build for Che") {
                    steps {
                        container(CHE_BUILDER) {
                            // use the dir from the duplicate step
                            dir("../codewind-che") {
                                sh 'ci-scripts/package.sh che'
                                stash includes: '*.vsix', name: STASH_CHE
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
                    unstash STASH_VSCODE
                    unstash STASH_CHE

                    sh '''#!/usr/bin/env bash
                    export REPO_NAME="codewind-vscode"
                    export OUTPUT_NAME="codewind"
                    export OUTPUT_CHE_NAME="codewind-che"
                    export DOWNLOAD_AREA_URL="https://archive.eclipse.org/codewind/$REPO_NAME"
                    export LATEST_DIR="latest"
                    export BUILD_INFO="build_info.properties"
                    export sshHost="genie.codewind@projects-storage.eclipse.org"
                    export deployParentDir="/home/data/httpd/archive.eclipse.org/codewind/$REPO_NAME"
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
    }

    post {
        failure {
            sendEmailNotification()
        }
    }
}
