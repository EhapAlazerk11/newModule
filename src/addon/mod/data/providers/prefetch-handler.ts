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
import { TranslateService } from '@ngx-translate/core';
import { CoreAppProvider } from '@providers/app';
import { CoreFilepoolProvider } from '@providers/filepool';
import { CoreSitesProvider } from '@providers/sites';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreGroupsProvider } from '@providers/groups';
import { CoreTimeUtilsProvider } from '@providers/utils/time';
import { CoreCommentsProvider } from '@core/comments/providers/comments';
import { CoreCourseProvider } from '@core/course/providers/course';
import { CoreCourseActivityPrefetchHandlerBase } from '@core/course/classes/activity-prefetch-handler';
import { AddonModDataProvider } from './data';
import { AddonModDataHelperProvider } from './helper';

/**
 * Handler to prefetch databases.
 */
@Injectable()
export class AddonModDataPrefetchHandler extends CoreCourseActivityPrefetchHandlerBase {
    name = 'AddonModData';
    modName = 'data';
    component = AddonModDataProvider.COMPONENT;
    updatesNames = /^configuration$|^.*files$|^entries$|^gradeitems$|^outcomes$|^comments$|^ratings/;

    constructor(translate: TranslateService, appProvider: CoreAppProvider, utils: CoreUtilsProvider,
            courseProvider: CoreCourseProvider, filepoolProvider: CoreFilepoolProvider, sitesProvider: CoreSitesProvider,
            domUtils: CoreDomUtilsProvider, protected dataProvider: AddonModDataProvider,
            protected timeUtils: CoreTimeUtilsProvider, protected dataHelper: AddonModDataHelperProvider,
            protected groupsProvider: CoreGroupsProvider, protected commentsProvider: CoreCommentsProvider) {

        super(translate, appProvider, utils, courseProvider, filepoolProvider, sitesProvider, domUtils);
    }

    /**
     * Retrieves all the entries for all the groups and then returns only unique entries.
     *
     * @param  {number}  dataId         Database Id.
     * @param  {any[]}   groups         Array of groups in the activity.
     * @param  {boolean} [forceCache]   True to always get the value from cache, false otherwise. Default false.
     * @param  {boolean} [ignoreCache]  True if it should ignore cached data (it will always fail in offline or server down).
     * @param  {string}  [siteId]       Site ID.
     * @return {Promise<any>}                All unique entries.
     */
    protected getAllUniqueEntries(dataId: number, groups: any[], forceCache: boolean = false, ignoreCache: boolean = false,
            siteId?: string): Promise<any> {
        const promises = groups.map((group) => {
            return this.dataProvider.fetchAllEntries(dataId, group.id, undefined, undefined, undefined, forceCache, ignoreCache,
                siteId);
        });

        return Promise.all(promises).then((responses) => {
            const uniqueEntries = {};

            responses.forEach((groupEntries) => {
                groupEntries.forEach((entry) => {
                    uniqueEntries[entry.id] = entry;
                });
            });

            return this.utils.objectToArray(uniqueEntries);
        });
    }

    /**
     * Helper function to get all database info just once.
     *
     * @param  {any}     module         Module to get the files.
     * @param  {number}  courseId       Course ID the module belongs to.
     * @param  {boolean} [omitFail]     True to always return even if fails. Default false.
     * @param  {boolean} [forceCache]   True to always get the value from cache, false otherwise. Default false.
     * @param  {boolean} [ignoreCache]  True if it should ignore cached data (it will always fail in offline or server down).
     * @param  {string}  siteId         Site ID.
     * @return {Promise<any>}           Promise resolved with the info fetched.
     */
    protected getDatabaseInfoHelper(module: any, courseId: number, omitFail: boolean = false, forceCache: boolean = false,
            ignoreCache: boolean = false, siteId?: string): Promise<any> {
        let database,
            groups = [],
            entries = [],
            files = [];

        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.dataProvider.getDatabase(courseId, module.id, siteId, forceCache).then((data) => {
            files = this.getIntroFilesFromInstance(module, data);
            database = data;

            return this.groupsProvider.getActivityGroupInfo(module.id, false, undefined, siteId).then((groupInfo) => {
                if (!groupInfo.groups || groupInfo.groups.length == 0) {
                    groupInfo.groups = [{id: 0}];
                }
                groups = groupInfo.groups;

                return this.getAllUniqueEntries(database.id, groups, forceCache, ignoreCache, siteId);
            });
        }).then((uniqueEntries) => {
            entries = uniqueEntries;
            files = files.concat(this.getEntriesFiles(entries));

            return {
                database: database,
                groups: groups,
                entries: entries,
                files: files
            };
        }).catch((message): any => {
            if (omitFail) {
                // Any error, return the info we have.
                return {
                    database: database,
                    groups: groups,
                    entries: entries,
                    files: files
                };
            }

            return Promise.reject(message);
        });
    }

    /**
     * Returns the file contained in the entries.
     *
     * @param  {any[]} entries  List of entries to get files from.
     * @return {any[]}          List of files.
     */
    protected getEntriesFiles(entries: any[]): any[] {
        let files = [];

        entries.forEach((entry) => {
            entry.contents.forEach((content) => {
                files = files.concat(content.files);
            });
        });

        return files;
    }

    /**
     * Get the list of downloadable files.
     *
     * @param  {any} module    Module to get the files.
     * @param  {number} courseId  Course ID the module belongs to.
     * @param {boolean} [single] True if we're downloading a single module, false if we're downloading a whole section.
     * @return {Promise<any>}     Promise resolved with the list of files.
     */
    getFiles(module: any, courseId: number, single?: boolean): Promise<any[]> {
        return this.getDatabaseInfoHelper(module, courseId, true).then((info) => {
            return info.files;
        });
    }

    /**
     * Returns data intro files.
     *
     * @param {any} module The module object returned by WS.
     * @param {number} courseId Course ID.
     * @return {Promise<any[]>} Promise resolved with list of intro files.
     */
    getIntroFiles(module: any, courseId: number): Promise<any[]> {
        return this.dataProvider.getDatabase(courseId, module.id).catch(() => {
            // Not found, return undefined so module description is used.
        }).then((data) => {
            return this.getIntroFilesFromInstance(module, data);
        });
    }

    /**
     * Invalidate the prefetched content.
     *
     * @param {number} moduleId The module ID.
     * @param {number} courseId Course ID the module belongs to.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateContent(moduleId: number, courseId: number): Promise<any> {
        return this.dataProvider.invalidateContent(moduleId, courseId);
    }

    /**
     * Invalidate WS calls needed to determine module status.
     *
     * @param {any} module Module.
     * @param {number} courseId Course ID the module belongs to.
     * @return {Promise<any>} Promise resolved when invalidated.
     */
    invalidateModule(module: any, courseId: number): Promise<any> {
        const promises = [];
        promises.push(this.dataProvider.invalidateDatabaseData(courseId));
        promises.push(this.dataProvider.invalidateDatabaseAccessInformationData(module.instance));

        return Promise.all(promises);
    }

    /**
     * Check if a database is downloadable.
     * A database isn't downloadable if it's not open yet.
     *
     * @param {any} module       Module to check.
     * @param {number} courseId  Course ID the module belongs to.
     * @return {Promise<any>}    Promise resolved with true if downloadable, resolved with false otherwise.
     */
    isDownloadable(module: any, courseId: number): boolean | Promise<boolean> {
        return this.dataProvider.getDatabase(courseId, module.id, undefined, true).then((database) => {
            return this.dataProvider.getDatabaseAccessInformation(database.id).then((accessData) => {
                // Check if database is restricted by time.
                if (!accessData.timeavailable) {
                    const time = this.timeUtils.timestamp();

                    // It is restricted, checking times.
                    if (database.timeavailablefrom && time < database.timeavailablefrom) {
                        return false;
                    }
                    if (database.timeavailableto && time > database.timeavailableto) {
                        return false;
                    }
                }

                return true;
            });
        });
    }

    /**
     * Whether or not the handler is enabled on a site level.
     *
     * @return {boolean|Promise<boolean>} A boolean, or a promise resolved with a boolean, indicating if the handler is enabled.
     */
    isEnabled(): boolean | Promise<boolean> {
        return this.dataProvider.isPluginEnabled();
    }

    /**
     * Prefetch a module.
     *
     * @param {any} module Module.
     * @param {number} courseId Course ID the module belongs to.
     * @param {boolean} [single] True if we're downloading a single module, false if we're downloading a whole section.
     * @param {string} [dirPath] Path of the directory where to store all the content files.
     * @return {Promise<any>} Promise resolved when done.
     */
    prefetch(module: any, courseId?: number, single?: boolean, dirPath?: string): Promise<any> {
        return this.prefetchPackage(module, courseId, single, this.prefetchDatabase.bind(this));
    }

    /**
     * Prefetch a database.
     *
     * @param {any} module Module.
     * @param {number} courseId Course ID the module belongs to.
     * @param {boolean} single True if we're downloading a single module, false if we're downloading a whole section.
     * @param {String} siteId Site ID.
     * @return {Promise<any>} Promise resolved when done.
     */
    protected prefetchDatabase(module: any, courseId: number, single: boolean, siteId: string): Promise<any> {

        return this.getDatabaseInfoHelper(module, courseId, false, false, true, siteId).then((info) => {
            // Prefetch the database data.
            const database = info.database,
                promises = [];

            promises.push(this.dataProvider.getFields(database.id, false, true, siteId));

            promises.push(this.filepoolProvider.addFilesToQueue(siteId, info.files, this.component, module.id));

            info.groups.forEach((group) => {
               promises.push(this.dataProvider.getDatabaseAccessInformation(database.id, group.id, false, true, siteId));
            });

            info.entries.forEach((entry) => {
                promises.push(this.dataProvider.getEntry(database.id, entry.id, siteId));
                if (database.comments) {
                    promises.push(this.commentsProvider.getComments('module', database.coursemodule, 'mod_data', entry.id,
                        'database_entry', 0, siteId));
                }
            });

            // Add Basic Info to manage links.
            promises.push(this.courseProvider.getModuleBasicInfoByInstance(database.id, 'data', siteId));

            return Promise.all(promises);
        });
    }
}
