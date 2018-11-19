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

import { Injectable } from '@angular/core';
import { CoreAppProvider } from '@providers/app';
import { CoreFilepoolProvider } from '@providers/filepool';
import { CoreSitesProvider } from '@providers/sites';
import { CoreTextUtilsProvider } from '@providers/utils/text';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreCourseProvider } from '@core/course/providers/course';

/**
 * Service that provides some features for IMSCP.
 */
@Injectable()
export class AddonModImscpProvider {
    static COMPONENT = 'mmaModImscp';

    protected ROOT_CACHE_KEY = 'mmaModImscp:';

    constructor(private appProvider: CoreAppProvider, private courseProvider: CoreCourseProvider,
            private filepoolProvider: CoreFilepoolProvider, private sitesProvider: CoreSitesProvider,
            private textUtils: CoreTextUtilsProvider, private utils: CoreUtilsProvider) {}

    /**
     * Get the IMSCP toc as an array.
     *
     * @param  {any[]} contents The module contents.
     * @return {any} The toc.
     */
    protected getToc(contents: any[]): any {
        if (!contents || !contents.length) {
            return [];
        }

        return JSON.parse(contents[0].content);
    }

    /**
     * Get the imscp toc as an array of items (not nested) to build the navigation tree.
     *
     * @param  {any[]} contents The module contents.
     * @return {any[]} The toc as a list.
     */
    createItemList(contents: any[]): any[] {
        const items = [];

        this.getToc(contents).forEach((el) => {
            items.push({href: el.href, title: el.title, level: el.level});
            el.subitems.forEach((sel) => {
                items.push({href: sel.href, title: sel.title, level: sel.level});
            });
        });

        return items;
    }

    /**
     * Get the previous item to the given one.
     *
     * @param  {any[]}  items  The items list.
     * @param  {string} itemId The current item.
     * @return {string} The previous item id.
     */
    getPreviousItem(items: any[], itemId: string): string {
        const position = this.getItemPosition(items, itemId);

        if (position != -1) {
            for (let i = position - 1; i >= 0; i--) {
                if (items[i] && items[i].href) {
                    return items[i].href;
                }
            }
        }

        return '';
    }

    /**
     * Get the next item to the given one.
     *
     * @param  {any[]}  items  The items list.
     * @param  {string} itemId The current item.
     * @return {string} The next item id.
     */
    getNextItem(items: any[], itemId: string): string {
        const position = this.getItemPosition(items, itemId);

        if (position != -1) {
            for (let i = position + 1; i < items.length; i++) {
                if (items[i] && items[i].href) {
                    return items[i].href;
                }
            }
        }

        return '';
    }

    /**
     * Get the position of a item.
     *
     * @param  {any[]}  items  The items list.
     * @param  {string} itemId The item to search.
     * @return {number} The item position.
     */
    protected getItemPosition(items: any[], itemId: string): number {
        for (let i = 0; i < items.length; i++) {
            if (items[i].href == itemId) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Check if we should ommit the file download.
     *
     * @param  {string} fileName The file name
     * @return {boolean} True if we should ommit the file.
     */
    protected checkSpecialFiles(fileName: string): boolean {
        return fileName == 'imsmanifest.xml';
    }

    /**
     * Get cache key for imscp data WS calls.
     *
     * @param  {number} courseId Course ID.
     * @return {string} Cache key.
     */
    protected getImscpDataCacheKey(courseId: number): string {
        return this.ROOT_CACHE_KEY +  'imscp:' + courseId;
    }

    /**
     * Get a imscp with key=value. If more than one is found, only the first will be returned.
     *
     * @param  {number} courseId Course ID.
     * @param  {string} key      Name of the property to check.
     * @param  {any}    value    Value to search.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the imscp is retrieved.
     */
    protected getImscpByKey(courseId: number, key: string, value: any, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                courseids: [courseId]
            };
            const preSets = {
                cacheKey: this.getImscpDataCacheKey(courseId)
            };

            return site.read('mod_imscp_get_imscps_by_courses', params, preSets).then((response) => {
                if (response && response.imscps) {
                    const currentImscp = response.imscps.find((imscp) => imscp[key] == value);
                    if (currentImscp) {
                        return currentImscp;
                    }
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Get a imscp by course module ID.
     *
     * @param  {number} courseId Course ID.
     * @param  {number} cmId     Course module ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the imscp is retrieved.
     */
    getImscp(courseId: number, cmId: number, siteId?: string): Promise<any> {
        return this.getImscpByKey(courseId, 'coursemodule', cmId, siteId);
    }

    /**
     * Given a filepath, get a certain fileurl from module contents.
     *
     * @param  {any[]}  contents       Module contents.
     * @param  {string} targetFilePath Path of the searched file.
     * @return {string} File URL.
     */
    protected getFileUrlFromContents(contents: any[], targetFilePath: string): string {
        let indexUrl;
        contents.forEach((content) => {
            if (content.type == 'file' && !indexUrl) {
                const filePath = this.textUtils.concatenatePaths(content.filepath, content.filename);
                const filePathAlt = filePath.charAt(0) === '/' ? filePath.substr(1) : '/' + filePath;
                // Check if it's main file.
                if (filePath === targetFilePath || filePathAlt === targetFilePath) {
                    indexUrl = content.fileurl;
                }
            }
        });

        return indexUrl;
    }

    /**
     * Get src of a imscp item.
     *
     * @param  {any}    module     The module object.
     * @param  {string} [itemHref] Href of item to get. If not defined, gets src of main item.
     * @return {Promise<string>} Promise resolved with the item src.
     */
    getIframeSrc(module: any, itemHref?: string): Promise<string> {
        if (!itemHref) {
            const toc = this.getToc(module.contents);
            if (!toc.length) {
                return Promise.reject(null);
            }
            itemHref = toc[0].href;
        }

        const siteId = this.sitesProvider.getCurrentSiteId();

        return this.filepoolProvider.getPackageDirUrlByUrl(siteId, module.url).then((dirPath) => {
            return this.textUtils.concatenatePaths(dirPath, itemHref);
        }).catch(() => {
            // Error getting directory, there was an error downloading or we're in browser. Return online URL if connected.
            if (this.appProvider.isOnline()) {
                const indexUrl = this.getFileUrlFromContents(module.contents, itemHref);

                if (indexUrl) {
                    return this.sitesProvider.getSite(siteId).then((site) => {
                        return site.fixPluginfileURL(indexUrl);
                    });
                }
            }

            return Promise.reject(null);
        });
    }

    /**
     * Invalidate the prefetched content.
     *
     * @param  {number} moduleId The module ID.
     * @param  {number} courseId Course ID of the module.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the content is invalidated.
     */
    invalidateContent(moduleId: number, courseId: number, siteId?: string): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        const promises = [];

        promises.push(this.invalidateImscpData(courseId, siteId));
        promises.push(this.filepoolProvider.invalidateFilesByComponent(siteId, AddonModImscpProvider.COMPONENT, moduleId));
        promises.push(this.courseProvider.invalidateModule(moduleId, siteId));

        return this.utils.allPromises(promises);
    }

    /**
     * Invalidates imscp data.
     *
     * @param  {number} courseId Course ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateImscpData(courseId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getImscpDataCacheKey(courseId));
        });
    }

    /**
     * Check if a file is downloadable. The file param must have 'type' and 'filename' attributes
     * like in core_course_get_contents response.
     *
     * @param  {any} file File to check.
     * @return {boolean} True if downloadable, false otherwise.
     */
    isFileDownloadable(file: any): boolean {
        return file.type === 'file' && !this.checkSpecialFiles(file.filename);
    }

    /**
     * Return whether or not the plugin is enabled in a certain site.
     *
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved with true if plugin is enabled, rejected or resolved with false otherwise.
     */
    isPluginEnabled(siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.canDownloadFiles();
        });
    }

    /**
     * Report a IMSCP as being viewed.
     *
     * @param  {string} id Module ID.
     * @return {Promise<any>} Promise resolved when the WS call is successful.
     */
    logView(id: string): Promise<any> {
        const params = {
            imscpid: id
        };

        return this.sitesProvider.getCurrentSite().write('mod_imscp_view_imscp', params);
    }
}
