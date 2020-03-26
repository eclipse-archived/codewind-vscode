// Adapted from https://github.com/microsoft/vscode-extension-samples/blob/master/webpack-sample/webpack.config.js

//@ts-check

"use strict";

const path = require("path");

// Webpack with --watch doesn't output a message when it's done.
// This makes it do that, so that my VS Code task for webpack watch can detect the compilation is finished.
// https://github.com/TypeStrong/ts-loader/issues/660#issuecomment-574712572
/**@type {import("webpack").Plugin} */
class VSCodeTaskHelperPlugin {

    constructor() {
        this.pluginName = "VSCodeTaskHelperPlugin";
    }

    /**
     * @param {import("webpack").Compiler} compiler
     * @returns {void}
     */
    apply(compiler) {
        // compiler.hooks.beforeCompile.tap(this.pluginName, (compiler) => {
        //     console.log("### Starting compilation...");
        // });

        compiler.hooks.done.tap(this.pluginName, (stats) => {
            const statsStr = stats.toString;

            stats.toString = function (options) {
                const statsString = statsStr.call(this, options);
                return `${statsString}\r\n\r\n### Finished compiling!`;
            };
        });
    }
}

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
        target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
        node: {
            // https://github.com/webpack/webpack/issues/1599#issuecomment-247041126
            __dirname: false
        },
        entry,
        output: { // the output bundle is stored in the "dist" folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
            path: path.resolve(__dirname, "dist"),
            filename: "extension.js",
            libraryTarget: "commonjs2",
            devtoolModuleFilenameTemplate: "../[resource-path]",
        },
        externals: {
            vscode: "commonjs vscode" // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'd, 📖 -> https://webpack.js.org/configuration/externals/
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
            new VSCodeTaskHelperPlugin(),
        ]
    }

    return config;
};
