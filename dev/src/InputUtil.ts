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
import Log from "./Logger";
import CWExtensionContext from "./CWExtensionContext";

namespace InputUtil {

    export const BTN_BACK = "$btn-back";

    export type InputUtilButton = vscode.QuickInputButton & { onClick: () => void | Promise<void>, closeOnClick?: boolean };

    interface InputStepOptions {
        buttons?: InputUtilButton[];
        placeholder?: string;
        showBackBtn?: boolean;
        supressPostDelay?: boolean;
        stepNum?: {
            step: number,
            totalSteps: number,
        };
        title?: string;
    }

    export interface InputBoxOptions extends InputStepOptions {
        allowEmpty?: boolean;
        value?: string;
        password?: boolean;
        postAcceptValidator?: {
            test: (value: string) => Promise<string | undefined>,
            msg: string,
        },
        prompt?: string;
        promptGenerator?: (...previousValues: string[]) => string;
        validator?: (value: string) => string | undefined;
    }

    export interface QuickPickOptions<T extends vscode.QuickPickItem> extends InputStepOptions {
        items: T[] | { fetchMsg: string, fetchItems: () => Promise<T[]> };
        matchOnDescription?: boolean;
        matchOnDetail?: boolean;
    }

    export async function showQuickPick<T extends vscode.QuickPickItem>(qpOptions: QuickPickOptions<T>, qp_?: vscode.QuickPick<T>)
        : Promise<T | undefined> {

        const qp = qp_ || vscode.window.createQuickPick<T>();
        applyCommon(qpOptions, qp);
        qp.matchOnDescription = qpOptions.matchOnDescription || false;
        qp.matchOnDetail = qpOptions.matchOnDetail || false;

        if (Array.isArray(qpOptions.items)) {
            qp.items = qpOptions.items;
        }
        else {
            if (!CWExtensionContext.get().isTheia) {
                // Theia quickpicks misbehave if the quickpick is shown before populating the items
                // https://github.com/eclipse-theia/theia/issues/6221#issuecomment-533268856
                // In VS Code, the items are populated after showing, so we can show the quickpick sooner, which looks better.
                qp.show();
            }

            // busy and enabled have no effect in theia https://github.com/eclipse-theia/theia/issues/5059
            qp.busy = true;
            qp.enabled = false;
            qp.placeholder = qpOptions.items.fetchMsg;

            try {
                qpOptions.items.fetchItems()
                .then((items) => {
                    if (items.length === 0 || items == null) {
                        Log.e(`No items to show in QuickPick with title ${qpOptions.title}`)
                        qp.dispose();
                    }
                    qp.items = items;
                    qp.busy = false;
                    qp.enabled = true;
                    qp.placeholder = qpOptions.placeholder;
                });
            }
            catch (err) {
                qp.dispose();
                throw err;
            }
        }

        const disposables: vscode.Disposable[] = [];

        const result = await new Promise<T | undefined>((resolve, reject) => {
            disposables.push(applyOnDidTriggerButton(qpOptions, qp, reject));

            // it looks funny to use onDidChangeSelection instead of onDidAccept,
            // but it behaves the same when there's just one item since we can only make one selection.
            // this is a workaround for https://github.com/eclipse-theia/theia/issues/6221
            // but it means that canSelectMany must be false.
            disposables.push(
                qp.onDidChangeSelection((selected) => {
                    resolve(selected[0]);
                })
            );
            disposables.push(
                qp.onDidHide(() => {
                    resolve(undefined);
                })
            );

            qp.show();
        })
        .finally(() => {
            qp.dispose();
            disposables.forEach((d) => d.dispose());
        });

        if (!qpOptions.supressPostDelay) {
            // Add a brief delay while the wizard disposes https://github.com/eclipse/codewind/issues/2330
            await MCUtil.delay(10);
        }
        return result;
    }

    export async function showInputBox(ibOptions: InputBoxOptions, ib_?: vscode.InputBox): Promise<string | undefined> {
        const ib = ib_ || vscode.window.createInputBox();
        applyCommon(ibOptions, ib);
        ib.prompt = ibOptions.prompt;
        ib.value = ibOptions.value || "";
        ib.password = ibOptions.password || false;

        ib.validationMessage = undefined;

        const disposables: vscode.Disposable[] = [];

        if (ibOptions.validator) {
            disposables.push(
                ib.onDidChangeValue((value) => {
                    if (ibOptions.validator) {
                        const invalidMsg = ibOptions.validator(value);
                        ib.validationMessage = invalidMsg;
                    }
                })
            );
        }

        // We should only have to show the IB once, but in theia, the IB is hidden after accept
        const result = await new Promise<string | undefined>((resolve, reject) => {
            disposables.push(applyOnDidTriggerButton(ibOptions, ib, reject));

            disposables.push(
                ib.onDidHide(() => {
                    return resolve(undefined);
                })
            );

            disposables.push(
                ib.onDidAccept(async () => {
                    const value = ib.value;
                    if (value === "" && ibOptions.allowEmpty !== true) {
                        ib.validationMessage = "The input cannot be empty.";
                        return;
                    }
                    else if (ib.validationMessage) {
                        // input is invalid
                        return;
                    }
                    else if (ibOptions.postAcceptValidator) {
                        const testResult = await vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            cancellable: false,
                            title: ibOptions.postAcceptValidator.msg,
                        }, () => {
                            return ibOptions.postAcceptValidator!.test(value);
                        });

                        if (testResult) {
                            // test failed
                            ib.validationMessage = testResult;
                            return;
                        }
                    }

                    return resolve(value);
                })
            );
            ib.show();
        })
        .finally(() => {
            ib.dispose();
            disposables.forEach((d) => d.dispose());
        });

        if (!ibOptions.supressPostDelay) {
            // Add a brief delay while the wizard disposes https://github.com/eclipse/codewind/issues/2330
            await MCUtil.delay(10);
        }
        return result;
    }

    function applyCommon(stepOptions: InputStepOptions, input: vscode.QuickPick<vscode.QuickPickItem> | vscode.InputBox): void {
        input.ignoreFocusOut = true;
        input.title = stepOptions.title;
        if (stepOptions.stepNum) {
            input.step = stepOptions.stepNum.step;
            input.totalSteps = stepOptions.stepNum.totalSteps;
        }
        input.placeholder = stepOptions.placeholder;

        const buttons = stepOptions.buttons || [];
        if (stepOptions.showBackBtn) {
            input.buttons = [ ...buttons, vscode.QuickInputButtons.Back ];
        }
        else {
            input.buttons = buttons;
        }
    }

    function applyOnDidTriggerButton(stepOptions: InputStepOptions, input: vscode.QuickPick<vscode.QuickPickItem> | vscode.InputBox,
        reject: (reason: string) => void): vscode.Disposable {

        const buttons = stepOptions.buttons || [];

        return input.onDidTriggerButton((clickedBtn) => {
            if (clickedBtn === vscode.QuickInputButtons.Back) {
                return reject(BTN_BACK);
            }

            buttons.find((btn) => {
                if (clickedBtn.iconPath === btn.iconPath && clickedBtn.tooltip === btn.tooltip) {
                    try {
                        btn.onClick();
                        if (btn.closeOnClick) {
                            input.dispose();
                        }
                    }
                    catch (err) {
                        Log.e(`Error executing button ${btn.tooltip} onClick`, err);
                    }
                }
            });
        });
    }

    export async function runMultiStepInput(title: string, steps: InputBoxOptions[]): Promise<string[] | undefined> {
        const ib = vscode.window.createInputBox();
        // Log.d("IB SHOW");
        // ib.show();

        const results = [];

        for (let i = 0; i < steps.length; i++) {
            try {
                const step = steps[i];

                if (results[i]) {
                    // this step has run before (and user clicked Back) so prefill the previous value
                    step.value = results[i];
                }

                step.title = title;
                step.stepNum = {
                    step: i + 1,
                    totalSteps: steps.length,
                }

                let prompt;
                if (step.promptGenerator) {
                    prompt = step.promptGenerator(...results);
                }
                else if (step.prompt) {
                    prompt = step.prompt;
                }

                const result = await showInputBox({
                    ...step,
                    prompt,
                    showBackBtn: step.stepNum.step > 1,
                    supressPostDelay: step.stepNum.step < step.stepNum.totalSteps,
                });

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

        return results;
    }
}

export default InputUtil;
