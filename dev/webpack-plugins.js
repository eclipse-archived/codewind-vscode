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

const path = require("path");


/**
 * @type {import("webpack").Plugin}
 * Webpack with --watch doesn't output a message when it's done.
 * This makes it do that, so that my VS Code task for webpack watch can detect the compilation is finished.
 * https://github.com/TypeStrong/ts-loader/issues/660#issuecomment-574712572
 */
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
            const statsToStr = stats.toString;

            stats.toString = function (options) {
                const statsString = statsToStr.call(this, options);
                return `${statsString}\n\n### Webpack finished compiling!`;
            };
        });
    }
}


/**
 * @type {import("webpack").Plugin}
 * This plugin fails the webpack build if at least one 'critical dependency' warning is seen.
 * See https://code.visualstudio.com/api/working-with-extensions/bundling-extension#webpack-critical-dependencies
*/
class FailOnCriticalDependencyPlugin {
    constructor() {
        this.pluginName = "FailOnCriticalDependencyPlugin";
    }

    /**
     * @param {import("webpack").Compiler} compiler
     * @returns {void}
     */
    apply(compiler) {
        compiler.hooks.afterCompile.tap(this.pluginName, async (_compiler) => {
            console.log(`Scanning for critical dependency warnings...`);
        });

        compiler.hooks.shouldEmit.tap(this.pluginName, (compilation) => {
            const criticalWarnings = compilation.warnings.filter((warning) => {
                return warning.message.toLowerCase().includes("critical dependency");
            });

            if (criticalWarnings.length > 0) {
                const warningsStr = criticalWarnings.map(this.getWarningTrace).join("\n\n");
                console.error(warningsStr, "\n");
                console.error(`Externalize the dependency or remove any dynamic 'require's to resolve this issue.\n` +
                    `See https://code.visualstudio.com/api/working-with-extensions/bundling-extension#webpack-critical-dependencies`, "\n");
                process.exit(1);
            }
            console.log(`No critical dependency warnings found`, "\n");
            return true;
        });
    }

    getWarningTrace(warning) {
        let error = warning.message;

        let module = warning.module;
        error += `\n@ ./${path.relative(process.cwd(), module.resource)}:${warning.loc.start.line}:${warning.loc.start.column}-${warning.loc.end.column}`;

        while (module.issuer != null) {
            error += `\n@ ./${path.relative(process.cwd(), module.issuer.resource)}`;
            module = module.issuer;
        }

        return error;
    }
}

module.exports = {
    VSCodeTaskHelperPlugin,
    FailOnCriticalDependencyPlugin
}
