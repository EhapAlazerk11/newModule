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

import { CoreCourseModulePrefetchHandlerBase } from './module-prefetch-handler';

/**
 * Base prefetch handler to be registered in CoreCourseModulePrefetchDelegate. It is useful to minimize the amount of
 * functions that handlers need to implement. It also provides some helper features like preventing a module to be
 * downloaded twice at the same time.
 *
 * If your handler inherits from this service, you just need to override the functions that you want to change.
 *
 * This class should be used for RESOURCES whose main purpose is downloading files present in module.contents.
 */
export class CoreCourseResourcePrefetchHandlerBase extends CoreCourseModulePrefetchHandlerBase {

    /**
     * Download the module.
     *
     * @param {any} module The module object returned by WS.
     * @param {number} courseId Course ID.
     * @param {string} [dirPath] Path of the directory where to store all the content files.
     * @return {Promise<any>} Promise resolved when all content is downloaded.
     */
    download(module: any, courseId: number, dirPath?: string): Promise<any> {
        return this.downloadOrPrefetch(module, courseId, false, dirPath);
    }

    /**
     * Download or prefetch the content.
     *
     * @param {any} module The module object returned by WS.
     * @param {number} courseId Course ID.
     * @param {boolean} [prefetch] True to prefetch, false to download right away.
     * @param {string} [dirPath] Path of the directory where to store all the content files. This is to keep the files
     *                           relative paths and make the package work in an iframe. Undefined to download the files
     *                           in the filepool root folder.
     * @return {Promise<any>} Promise resolved when all content is downloaded. Data returned is not reliable.
     */
    downloadOrPrefetch(module: any, courseId: number, prefetch?: boolean, dirPath?: string): Promise<any> {
        if (!this.appProvider.isOnline()) {
            // Cannot download in offline.
            return Promise.reject(this.translate.instant('core.networkerrormsg'));
        }

        const siteId = this.sitesProvider.getCurrentSiteId();

        if (this.isDownloading(module.id, siteId)) {
            // There's already a download ongoing for this module, return the promise.
            return this.getOngoingDownload(module.id, siteId);
        }

        // Load module contents (ignore cache so we always have the latest data).
        const prefetchPromise = this.loadContents(module, courseId, true).then(() => {
            // Get the intro files.
            return this.getIntroFiles(module, courseId);
        }).then((introFiles) => {
            const downloadFn = prefetch ? this.filepoolProvider.prefetchPackage.bind(this.filepoolProvider) :
                        this.filepoolProvider.downloadPackage.bind(this.filepoolProvider),
                contentFiles = this.getContentDownloadableFiles(module),
                promises = [];

            if (dirPath) {
                // Download intro files in filepool root folder.
                promises.push(this.filepoolProvider.downloadOrPrefetchFiles(siteId, introFiles, prefetch, false,
                    this.component, module.id));

                // Download content files inside dirPath.
                promises.push(downloadFn(siteId, contentFiles, this.component, module.id, undefined, dirPath));
            } else {
                // No dirPath, download everything in filepool root folder.
                const files = introFiles.concat(contentFiles);
                promises.push(downloadFn(siteId, files, this.component, module.id));
            }

            return Promise.all(promises);
        });

        return this.addOngoingDownload(module.id, prefetchPromise, siteId);
    }

    /**
     * Get list of files. If not defined, we'll assume they're in module.contents.
     *
     * @param {any} module Module.
     * @param {Number} courseId Course ID the module belongs to.
     * @param {boolean} [single] True if we're downloading a single module, false if we're downloading a whole section.
     * @return {Promise<any[]>} Promise resolved with the list of files.
     */
    getFiles(module: any, courseId: number, single?: boolean): Promise<any[]> {
        // Load module contents if needed.
        return this.loadContents(module, courseId).then(() => {
            return this.getIntroFiles(module, courseId).then((files) => {
                return files.concat(this.getContentDownloadableFiles(module));
            });
        });
    }

    /**
     * Invalidate the prefetched content.
     *
     * @param {number} moduleId The module ID.
     * @param {number} courseId The course ID the module belongs to.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateContent(moduleId: number, courseId: number): Promise<any> {
        const promises = [],
            siteId = this.sitesProvider.getCurrentSiteId();

        promises.push(this.courseProvider.invalidateModule(moduleId));
        promises.push(this.filepoolProvider.invalidateFilesByComponent(siteId, this.component, moduleId));

        return Promise.all(promises);
    }

    /**
     * Load module contents into module.contents if they aren't loaded already.
     *
     * @param {any} module Module to load the contents.
     * @param {number} [courseId] The course ID. Recommended to speed up the process and minimize data usage.
     * @param {boolean} [ignoreCache] True if it should ignore cached data (it will always fail in offline or server down).
     * @return {Promise}           Promise resolved when loaded.
     */
    loadContents(module: any, courseId: number, ignoreCache?: boolean): Promise<void> {
        return this.courseProvider.loadModuleContents(module, courseId, undefined, false, ignoreCache);
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
        return this.downloadOrPrefetch(module, courseId, true, dirPath);
    }
}
