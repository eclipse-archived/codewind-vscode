## Codewind for VS Code tests

To run the integration tests:
1. In `dev/launch.json`, locate the `Extension Tests` launch configuration and add an argument for the workspace directory to use. The workspace directory must exist before you run the launch.
2. See `index.ts` for the suites to run, and edit the index or the suites if you want to run different tests.
3. See `TestConfig.ts` for the project types to test.
4. Set `CWTEST_APPSODY=true` in the environment (eg, in the `Extension Tests` launch's `env` section) to test Appsody project types.
5. Run the `Extension Tests` launch.

### Some tests must execute after others
- The `Base` test activates the extension, and must always run first.
- The `LocalStart` test must run second, to start Codewind. This will eventually be replacable by creating a remote connection and providing that to the other tests instead.
- The `TemplateSources` test enables the Codewind and Appsody sources. These are enabled by default right now, but if that changes, this test will have to run before the Creation test.
- All Project tests must run after the `Creation` test.

The order in the suite file is followed, due to how `index.ts` loads the tests instead of letting Mocha discover them with a glob. In that case, alphabetical order would be used.

### What's up with the "wrapper" `describe` blocks, and `stub` tests?

I wanted to dynamically generate the Project tests based on the project types selected. But, I had to know which projects were created first, which is done asynchronously in `Creation.test.ts`, and imported into the other files.
Before running any tests, Mocha reads through all the test files to get the lists of tests to run. This meant it would execute `testProject.forEach` before `testProjects` was populated, and thus generate no tests.
The [Mocha example](https://mochajs.org/#dynamically-generating-tests) for dynamic tests does not help for the async case, so I found [this workaround](https://stackoverflow.com/questions/22465431/how-can-i-dynamically-generate-test-cases-in-javascript-node/54681623#54681623), which works great, even if it is a bit of a hack.
