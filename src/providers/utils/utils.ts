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

import { Injectable, NgZone } from '@angular/core';
import { Platform } from 'ionic-angular';
import { InAppBrowser, InAppBrowserObject } from '@ionic-native/in-app-browser';
import { Clipboard } from '@ionic-native/clipboard';
import { FileOpener } from '@ionic-native/file-opener';
import { WebIntent } from '@ionic-native/web-intent';
import { CoreAppProvider } from '../app';
import { CoreDomUtilsProvider } from './dom';
import { CoreMimetypeUtilsProvider } from './mimetype';
import { CoreEventsProvider } from '../events';
import { CoreLoggerProvider } from '../logger';
import { TranslateService } from '@ngx-translate/core';
import { CoreLangProvider } from '../lang';
import { CoreWSProvider, CoreWSError } from '../ws';

/**
 * Deferred promise. It's similar to the result of $q.defer() in AngularJS.
 */
export interface PromiseDefer {
    /**
     * The promise.
     * @type {Promise<any>}
     */
    promise?: Promise<any>;

    /**
     * Function to resolve the promise.
     *
     * @param {any} [value] The resolve value.
     */
    resolve?: (value?: any) => void; // Function to resolve the promise.

    /**
     * Function to reject the promise.
     *
     * @param {any} [reason] The reject param.
     */
    reject?: (reason?: any) => void;
}

/*
 * "Utils" service with helper functions.
 */
@Injectable()
export class CoreUtilsProvider {
    protected logger;
    protected iabInstance: InAppBrowserObject;
    protected uniqueIds: {[name: string]: number} = {};

    constructor(private iab: InAppBrowser, private appProvider: CoreAppProvider, private clipboard: Clipboard,
            private domUtils: CoreDomUtilsProvider, logger: CoreLoggerProvider, private translate: TranslateService,
            private platform: Platform, private langProvider: CoreLangProvider, private eventsProvider: CoreEventsProvider,
            private fileOpener: FileOpener, private mimetypeUtils: CoreMimetypeUtilsProvider, private webIntent: WebIntent,
            private wsProvider: CoreWSProvider, private zone: NgZone) {
        this.logger = logger.getInstance('CoreUtilsProvider');
    }

    /**
     * Similar to Promise.all, but if a promise fails this function's promise won't be rejected until ALL promises have finished.
     *
     * @param {Promise<any>[]} promises Promises.
     * @return {Promise<any>} Promise resolved if all promises are resolved and rejected if at least 1 promise fails.
     */
    allPromises(promises: Promise<any>[]): Promise<any> {
        if (!promises || !promises.length) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject): void => {
            const total = promises.length;
            let count = 0,
                error;

            promises.forEach((promise) => {
                promise.catch((err) => {
                    error = err;
                }).finally(() => {
                    count++;

                    if (count === total) {
                        // All promises have finished, reject/resolve.
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                });
            });
        });
    }

    /**
     * Converts an array of objects to an object, using a property of each entry as the key.
     * E.g. [{id: 10, name: 'A'}, {id: 11, name: 'B'}] => {10: {id: 10, name: 'A'}, 11: {id: 11, name: 'B'}}
     *
     * @param {any[]} array The array to convert.
     * @param {string} propertyName The name of the property to use as the key.
     * @param {any} [result] Object where to put the properties. If not defined, a new object will be created.
     * @return {any} The object.
     */
    arrayToObject(array: any[], propertyName: string, result?: any): any {
        result = result || {};
        array.forEach((entry) => {
            result[entry[propertyName]] = entry;
        });

        return result;
    }

    /**
     * Compare two objects. This function won't compare functions and proto properties, it's a basic compare.
     * Also, this will only check if itemA's properties are in itemB with same value. This function will still
     * return true if itemB has more properties than itemA.
     *
     * @param {any} itemA First object.
     * @param {any} itemB Second object.
     * @param {number} [maxLevels=0] Number of levels to reach if 2 objects are compared.
     * @param {number} [level=0] Current deep level (when comparing objects).
     * @param {boolean} [undefinedIsNull=true] True if undefined is equal to null. Defaults to true.
     * @return {boolean} Whether both items are equal.
     */
    basicLeftCompare(itemA: any, itemB: any, maxLevels: number = 0, level: number = 0, undefinedIsNull: boolean = true): boolean {
        if (typeof itemA == 'function' || typeof itemB == 'function') {
            return true; // Don't compare functions.
        } else if (typeof itemA == 'object' && typeof itemB == 'object') {
            if (level >= maxLevels) {
                return true; // Max deep reached.
            }

            let equal = true;
            for (const name in itemA) {
                const value = itemA[name];
                if (name == '$$hashKey') {
                    // Ignore $$hashKey property since it's a "calculated" property.
                    return;
                }

                if (!this.basicLeftCompare(value, itemB[name], maxLevels, level + 1)) {
                    equal = false;
                }
            }

            return equal;
        } else {
            if (undefinedIsNull && (
                (typeof itemA == 'undefined' && itemB === null) || (itemA === null && typeof itemB == 'undefined'))) {
                return true;
            }

            // We'll treat "2" and 2 as the same value.
            const floatA = parseFloat(itemA),
                floatB = parseFloat(itemB);

            if (!isNaN(floatA) && !isNaN(floatB)) {
                return floatA == floatB;
            }

            return itemA === itemB;
        }
    }

    /**
     * Blocks leaving a view.
     * @deprecated, use ionViewCanLeave instead.
     */
    blockLeaveView(): void {
        return;
    }

    /**
     * Close the InAppBrowser window.
     *
     * @param {boolean} [closeAll] Desktop only. True to close all secondary windows, false to close only the "current" one.
     */
    closeInAppBrowser(closeAll?: boolean): void {
        if (this.iabInstance) {
            this.iabInstance.close();
            if (closeAll && this.appProvider.isDesktop()) {
                require('electron').ipcRenderer.send('closeSecondaryWindows');
            }
        }
    }

    /**
     * Clone a variable. It should be an object, array or primitive type.
     *
     * @param {any} source The variable to clone.
     * @return {any} Cloned variable.
     */
    clone(source: any): any {
        if (Array.isArray(source)) {
            // Clone the array and all the entries.
            const newArray = [];
            for (let i = 0; i < source.length; i++) {
                newArray[i] = this.clone(source[i]);
            }

            return newArray;
        } else if (typeof source == 'object' && source !== null) {
            // Clone the object and all the subproperties.
            const newObject = {};
            for (const name in source) {
                newObject[name] = this.clone(source[name]);
            }

            return newObject;
        } else {
            // Primitive type or unknown, return it as it is.
            return source;
        }
    }

    /**
     * Copy properties from one object to another.
     *
     * @param {any} from Object to copy the properties from.
     * @param {any} to Object where to store the properties.
     * @param {boolean} [clone=true] Whether the properties should be cloned (so they are different instances).
     */
    copyProperties(from: any, to: any, clone: boolean = true): void {
        for (const name in from) {
            if (clone) {
                to[name] = this.clone(from[name]);
            } else {
                to[name] = from[name];
            }
        }
    }

    /**
     * Copies a text to clipboard and shows a toast message.
     *
     * @param {string} text Text to be copied
     * @return {Promise<any>} Promise resolved when text is copied.
     */
    copyToClipboard(text: string): Promise<any> {
        return this.clipboard.copy(text).then(() => {
            // Show toast using ionicLoading.
            return this.domUtils.showToast('core.copiedtoclipboard', true);
        }).catch(() => {
            // Ignore errors.
        });
    }

    /**
     * Create a "fake" WS error for local errors.
     *
     * @param {string} message The message to include in the error.
     * @param {boolean} [needsTranslate] If the message needs to be translated.
     * @return {CoreWSError} Fake WS error.
     */
    createFakeWSError(message: string, needsTranslate?: boolean): CoreWSError {
        return this.wsProvider.createFakeWSError(message, needsTranslate);
    }

    /**
     * Empties an array without losing its reference.
     *
     * @param {any[]} array Array to empty.
     */
    emptyArray(array: any[]): void {
        array.length = 0; // Empty array without losing its reference.
    }

    /**
     * Removes all properties from an object without losing its reference.
     *
     * @param {object} object Object to remove the properties.
     */
    emptyObject(object: object): void {
        for (const key in object) {
            if (object.hasOwnProperty(key)) {
                delete object[key];
            }
        }
    }

    /**
     * Execute promises one depending on the previous.
     *
     * @param {any[]} orderedPromisesData Data to be executed including the following values:
     *                                 - func: Function to be executed.
     *                                 - context: Context to pass to the function. This allows using "this" inside the function.
     *                                 - params: Array of data to be sent to the function.
     *                                 - blocking: Boolean. If promise should block the following.
     * @return {Promise<any>} Promise resolved when all promises are resolved.
     */
    executeOrderedPromises(orderedPromisesData: any[]): Promise<any> {
        const promises = [];
        let dependency = Promise.resolve();

        // Execute all the processes in order.
        for (const i in orderedPromisesData) {
            const data = orderedPromisesData[i];
            let promise;

            // Add the process to the dependency stack.
            promise = dependency.finally(() => {
                let prom;

                try {
                    prom = data.func.apply(data.context, data.params || []);
                } catch (e) {
                    this.logger.error(e.message);

                    return;
                }

                return prom;
            });
            promises.push(promise);

            // If the new process is blocking, we set it as the dependency.
            if (data.blocking) {
                dependency = promise;
            }
        }

        // Return when all promises are done.
        return this.allPromises(promises);
    }

    /**
     * Flatten an object, moving subobjects' properties to the first level using dot notation. E.g.:
     * {a: {b: 1, c: 2}, d: 3} -> {'a.b': 1, 'a.c': 2, d: 3}
     *
     * @param {object} obj Object to flatten.
     * @return {object} Flatten object.
     */
    flattenObject(obj: object): object {
        const toReturn = {};

        for (const name in obj) {
            if (!obj.hasOwnProperty(name)) {
                continue;
            }

            const value = obj[name];
            if (typeof value == 'object' && !Array.isArray(value)) {
                const flatObject = this.flattenObject(value);
                for (const subName in flatObject) {
                    if (!flatObject.hasOwnProperty(subName)) {
                        continue;
                    }

                    toReturn[name + '.' + subName] = flatObject[subName];
                }
            } else {
                toReturn[name] = value;
            }
        }

        return toReturn;
    }

    /**
     * Given an array of strings, return only the ones that match a regular expression.
     *
     * @param {string[]} array Array to filter.
     * @param {RegExp} regex RegExp to apply to each string.
     * @return {string[]} Filtered array.
     */
    filterByRegexp(array: string[], regex: RegExp): string[] {
        if (!array || !array.length) {
            return [];
        }

        return array.filter((entry) => {
            const matches = entry.match(regex);

            return matches && matches.length;
        });
    }

    /**
     * Filter the list of site IDs based on a isEnabled function.
     *
     * @param {string[]} siteIds Site IDs to filter.
     * @param {Function} isEnabledFn Function to call for each site. Must return true or a promise resolved with true if enabled.
     *                    It receives a siteId param and all the params sent to this function after 'checkAll'.
     * @param {boolean} [checkAll] True if it should check all the sites, false if it should check only 1 and treat them all
     *                   depending on this result.
     * @param {any} ...args All the params sent after checkAll will be passed to isEnabledFn.
     * @return {Promise<string[]>} Promise resolved with the list of enabled sites.
     */
    filterEnabledSites(siteIds: string[], isEnabledFn: Function, checkAll?: boolean, ...args: any[]): Promise<string[]> {
        const promises = [],
            enabledSites = [];

        for (const i in siteIds) {
            const siteId = siteIds[i];
            if (checkAll || !promises.length) {
                promises.push(Promise.resolve(isEnabledFn.apply(isEnabledFn, [siteId].concat(args))).then((enabled) => {
                    if (enabled) {
                        enabledSites.push(siteId);
                    }
                }));
            }
        }

        return this.allPromises(promises).catch(() => {
            // Ignore errors.
        }).then(() => {
            if (!checkAll) {
                // Checking 1 was enough, so it will either return all the sites or none.
                return enabledSites.length ? siteIds : [];
            } else {
                return enabledSites;
            }
        });
    }

    /**
     * Given a float, prints it nicely. Localized floats must not be used in calculations!
     * Based on Moodle's format_float.
     *
     * @param {any} float The float to print.
     * @return {string} Locale float.
     */
    formatFloat(float: any): string {
        if (typeof float == 'undefined') {
            return '';
        }

        const localeSeparator = this.translate.instant('core.decsep');

        // Convert float to string.
        float += '';

        return float.replace('.', localeSeparator);
    }

    /**
     * Returns a tree formatted from a plain list.
     * List has to be sorted by depth to allow this function to work correctly. Errors can be thrown if a child node is
     * processed before a parent node.
     *
     * @param {any[]} list List to format.
     * @param {string} [parentFieldName=parent] Name of the parent field to match with children.
     * @param {string} [idFieldName=id] Name of the children field to match with parent.
     * @param {number} [rootParentId=0] The id of the root.
     * @param {number} [maxDepth=5] Max Depth to convert to tree. Children found will be in the last level of depth.
     * @return {any[]} Array with the formatted tree, children will be on each node under children field.
     */
    formatTree(list: any[], parentFieldName: string = 'parent', idFieldName: string = 'id', rootParentId: number = 0,
            maxDepth: number = 5): any[] {
        const map = {},
            mapDepth = {},
            tree = [];
        let parent,
            id;

        list.forEach((node, index): void => {
            id = node[idFieldName];
            parent = node[parentFieldName];
            node.children = [];

            // Use map to look-up the parents.
            map[id] = index;
            if (parent != rootParentId) {
                const parentNode = list[map[parent]];
                if (parentNode) {
                    if (mapDepth[parent] == maxDepth) {
                        // Reached max level of depth. Proceed with flat order. Find parent object of the current node.
                        const parentOfParent = parentNode[parentFieldName];
                        if (parentOfParent) {
                            // This element will be the child of the node that is two levels up the hierarchy
                            // (i.e. the child of node.parent.parent).
                            list[map[parentOfParent]].children.push(node);
                            // Assign depth level to the same depth as the parent (i.e. max depth level).
                            mapDepth[id] = mapDepth[parent];
                            // Change the parent to be the one that is two levels up the hierarchy.
                            node.parent = parentOfParent;
                        }
                    } else {
                        parentNode.children.push(node);
                        // Increase the depth level.
                        mapDepth[id] = mapDepth[parent] + 1;
                    }
                }
            } else {
                tree.push(node);

                // Root elements are the first elements in the tree structure, therefore have the depth level 1.
                mapDepth[id] = 1;
            }
        });

        return tree;
    }

    /**
     * Get country name based on country code.
     *
     * @param {string} code Country code (AF, ES, US, ...).
     * @return {string} Country name. If the country is not found, return the country code.
     */
    getCountryName(code: string): string {
        const countryKey = 'assets.countries.' + code,
            countryName = this.translate.instant(countryKey);

        return countryName !== countryKey ? countryName : code;
    }

    /**
     * Get list of countries with their code and translated name.
     *
     * @return {Promise<any>} Promise resolved with the list of countries.
     */
    getCountryList(): Promise<any> {
        // Get the current language.
        return this.langProvider.getCurrentLanguage().then((lang) => {
            // Get the full list of translations. Create a promise to convert the observable into a promise.
            return new Promise((resolve, reject): void => {
                const observer = this.translate.getTranslation(lang).subscribe((table) => {
                    resolve(table);
                    observer.unsubscribe();
                }, (err) => {
                    reject(err);
                    observer.unsubscribe();
                });
            });
        }).then((table) => {
            const countries = {};

            for (const name in table) {
                if (name.indexOf('assets.countries.') === 0) {
                    const code = name.replace('assets.countries.', '');
                    countries[code] = table[name];
                }
            }

            return countries;
        });
    }

    /**
     * Get the mimetype of a file given its URL. It'll try to guess it using the URL, if that fails then it'll
     * perform a HEAD request to get it. It's done in this order because pluginfile.php can return wrong mimetypes.
     * This function is in here instead of MimetypeUtils to prevent circular dependencies.
     *
     * @param {string} url The URL of the file.
     * @return {Promise<string>} Promise resolved with the mimetype.
     */
    getMimeTypeFromUrl(url: string): Promise<string> {
        // First check if it can be guessed from the URL.
        const extension = this.mimetypeUtils.guessExtensionFromUrl(url),
            mimetype = this.mimetypeUtils.getMimeType(extension);

        if (mimetype) {
            return Promise.resolve(mimetype);
        }

        // Can't be guessed, get the remote mimetype.
        return this.wsProvider.getRemoteFileMimeType(url).then((mimetype) => {
            return mimetype || '';
        });
    }

    /**
     * Get a unique ID for a certain name.
     *
     * @param {string} name The name to get the ID for.
     * @return {number} Unique ID.
     */
    getUniqueId(name: string): number {
        if (!this.uniqueIds[name]) {
            this.uniqueIds[name] = 0;
        }

        return ++this.uniqueIds[name];
    }

    /**
     * Given a list of files, check if there are repeated names.
     *
     * @param {any[]} files List of files.
     * @return {string|boolean} String with error message if repeated, false if no repeated.
     */
    hasRepeatedFilenames(files: any[]): string | boolean {
        if (!files || !files.length) {
            return false;
        }

        const names = [];

        // Check if there are 2 files with the same name.
        for (let i = 0; i < files.length; i++) {
            const name = files[i].filename || files[i].name;
            if (names.indexOf(name) > -1) {
                return this.translate.instant('core.filenameexist', { $a: name });
            } else {
                names.push(name);
            }
        }

        return false;
    }

    /**
     * Gets the index of the first string that matches a regular expression.
     *
     * @param {string[]} array Array to search.
     * @param {RegExp} regex RegExp to apply to each string.
     * @return {number} Index of the first string that matches the RegExp. -1 if not found.
     */
    indexOfRegexp(array: string[], regex: RegExp): number {
        if (!array || !array.length) {
            return -1;
        }

        for (let i = 0; i < array.length; i++) {
            const entry = array[i],
                matches = entry.match(regex);

            if (matches && matches.length) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Return true if the param is false (bool), 0 (number) or "0" (string).
     *
     * @param {any} value Value to check.
     * @return {boolean} Whether the value is false, 0 or "0".
     */
    isFalseOrZero(value: any): boolean {
        return typeof value != 'undefined' && (value === false || value === 'false' || parseInt(value, 10) === 0);
    }

    /**
     * Return true if the param is true (bool), 1 (number) or "1" (string).
     *
     * @param {any} value Value to check.
     * @return {boolean} Whether the value is true, 1 or "1".
     */
    isTrueOrOne(value: any): boolean {
        return typeof value != 'undefined' && (value === true || value === 'true' || parseInt(value, 10) === 1);
    }

    /**
     * Given an error returned by a WS call, check if the error is generated by the app or it has been returned by the WebSwervice.
     *
     * @param {any} error Error to check.
     * @return {boolean} Whether the error was returned by the WebService.
     */
    isWebServiceError(error: any): boolean {
        return typeof error.warningcode != 'undefined' || (typeof error.errorcode != 'undefined' &&
                error.errorcode != 'invalidtoken' && error.errorcode != 'userdeleted' && error.errorcode != 'upgraderunning' &&
                error.errorcode != 'forcepasswordchangenotice' && error.errorcode != 'usernotfullysetup' &&
                error.errorcode != 'sitepolicynotagreed' && error.errorcode != 'sitemaintenance' &&
                (error.errorcode != 'accessexception' || error.message.indexOf('Invalid token - token expired') == -1));
    }

    /**
     * Given a list (e.g. a,b,c,d,e) this function returns an array of 1->a, 2->b, 3->c etc.
     * Taken from make_menu_from_list on moodlelib.php (not the same but similar).
     *
     * @param {string} list The string to explode into array bits
     * @param {string} [defaultLabel] Element that will become default option, if not defined, it won't be added.
     * @param {string} [separator] The separator used within the list string. Default ','.
     * @param {any}  [defaultValue] Element that will become default option value. Default 0.
     * @return {any[]} The now assembled array
     */
    makeMenuFromList(list: string, defaultLabel?: string, separator: string = ',', defaultValue?: any): any[] {
        // Split and format the list.
        const split = list.split(separator).map((label, index) => {
            return {
                label: label.trim(),
                value: index + 1
            };
        });

        if (defaultLabel) {
            split.unshift({
                label: defaultLabel,
                value: defaultValue || 0
            });
        }

        return split;
    }

    /**
     * Merge two arrays, removing duplicate values.
     *
     * @param {any[]} array1 The first array.
     * @param {any[]} array2 The second array.
     * @param [key] Key of the property that must be unique. If not specified, the whole entry.
     * @return {any[]} Merged array.
     */
    mergeArraysWithoutDuplicates(array1: any[], array2: any[], key?: string): any[] {
        return this.uniqueArray(array1.concat(array2), key);
    }

    /**
     * Open a file using platform specific method.
     *
     * @param {string} path The local path of the file to be open.
     * @return {Promise<any>} Promise resolved when done.
     */
    openFile(path: string): Promise<any> {
        const extension = this.mimetypeUtils.getFileExtension(path),
            mimetype = this.mimetypeUtils.getMimeType(extension);

        // Path needs to be decoded, the file won't be opened if the path has %20 instead of spaces and so.
        try {
            path = decodeURIComponent(path);
        } catch (ex) {
            // Error, use the original path.
        }

        return this.fileOpener.open(path, mimetype).catch((error) => {
            this.logger.error('Error opening file ' + path + ' with mimetype ' + mimetype);
            this.logger.error('Error: ', JSON.stringify(error));

            if (!extension || extension.indexOf('/') > -1 || extension.indexOf('\\') > -1) {
                // Extension not found.
                error = this.translate.instant('core.erroropenfilenoextension');
            } else {
                error = this.translate.instant('core.erroropenfilenoapp');
            }

            return Promise.reject(error);
        });
    }

    /**
     * Open a URL using InAppBrowser.
     * Do not use for files, refer to {@link openFile}.
     *
     * @param {string} url The URL to open.
     * @param {any} [options] Override default options passed to InAppBrowser.
     * @return {InAppBrowserObject} The opened window.
     */
    openInApp(url: string, options?: any): InAppBrowserObject {
        if (!url) {
            return;
        }

        options = options || {};

        if (!options.enableViewPortScale) {
            options.enableViewPortScale = 'yes'; // Enable zoom on iOS.
        }

        if (!options.location && this.platform.is('ios') && url.indexOf('file://') === 0) {
            // The URL uses file protocol, don't show it on iOS.
            // In Android we keep it because otherwise we lose the whole toolbar.
            options.location = 'no';
        }

        this.iabInstance = this.iab.create(url, '_blank', options);

        if (this.appProvider.isDesktop() || this.appProvider.isMobile()) {
            let loadStopSubscription;
            const loadStartUrls = [];

            // Trigger global events when a url is loaded or the window is closed. This is to make it work like in Ionic 1.
            const loadStartSubscription = this.iabInstance.on('loadstart').subscribe((event) => {
                // Execute the callback in the Angular zone, so change detection doesn't stop working.
                this.zone.run(() => {
                    // Store the last loaded URLs (max 10).
                    loadStartUrls.push(event.url);
                    if (loadStartUrls.length > 10) {
                        loadStartUrls.shift();
                    }

                    this.eventsProvider.trigger(CoreEventsProvider.IAB_LOAD_START, event);
                });
            });

            if (this.platform.is('android')) {
                // Load stop is needed with InAppBrowser v3. Custom URL schemes no longer trigger load start, simulate it.
                loadStopSubscription = this.iabInstance.on('loadstop').subscribe((event) => {
                    // Execute the callback in the Angular zone, so change detection doesn't stop working.
                    this.zone.run(() => {
                        if (loadStartUrls.indexOf(event.url) == -1) {
                            // The URL was stopped but not started, probably a custom URL scheme.
                            this.eventsProvider.trigger(CoreEventsProvider.IAB_LOAD_START, event);
                        }
                    });
                });
            }

            const exitSubscription = this.iabInstance.on('exit').subscribe((event) => {
                // Execute the callback in the Angular zone, so change detection doesn't stop working.
                this.zone.run(() => {
                    loadStartSubscription.unsubscribe();
                    loadStopSubscription && loadStopSubscription.unsubscribe();
                    exitSubscription.unsubscribe();
                    this.eventsProvider.trigger(CoreEventsProvider.IAB_EXIT, event);
                });
            });
        }

        return this.iabInstance;
    }

    /**
     * Open a URL using a browser.
     * Do not use for files, refer to {@link openFile}.
     *
     * @param {string} url The URL to open.
     */
    openInBrowser(url: string): void {
        if (this.appProvider.isDesktop()) {
            // It's a desktop app, use Electron shell library to open the browser.
            const shell = require('electron').shell;
            if (!shell.openExternal(url)) {
                // Open browser failed, open a new window in the app.
                window.open(url, '_system');
            }
        } else {
            window.open(url, '_system');
        }
    }

    /**
     * Open an online file using platform specific method.
     * Specially useful for audio and video since they can be streamed.
     *
     * @param {string} url The URL of the file.
     * @return {Promise<void>} Promise resolved when opened.
     */
    openOnlineFile(url: string): Promise<void> {
        if (this.platform.is('android')) {
            // In Android we need the mimetype to open it.
            return this.getMimeTypeFromUrl(url).catch(() => {
                // Error getting mimetype, return undefined.
            }).then((mimetype) => {
                if (!mimetype) {
                    // Couldn't retrieve mimetype. Return error.
                    return Promise.reject(this.translate.instant('core.erroropenfilenoextension'));
                }

                const options = {
                    action: this.webIntent.ACTION_VIEW,
                    url: url,
                    type: mimetype
                };

                return this.webIntent.startActivity(options).catch((error) => {
                    this.logger.error('Error opening online file ' + url + ' with mimetype ' + mimetype);
                    this.logger.error('Error: ', JSON.stringify(error));

                    return Promise.reject(this.translate.instant('core.erroropenfilenoapp'));
                });
            });
        }

        // In the rest of platforms we need to open them in InAppBrowser.
        this.openInApp(url);

        return Promise.resolve();
    }

    /**
     * Converts an object into an array, losing the keys.
     *
     * @param {object} obj Object to convert.
     * @return {any[]} Array with the values of the object but losing the keys.
     */
    objectToArray(obj: object): any[] {
        return Object.keys(obj).map((key) => {
            return obj[key];
        });
    }

    /**
     * Converts an object into an array of objects, where each entry is an object containing
     * the key and value of the original object.
     * For example, it can convert {size: 2} into [{name: 'size', value: 2}].
     *
     * @param {object} obj Object to convert.
     * @param {string} keyName Name of the properties where to store the keys.
     * @param {string} valueName Name of the properties where to store the values.
     * @param {boolean} [sort] True to sort keys alphabetically, false otherwise.
     * @return {any[]} Array of objects with the name & value of each property.
     */
    objectToArrayOfObjects(obj: object, keyName: string, valueName: string, sort?: boolean): any[] {
        // Get the entries from an object or primitive value.
        const getEntries = (elKey, value): any[] | any => {
            if (typeof value == 'object') {
                // It's an object, return at least an entry for each property.
                const keys = Object.keys(value);
                let entries = [];

                keys.forEach((key) => {
                    const newElKey = elKey ? elKey + '[' + key + ']' : key;
                    entries = entries.concat(getEntries(newElKey, value[key]));
                });

                return entries;
            } else {
                // Not an object, return a single entry.
                const entry = {};
                entry[keyName] = elKey;
                entry[valueName] = value;

                return entry;
            }
        };

        if (!obj) {
            return [];
        }

        // "obj" will always be an object, so "entries" will always be an array.
        const entries = <any[]> getEntries('', obj);
        if (sort) {
            return entries.sort((a, b) => {
                return a.name >= b.name ? 1 : -1;
            });
        }

        return entries;
    }

    /**
     * Converts an array of objects into an object with key and value. The opposite of objectToArrayOfObjects.
     * For example, it can convert [{name: 'size', value: 2}] into {size: 2}.
     *
     * @param {object[]} objects List of objects to convert.
     * @param {string} keyName Name of the properties where the keys are stored.
     * @param {string} valueName Name of the properties where the values are stored.
     * @param [keyPrefix] Key prefix if neededs to delete it.
     * @return {object} Object.
     */
    objectToKeyValueMap(objects: object[], keyName: string, valueName: string, keyPrefix?: string): object {
        if (!objects) {
            return;
        }

        const prefixSubstr = keyPrefix ? keyPrefix.length : 0,
            mapped = {};
        objects.forEach((item) => {
            const key = prefixSubstr > 0 ? item[keyName].substr(prefixSubstr) : item[keyName];
            mapped[key] = item[valueName];
        });

        return mapped;
    }

    /**
     * Similar to AngularJS $q.defer().
     *
     * @return {PromiseDefer} The deferred promise.
     */
    promiseDefer(): PromiseDefer {
        const deferred: PromiseDefer = {};
        deferred.promise = new Promise((resolve, reject): void => {
            deferred.resolve = resolve;
            deferred.reject = reject;
        });

        return deferred;
    }

    /**
     * Given a promise, returns true if it's rejected or false if it's resolved.
     *
     * @param {Promise<any>} promise Promise to check
     * @return {Promise<boolean>} Promise resolved with boolean: true if the promise is rejected or false if it's resolved.
     */
    promiseFails(promise: Promise<any>): Promise<boolean> {
        return promise.then(() => {
            return false;
        }).catch(() => {
            return true;
        });
    }

    /**
     * Given a promise, returns true if it's resolved or false if it's rejected.
     *
     * @param {Promise<any>} promise Promise to check
     * @return {Promise<boolean>} Promise resolved with boolean: true if the promise it's resolved or false if it's rejected.
     */
    promiseWorks(promise: Promise<any>): Promise<boolean> {
        return promise.then(() => {
            return true;
        }).catch(() => {
            return false;
        });
    }

    /**
     * Tests to see whether two arrays or objects have the same value at a particular key.
     * Missing values are replaced by '', and the values are compared with ===.
     * Booleans and numbers are cast to string before comparing.
     *
     * @param {any} obj1 The first object or array.
     * @param {any} obj2 The second object or array.
     * @param {string} key Key to check.
     * @return {boolean} Whether the two objects/arrays have the same value (or lack of one) for a given key.
     */
    sameAtKeyMissingIsBlank(obj1: any, obj2: any, key: string): boolean {
        let value1 = typeof obj1[key] != 'undefined' ? obj1[key] : '',
            value2 = typeof obj2[key] != 'undefined' ? obj2[key] : '';

        if (typeof value1 == 'number' || typeof value1 == 'boolean') {
            value1 = '' + value1;
        }
        if (typeof value2 == 'number' || typeof value2 == 'boolean') {
            value2 = '' + value2;
        }

        return value1 === value2;
    }

    /**
     * Stringify an object, sorting the properties. It doesn't sort arrays, only object properties. E.g.:
     * {b: 2, a: 1} -> '{"a":1,"b":2}'
     *
     * @param {object} obj Object to stringify.
     * @return {string} Stringified object.
     */
    sortAndStringify(obj: object): string {
        return JSON.stringify(this.sortProperties(obj));
    }

    /**
     * Given an object, sort its properties and the properties of all the nested objects.
     *
     * @param {object} obj The object to sort. If it isn't an object, the original value will be returned.
     * @return {object} Sorted object.
     */
    sortProperties(obj: object): object {
        if (typeof obj == 'object' && !Array.isArray(obj)) {
            // It's an object, sort it.
            return Object.keys(obj).sort().reduce((accumulator, key) => {
                // Always call sort with the value. If it isn't an object, the original value will be returned.
                accumulator[key] = this.sortProperties(obj[key]);

                return accumulator;
            }, {});
        } else {
            return obj;
        }
    }

    /**
     * Sum the filesizes from a list of files checking if the size will be partial or totally calculated.
     *
     * @param {any[]} files List of files to sum its filesize.
     * @return {{size: number, total: boolean}} File size and a boolean to indicate if it is the total size or only partial.
     */
    sumFileSizes(files: any[]): { size: number, total: boolean } {
        const result = {
            size: 0,
            total: true
        };

        files.forEach((file) => {
            if (typeof file.filesize == 'undefined') {
                // We don't have the file size, cannot calculate its total size.
                result.total = false;
            } else {
                result.size += file.filesize;
            }
        });

        return result;
    }

    /**
     * Converts locale specific floating point/comma number back to standard PHP float value.
     * Do NOT try to do any math operations before this conversion on any user submitted floats!
     * Based on Moodle's unformat_float function.
     *
     * @param {any} localeFloat Locale aware float representation.
     * @return {any} False if bad format, empty string if empty value or the parsed float if not.
     */
    unformatFloat(localeFloat: any): any {
        // Bad format on input type number.
        if (typeof localeFloat == 'undefined') {
            return false;
        }

        // Empty (but not zero).
        if (localeFloat == null) {
            return '';
        }

        // Convert float to string.
        localeFloat += '';
        localeFloat = localeFloat.trim();

        if (localeFloat == '') {
            return '';
        }

        const localeSeparator = this.translate.instant('core.decsep');

        localeFloat = localeFloat.replace(' ', ''); // No spaces - those might be used as thousand separators.
        localeFloat = localeFloat.replace(localeSeparator, '.');

        localeFloat = parseFloat(localeFloat);
        // Bad format.
        if (isNaN(localeFloat)) {
            return false;
        }

        return localeFloat;
    }

    /**
     * Return an array without duplicate values.
     *
     * @param {any[]} array The array to treat.
     * @param [key] Key of the property that must be unique. If not specified, the whole entry.
     * @return {any[]} Array without duplicate values.
     */
    uniqueArray(array: any[], key?: string): any[] {
        const filtered = [],
            unique = [],
            len = array.length;

        for (let i = 0; i < len; i++) {
            const entry = array[i],
                value = key ? entry[key] : entry;

            if (unique.indexOf(value) == -1) {
                unique.push(value);
                filtered.push(entry);
            }
        }

        return filtered;
    }
}
