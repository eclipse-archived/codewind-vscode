/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// Validation was removed sometime in the shift from Microclimate -> Codewind.

/*
describe(`Project validation`, function() {
    let validatorWorked = false;
    it(`${testType.projectType} - should have a validation error after deleting the Dockerfile`, async function() {
        expect(project, "Failed to get test project").to.exist;
        this.timeout(TestUtil.getMinutes(1));

        Log.t(`${project.name}: Deleting Dockerfile`);
        const existingDiagnostics = vscode.languages.getDiagnostics(project.localPath);
        if (existingDiagnostics.length !== 0) {
            Log.t(`Project ${project.name} has existing diagnostics`, existingDiagnostics);
        }

        const dockerfilePath = getDockerfilePath(project);
        Log.t("Deleting " + dockerfilePath);
        fs.unlinkSync(dockerfilePath);

        await vscode.commands.executeCommand(Commands.VALIDATE, project);
        await TestUtil.wait(2500, "Waiting for validation");

        const diagnostics = vscode.languages.getDiagnostics(project.localPath);
        Log.t(`${project.name} diagnostics after deleting Dockerfile are:`, diagnostics);

        const newDiagnosticIndex = existingDiagnostics.length;
        expect(diagnostics, "New diagnostic was not created").to.have.length(newDiagnosticIndex + 1);

        const diagnostic = diagnostics[newDiagnosticIndex];
        expect(diagnostic, "New diagnostic is missing").to.exist;
        expect(diagnostic!.source!.toLowerCase(), "Diagnostic did not have the right source").to.equal("codewind");
        validatorWorked = true;
    });

    it(`${testType.projectType} - should be able to regenerate the removed Dockerfile`, async function() {
        expect(project, "Failed to get test project").to.exist;
        expect(validatorWorked, "Precondition failed").to.be.true;
        this.timeout(TestUtil.getMinutes(1));

        Log.t(`${project.name}: Testing generating Dockerfile and removing validation error`);

        const existingDiagnostics = vscode.languages.getDiagnostics(project.localPath);
        Log.t(`${project.name} has ${existingDiagnostics.length} diagnostics`);

        // TODO
        // await Requester.requestGenerate(project);
        await TestUtil.wait(2500, "Waiting for Dockerfile to be regenerated");

        const dockerfilePath = getDockerfilePath(project);
        expect(fs.existsSync(dockerfilePath), `Dockerfile does not exist at ${dockerfilePath} after generation`).to.be.true;
        Log.t("Dockerfile was regenerated successfully");

        const diagnostics = vscode.languages.getDiagnostics(project.localPath);
        if (diagnostics.length > 0) {
            Log.t("New diagnostics:", diagnostics);
        }
        expect(diagnostics, "Diagnostic was not removed").to.have.length(existingDiagnostics.length - 1);
    });
});

export function getDockerfilePath(project: Project): string {
    return path.join(project.localPath.fsPath, "Dockerfile");
}
*/
