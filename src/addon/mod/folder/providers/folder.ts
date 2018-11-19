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
import { CoreLoggerProvider } from '@providers/logger';
import { CoreSitesProvider } from '@providers/sites';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreCourseProvider } from '@core/course/providers/course';

/**
 * Service that provides some features for folder.
 */
@Injectable()
export class AddonModFolderProvider {
    static COMPONENT = 'mmaModFolder';

    protected ROOT_CACHE_KEY = 'mmaModFolder:';
    protected logger;

    constructor(logger: CoreLoggerProvider, private sitesProvider: CoreSitesProvider, private courseProvider: CoreCourseProvider,
            private utils: CoreUtilsProvider) {
        this.logger = logger.getInstance('AddonModFolderProvider');
    }

    /**
     * Get a folder by course module ID.
     *
     * @param {number} courseId Course ID.
     * @param {number} cmId     Course module ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}        Promise resolved when the book is retrieved.
     */
    getFolder(courseId: number, cmId: number, siteId?: string): Promise<any> {
        return this.getFolderByKey(courseId, 'coursemodule', cmId, siteId);
    }

    /**
     * Get a folder.
     *
     * @param {number} courseId  Course ID.
     * @param {string} key       Name of the property to check.
     * @param {any}  value     Value to search.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}          Promise resolved when the book is retrieved.
     */
    protected getFolderByKey(courseId: number, key: string, value: any, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                    courseids: [courseId]
                },
                preSets = {
                    cacheKey: this.getFolderCacheKey(courseId)
                };

            return site.read('mod_folder_get_folders_by_courses', params, preSets).then((response) => {
                if (response && response.folders) {
                    const currentFolder = response.folders.find((folder) => {
                        return folder[key] == value;
                    });
                    if (currentFolder) {
                        return currentFolder;
                    }
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Get cache key for folder data WS calls.
     *
     * @param {number} courseId Course ID.
     * @return {string}         Cache key.
     */
    protected getFolderCacheKey(courseId: number): string {
        return this.ROOT_CACHE_KEY + 'folder:' + courseId;
    }

    /**
     * Invalidate the prefetched content.
     *
     * @param  {number} moduleId The module ID.
     * @param  {number} courseId Course ID of the module.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}
     */
    invalidateContent(moduleId: number, courseId: number, siteId?: string): Promise<any> {
        const promises = [];

        promises.push(this.invalidateFolderData(courseId, siteId));
        promises.push(this.courseProvider.invalidateModule(moduleId, siteId));

        return this.utils.allPromises(promises);
    }

    /**
     * Invalidates folder data.
     *
     * @param {number} courseId Course ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}   Promise resolved when the data is invalidated.
     */
    invalidateFolderData(courseId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getFolderCacheKey(courseId));
        });
    }

    /**
     * Returns whether or not getFolder WS available or not.
     *
     * @return {boolean} If WS is avalaible.
     * @since 3.3
     */
    isGetFolderWSAvailable(): boolean {
        return this.sitesProvider.wsAvailableInCurrentSite('mod_folder_get_folders_by_courses');
    }

    /**
     * Report a folder as being viewed.
     *
     * @param {number} id Module ID.
     * @return {Promise<any>}  Promise resolved when the WS call is successful.
     */
    logView(id: number): Promise<any> {
        const params = {
            folderid: id
        };

        return this.sitesProvider.getCurrentSite().write('mod_folder_view_folder', params);
    }
}
