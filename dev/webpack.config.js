// Adapted from https://github.com/microsoft/vscode-extension-samples/blob/master/webpack-sample/webpack.config.js

//@ts-check

"use strict";

const path = require("path");
const { FailOnCriticalDependencyPlugin, VSCodeTaskHelperPlugin } = require("./webpack-plugins");

/**
 * @param {string} env
 */
module.exports = (env) => {
    const useDevMode = env === "dev";
    const mode = useDevMode ? "development" : "production";
    // const devtool = useDevMode ? "eval-source-map" : "inline-source-map";
    const devtool = "inline-source-map";

    const entry = "./src/extension.ts";     // https://webpack.js.org/configuration/entry-context/

    console.log("Webpack mode " + mode);
    // console.log("env", process.env);

    /**@type {import("webpack").Configuration}*/
    const config = {
        mode,
        devtool,
        target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node
        entry,
        output: { // the output bundle is stored in the "dist" folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
            path: path.resolve(__dirname, "dist"),
            filename: "extension.js",
            libraryTarget: "commonjs2",
            devtoolModuleFilenameTemplate: "../[resource-path]",
        },
        externals: {
            // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'd, 📖 -> https://webpack.js.org/configuration/externals/
            vscode: "commonjs vscode",

            // Place 'critical dependencies' here - See https://code.visualstudio.com/api/working-with-extensions/bundling-extension#webpack-critical-dependencies
            // Anything excluded here needs to be excluded with a negative glob in .vscodeignore

            // keyv/index.js has a dynamic require which causes us to have to bundle it statically with its single dependency
            keyv: "keyv",
            "json-buffer": "json-buffer",
        },
        resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
            extensions: [".ts", ".js" ]
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: "ts-loader"
            }, {
                test: /\.node$/,
                use: "node-loader"
            }
        ]},
        plugins: [
            new FailOnCriticalDependencyPlugin(),
            new VSCodeTaskHelperPlugin(),
        ]
    }

    return config;
};
