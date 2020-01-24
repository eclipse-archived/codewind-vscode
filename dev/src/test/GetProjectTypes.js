#!/usr/bin/env node

const request = require("request-promise-native");
const path = require("path");

const CW_INDEX_URL = "https://raw.githubusercontent.com/codewind-resources/codewind-templates/master/devfiles/index.json";
const APPSODY_INDEX_URL = "https://github.com/appsody/stacks/releases/latest/download/incubator-index.json";

async function getJSONArray(url) {
    const result = await request.get(url);
    if (!result.startsWith("[")) {
        throw new Error(`Unexpected non-json-array response from ${url}: ${JSON.stringify(result)}`);
    }
    return JSON.parse(result);
}

async function main() {
    const cwTemplates = await getJSONArray(CW_INDEX_URL);
    const templateNames = cwTemplates.map((template) => {
        // eg https://github.com/codewind-resources/nodeExpressTemplate => nodeExpressTemplate
        const location = template.location;
        /*
        return {
            type: "codewind",
            name: path.basename(location),
            // location,
        };*/
        return path.basename(location);
    });
    console.log(`Codewind template names:\n${templateNames.join("\n")}`);
    console.log();

    const appsodyStacks = await getJSONArray(APPSODY_INDEX_URL);
    const stackNames = appsodyStacks.map((stack) => {
        // eg https://github.com/appsody/stacks/releases/download/java-microprofile-v0.2.21/incubator.java-microprofile.v0.2.21.templates.default.tar.gz -> java-microprofile
        const location = stack.location;
        const nameWithVersion = path.basename(path.dirname(location));
        const stackLabel = nameWithVersion.substring(0, nameWithVersion.indexOf("-v"));

        // some stacks have the same name but different 'types', eg spring boot 'default' vs 'kotlin'.
        // eg. 'default' in 'incubator.java-spring-boot2.v0.3.22.templates.default.tar.gz'
        const basenameSplit = path.basename(location).split(".");
        const subType = basenameSplit[basenameSplit.length - 3];

        // let subTypeOutput = undefined;
        if (!["default", "simple"].includes(subType)) {
            // ignore the duplicates, if we want to test them we'll figure that out later :)
            // subTypeOutput = ` (${subType})`;
            return undefined;
        }
        /*
        return {
            type: "appsody",
            name: stackLabel,
            // location
        };
        */
       return stackLabel;
    });
    console.log(`Appsody stack names:\n${stackNames.filter((stackName) => stackName != null).join("\n")}`);

    // const templatesStr = JSON.stringify(templateNames.concat(stackNames)).replace(/},/g, "},\n");
    // console.log(`The tests support the following templates/stacks:`, templatesStr);
}

main()
.then(() => {
    // console.log("Done");
})
.catch((err) => {
    console.error(err);
    process.exit(1);
});
