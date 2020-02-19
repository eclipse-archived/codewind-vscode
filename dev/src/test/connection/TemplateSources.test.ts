/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { expect } from "chai";

import { SourceProjectStyles } from "../../codewind/connection/TemplateSourceList";
import Requester from "../../codewind/project/Requester";

import { connection } from "../local/LocalStart.test";
import { SourceEnablement } from "../../codewind/Types";

describe(`Template sources`, function() {

    before(`should use the precreated connection`, function() {
        expect(connection, `The connection does not exist`).to.exist;
        expect(connection.isConnected, `The connection is not connected`).to.be.true;
    });

    const NO_DEFAULT_SOURCES = 3;

    it(`should have the default sources`, async function() {
        const templateSources = await connection.templateSourcesList.get();
        expect(templateSources).to.exist;
        expect(templateSources).to.have.length.of.at.least(NO_DEFAULT_SOURCES);

        const projectStyles = await connection.templateSourcesList.getProjectStyles();
        expect(projectStyles).to.contain(SourceProjectStyles.CODEWIND, SourceProjectStyles.APPSODY);
    });

    it(`should have all sources disabled`, async function() {
        const templateSources = await connection.templateSourcesList.get();
        const noSourcesEnablement: SourceEnablement = {
            repos: templateSources.map((source) => {
                return {
                    repoID: source.url,
                    enable: false,
                };
            })
        };
        await connection.templateSourcesList.toggleEnablement(noSourcesEnablement);

        const newTemplateSources = await connection.templateSourcesList.get();
        // the templates are still there
        expect(newTemplateSources).to.have.length.of.at.least(NO_DEFAULT_SOURCES);
        // but now they are not enabled
        const enabledSources = await connection.templateSourcesList.getEnabled();
        expect(enabledSources).to.have.length(0);
        const templates = await Requester.getTemplates(connection);
        // no sources -> no templates
        expect(templates).to.have.length(0);
    });

    // as of 22 Jan 2020
    const NO_CODEWIND_TEMPLATES = 8;
    const NO_APPSODY_STACKS = 11;

    it(`should enable the Codewind template source`, async function() {
        const templateSources = await connection.templateSourcesList.get();

        // The codewind source is at https://github.com/codewind-resources/codewind-templates/blob/master/devfiles/index.json
        const codewindSource = templateSources.find((source) => source.url.includes("codewind-templates"));
        expect(codewindSource, `Codewind source was not found`).to.exist;

        // This request body will disable all sources except the default Codewind one.
        const codewindSourceOnlyEnablement: SourceEnablement = {
            repos: [{
                enable: true,
                repoID: codewindSource!.url,
            }]
        };

        await connection.templateSourcesList.toggleEnablement(codewindSourceOnlyEnablement);

        const newEnabledTemplateSources = (await connection.templateSourcesList.getEnabled());
        expect(newEnabledTemplateSources).to.have.length(1);
        const enabledStyles = await connection.templateSourcesList.getProjectStyles(true);
        expect(enabledStyles).to.contain(SourceProjectStyles.CODEWIND);
        expect(enabledStyles).to.not.contain(SourceProjectStyles.APPSODY);

        // Templates should have updated to include the codewind templates.
        const templates = await Requester.getTemplates(connection);
        expect(templates).to.have.length.of.at.least(NO_CODEWIND_TEMPLATES);
        // Appsody templates should still be disabled.
        const appsodyTemplates = templates.filter((template) => template.projectType.includes("appsody"));
        expect(appsodyTemplates).to.be.empty;
    });

    it(`should enable the Appsody stack source`, async function() {
        const templateSources = await connection.templateSourcesList.get();

        // The appsody source is at https://github.com/appsody/stacks/releases/latest/download/incubator-index.json
        const appsodySource = templateSources.find((source) => source.url.includes("appsody/stacks"));
        expect(appsodySource, `Appsody source was not found`).to.exist;

        // This request body will disable all sources except the default Codewind one.
        const appsodySourceEnablement: SourceEnablement = {
            repos: [{
                enable: true,
                repoID: appsodySource!.url,
            }]
        };

        await connection.templateSourcesList.toggleEnablement(appsodySourceEnablement);

        const newEnabledTemplateSources = (await connection.templateSourcesList.getEnabled());
        expect(newEnabledTemplateSources).to.have.length(2);
        const enabledStyles = await connection.templateSourcesList.getProjectStyles(true);
        expect(enabledStyles).to.contain(SourceProjectStyles.CODEWIND);
        expect(enabledStyles).to.contain(SourceProjectStyles.APPSODY);

        const templates = await Requester.getTemplates(connection);
        expect(templates).to.have.length.of.at.least(NO_APPSODY_STACKS);
        const appsodyTemplates = templates.filter((template) => template.projectType.includes("appsody"));
        expect(appsodyTemplates).to.have.length.of.at.least(NO_APPSODY_STACKS);
    });

    const TEST_SOURCE_URL = "https://raw.githubusercontent.com/tetchel/codewind-templates/master/devfiles/index2.json";
    const TEST_SOURCE_NAME = "Test Source";
    const TEST_SOURCE_DESCR = "It is a template source for the tests to use";
    const TEST_SOURCE_NO_TEMPLATES = 8;

    it(`should add a new template source`, async function() {
        const oldSources = await connection.templateSourcesList.get();
        const oldTemplates = await Requester.getTemplates(connection);

        await connection.templateSourcesList.add(TEST_SOURCE_URL, TEST_SOURCE_NAME, TEST_SOURCE_DESCR);
        const newSources = await connection.templateSourcesList.get();
        expect(newSources).to.have.length(oldSources.length + 1);

        const newSource = newSources.find((source) => source.url === TEST_SOURCE_URL)!;
        expect(newSource).to.exist;
        expect(newSource.name).to.equal(TEST_SOURCE_NAME);
        expect(newSource.description).to.equal(TEST_SOURCE_DESCR);
        expect(newSource.protected).to.equal(false);

        const newTemplates = await Requester.getTemplates(connection);
        expect(newTemplates).to.have.length(oldTemplates.length + TEST_SOURCE_NO_TEMPLATES);
    });

    it(`should remove the new template source`, async function() {
        const oldSources = await connection.templateSourcesList.get();
        const oldTemplates = await Requester.getTemplates(connection);

        await connection.templateSourcesList.remove(TEST_SOURCE_URL);
        const newSources = await connection.templateSourcesList.get();
        expect(newSources).to.have.length(oldSources.length - 1);

        const newTemplates = await Requester.getTemplates(connection);
        expect(newTemplates).to.have.length(oldTemplates.length - TEST_SOURCE_NO_TEMPLATES);
    });
});
