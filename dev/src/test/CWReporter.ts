import Mocha from "mocha";
import * as path from "path";

export default class CWReporter extends Mocha.reporters.base {

    public readonly _specReporter: Mocha.reporters.Spec;
    public readonly _jsonReporter: Mocha.reporters.Doc;

    constructor(
        runner: Mocha.Runner,
        options: Mocha.MochaOptions
    ) {
        super(runner, options);
        this._specReporter = new Mocha.reporters.Spec(runner, options);
        this._jsonReporter = new Mocha.reporters.Doc(runner, {
            reporterOptions: {
                output: path.join(__dirname, "test-results.html"),
            },
            ...options
        });
    }
}

// export default CWReporter;
