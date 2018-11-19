
// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable, Injector } from '@angular/core';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreQuestionHandler } from '@core/question/providers/delegate';
import { AddonQtypeNumericalHandler } from '@addon/qtype/numerical/providers/handler';
import { AddonQtypeCalculatedComponent } from '../component/calculated';

/**
 * Handler to support calculated question type.
 */
@Injectable()
export class AddonQtypeCalculatedHandler implements CoreQuestionHandler {
    name = 'AddonQtypeCalculated';
    type = 'qtype_calculated';

    constructor(private utils: CoreUtilsProvider, private numericalHandler: AddonQtypeNumericalHandler,
            private domUtils: CoreDomUtilsProvider) { }

    /**
     * Return the Component to use to display the question.
     * It's recommended to return the class of the component, but you can also return an instance of the component.
     *
     * @param {Injector} injector Injector.
     * @param {any} question The question to render.
     * @return {any|Promise<any>} The component (or promise resolved with component) to use, undefined if not found.
     */
    getComponent(injector: Injector, question: any): any | Promise<any> {
        return AddonQtypeCalculatedComponent;
    }

    /**
     * Check if a response is complete.
     *
     * @param {any} question The question.
     * @param {any} answers Object with the question answers (without prefix).
     * @return {number} 1 if complete, 0 if not complete, -1 if cannot determine.
     */
    isCompleteResponse(question: any, answers: any): number {
        // This question type depends on numerical.
        if (this.isGradableResponse(question, answers) === 0 || !this.numericalHandler.validateUnits(answers['answer'])) {
            return 0;
        }

        if (this.requiresUnits(question)) {
            return this.isValidValue(answers['unit']) ? 1 : 0;
        }

        return -1;
    }

    /**
     * Whether or not the handler is enabled on a site level.
     *
     * @return {boolean|Promise<boolean>} True or promise resolved with true if enabled.
     */
    isEnabled(): boolean | Promise<boolean> {
        return true;
    }

    /**
     * Check if a student has provided enough of an answer for the question to be graded automatically,
     * or whether it must be considered aborted.
     *
     * @param {any} question The question.
     * @param {any} answers Object with the question answers (without prefix).
     * @return {number} 1 if gradable, 0 if not gradable, -1 if cannot determine.
     */
    isGradableResponse(question: any, answers: any): number {
        // This question type depends on numerical.
        let isGradable = this.isValidValue(answers['answer']);
        if (isGradable && this.requiresUnits(question)) {
            // The question requires a unit.
            isGradable = this.isValidValue(answers['unit']);
        }

        return isGradable ? 1 : 0;
    }

    /**
     * Check if two responses are the same.
     *
     * @param {any} question Question.
     * @param {any} prevAnswers Object with the previous question answers.
     * @param {any} newAnswers Object with the new question answers.
     * @return {boolean} Whether they're the same.
     */
    isSameResponse(question: any, prevAnswers: any, newAnswers: any): boolean {
        // This question type depends on numerical.
        return this.utils.sameAtKeyMissingIsBlank(prevAnswers, newAnswers, 'answer') &&
            this.utils.sameAtKeyMissingIsBlank(prevAnswers, newAnswers, 'unit');
    }

    /**
     * Check if a value is valid (not empty).
     *
     * @param {string|number} value Value to check.
     * @return {boolean} Whether the value is valid.
     */
    isValidValue(value: string | number): boolean {
        return !!value || value === '0' || value === 0;
    }

    /**
     * Check if a question requires units in a separate input.
     *
     * @param {any} question The question.
     * @return {boolean} Whether the question requires units.
     */
    requiresUnits(question: any): boolean {
        const element = this.domUtils.convertToElement(question.html);

        return !!(element.querySelector('select[name*=unit]') || element.querySelector('input[type="radio"]'));
    }
}
