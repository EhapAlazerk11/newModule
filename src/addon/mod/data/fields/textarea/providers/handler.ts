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
import { Injector, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AddonModDataFieldTextHandler } from '../../text/providers/handler';
import { AddonModDataFieldTextareaComponent } from '../component/textarea';
import { CoreTextUtilsProvider } from '@providers/utils/text';

/**
 * Handler for textarea data field plugin.
 */
@Injectable()
export class AddonModDataFieldTextareaHandler extends AddonModDataFieldTextHandler {
    name = 'AddonModDataFieldTextareaHandler';
    type = 'textarea';

    constructor(protected translate: TranslateService, private textUtils: CoreTextUtilsProvider) {
        super(translate);
    }

    /**
     * Return the Component to use to display the plugin data.
     * It's recommended to return the class of the component, but you can also return an instance of the component.
     *
     * @param {Injector} injector Injector.
     * @param {any} field         The field object.
     * @return {any|Promise<any>} The component (or promise resolved with component) to use, undefined if not found.
     */
    getComponent(injector: Injector, plugin: any): any | Promise<any> {
        return AddonModDataFieldTextareaComponent;
    }

    /**
     * Get field edit data in the input data.
     *
     * @param  {any} field      Defines the field to be rendered.
     * @param  {any} inputData  Data entered in the edit form.
     * @return {any}            With name and value of the data to be sent.
     */
    getFieldEditData(field: any, inputData: any, originalFieldData: any): any {
        const fieldName = 'f_' + field.id;

        if (inputData[fieldName]) {
            const files = this.getFieldEditFiles(field, inputData, originalFieldData);
            let text = this.textUtils.restorePluginfileUrls(inputData[fieldName], files);

            // Add some HTML to the text if needed.
            text = this.textUtils.formatHtmlLines(text);

            return [{
                    fieldid: field.id,
                    value: text
                },
                {
                    fieldid: field.id,
                    subfield: 'content1',
                    value: 1
                },
                {
                    fieldid: field.id,
                    subfield: 'itemid',
                    files: files
                }
            ];
        }

        return false;
    }

    /**
     * Get field edit files in the input data.
     *
     * @param  {any} field               Defines the field..
     * @param  {any} inputData           Data entered in the edit form.
     * @param  {any} originalFieldData   Original field entered data.
     * @return {any}                     With name and value of the data to be sent.
     */
    getFieldEditFiles(field: any, inputData: any, originalFieldData: any): any {
        return (originalFieldData && originalFieldData.files) || [];
    }

    /**
     * Check and get field requeriments.
     *
     * @param  {any} field               Defines the field to be rendered.
     * @param  {any} inputData           Data entered in the edit form.
     * @return {string | false}                  String with the notification or false.
     */
    getFieldsNotifications(field: any, inputData: any): string | false {
        if (field.required) {
            if (!inputData || !inputData.length) {
                return this.translate.instant('addon.mod_data.errormustsupplyvalue');
            }

            const found = inputData.some((input) => {
                if (!input.subfield) {
                    return !!input.value;
                }

                return false;
            });

            if (!found) {
                return this.translate.instant('addon.mod_data.errormustsupplyvalue');
            }
        }

        return false;
    }

    /**
     * Override field content data with offline submission.
     *
     * @param  {any}  originalContent    Original data to be overriden.
     * @param  {any}  offlineContent     Array with all the offline data to override.
     * @param  {any}  [offlineFiles]     Array with all the offline files in the field.
     * @return {any}                     Data overriden
     */
    overrideData(originalContent: any, offlineContent: any, offlineFiles?: any): any {
        originalContent.content = offlineContent[''] || '';
        if (originalContent.content.length > 0 && originalContent.files && originalContent.files.length > 0) {
            // Take the original files since we cannot edit them on the app.
            originalContent.content = this.textUtils.replacePluginfileUrls(originalContent.content, originalContent.files);
        }

        return originalContent;
    }
}
