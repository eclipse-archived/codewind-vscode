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

import * as vscode from "vscode";

import MCUtil from "./MCUtil";

const BTN_BACK = "$btn-back";

namespace InputUtil {

    export interface InputStep {
        // title: string;
        // prompt?: string;
        allowEmpty?: boolean;
        promptGenerator: (...previousValues: string[]) => string;
        placeholder?: string;
        value?: string;
        password?: boolean;
        // step: number;
        // buttons?: vscode.QuickInputButton[];
        validator?: (value: string) => string | undefined;
    }

    export async function runMultiStepInput(title: string, steps: InputStep[]): Promise<string[] | undefined> {
        const ib = vscode.window.createInputBox();
        ib.title = title;
        ib.totalSteps = steps.length;
        ib.ignoreFocusOut = true;
        // Log.d("IB SHOW");
        // ib.show();

        const results = [];

        for (let i = 0; i < steps.length; i++) {
            try {
                const step = steps[i];
                const prompt = step.promptGenerator(...results);
                if (results[i]) {
                    // this step has run before (and user clicked Back) so prefill the previous value
                    step.value = results[i];
                }
                const result = await runInputStep(ib, i, prompt, step);
                if (result == null) {
                    // quit
                    ib.dispose();
                    return undefined;
                }
                results[i] = result;
            }
            catch (err) {
                if (err === BTN_BACK) {
                    i -= 2;
                    continue;
                }
                else {
                    // Log.d("IB hide - error");
                    ib.hide();
                    throw err;
                }
            }
        }
        ib.dispose();
        // Add a brief delay while the wizard disposes https://github.com/eclipse/codewind/issues/2330
        await MCUtil.delay(10);

        return results;
    }

    function runInputStep(ib: vscode.InputBox, stepIndex: number, prompt: string, step: InputStep): Promise<string | undefined> {
        // ib.title = step.title;
        ib.prompt = prompt;
        ib.placeholder = step.placeholder || "";
        ib.value = step.value || "";
        ib.password = step.password || false;
        ib.step = stepIndex + 1;
        ib.validationMessage = undefined;

        if (stepIndex > 0) {
            ib.buttons = [
                vscode.QuickInputButtons.Back,
            ];
        }
        else {
            ib.buttons = [];
        }

        const disposables: vscode.Disposable[] = [];

        if (step.validator) {
            disposables.push(
                ib.onDidChangeValue((value) => {
                    if (step.validator) {
                        const invalidMsg = step.validator(value);
                        ib.validationMessage = invalidMsg;
                    }
                })
            );
        }

        // We should only have to show the IB once, but in theia, the IB is hidden after accept
        ib.show();
        return new Promise<string | undefined>((resolve, reject) => {
            disposables.push(
                ib.onDidTriggerButton((_btn) => {
                    return reject(BTN_BACK);
                })
            );
            disposables.push(
                ib.onDidHide(() => {
                    return resolve(undefined);
                })
            );
            disposables.push(
                ib.onDidAccept(() => {
                    if (ib.value === "" && step.allowEmpty !== true) {
                        ib.validationMessage = "The input cannot be empty.";
                        return;
                    }
                    // We COULD block acceptance, if there is a validation message, here
                    return resolve(ib.value);
                })
            );
        })
        .finally(() => {
            disposables.forEach((d) => d.dispose());
        });
    }

}

export default InputUtil;
