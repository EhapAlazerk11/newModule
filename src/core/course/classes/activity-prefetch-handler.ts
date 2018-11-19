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

import { CoreConstants } from '../../constants';
import { CoreCourseModulePrefetchHandlerBase } from './module-prefetch-handler';

/**
 * A prefetch function to be passed to prefetchPackage.
 * This function should NOT call storePackageStatus, downloadPackage or prefetchPakage from filepool.
 * It receives the same params as prefetchPackage except the function itself. This includes all extra parameters sent after siteId.
 * The string returned by this function will be stored as "extra" data in the filepool package. If you don't need to store
 * extra data, don't return anything.
 *
 * @param {any} module Module.
 * @param {number} courseId Course ID the module belongs to.
 * @param {boolean} single True if we're downloading a single module, false if we're downloading a whole section.
 * @param {string} siteId Site ID. If not defined, current site.
 * @return {Promise<string>} Promise resolved when the prefetch finishes. The string returned will be stored as "extra" data in the
 *                           filepool package. If you don't need to store extra data, don't return anything.
 */
export type prefetchFunction = (module: any, courseId: number, single: boolean, siteId: string, ...args: any[]) => Promise<string>;

/**
 * Base prefetch handler to be registered in CoreCourseModulePrefetchDelegate. It is useful to minimize the amount of
 * functions that handlers need to implement. It also provides some helper features like preventing a module to be
 * downloaded twice at the same time.
 *
 * If your handler inherits from this service, you just need to override the functions that you want to change.
 *
 * This class should be used for ACTIVITIES. You must override the prefetch function, and it's recommended to call
 * prefetchPackage in there since it handles the package status.
 */
export class CoreCourseActivityPrefetchHandlerBase extends CoreCourseModulePrefetchHandlerBase {

    /**
     * Download the module.
     *
     * @param {any} module The module object returned by WS.
     * @param {number} courseId Course ID.
     * @param {string} [dirPath] Path of the directory where to store all the content files.
     * @return {Promise<any>} Promise resolved when all content is downloaded.
     */
    download(module: any, courseId: number, dirPath?: string): Promise<any> {
        // Same implementation for download and prefetch.
        return this.prefetch(module, courseId, false, dirPath);
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
        // To be overridden. It should call prefetchPackage
        return Promise.resolve();
    }

    /**
     * Prefetch the module, setting package status at start and finish.
     *
     * Example usage from a child instance:
     *     return this.prefetchPackage(module, courseId, single, this.prefetchModule.bind(this), siteId, someParam, anotherParam);
     *
     * Then the function "prefetchModule" will receive params:
     *     prefetchModule(module, courseId, single, siteId, someParam, anotherParam)
     *
     * @param {any} module Module.
     * @param {number} courseId Course ID the module belongs to.
     * @param {boolean} [single] True if we're downloading a single module, false if we're downloading a whole section.
     * @param {prefetchFunction} downloadFn Function to perform the prefetch. Please check the documentation of prefetchFunction.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the module has been downloaded. Data returned is not reliable.
     */
    prefetchPackage(module: any, courseId: number, single: boolean, downloadFn: prefetchFunction, siteId?: string, ...args: any[])
            : Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        if (!this.appProvider.isOnline()) {
            // Cannot prefetch in offline.
            return Promise.reject(this.translate.instant('core.networkerrormsg'));
        }

        if (this.isDownloading(module.id, siteId)) {
            // There's already a download ongoing for this module, return the promise.
            return this.getOngoingDownload(module.id, siteId);
        }

        const prefetchPromise = this.setDownloading(module.id, siteId).then(() => {
            // Package marked as downloading, call the download function.
            // Send all the params except downloadFn. This includes all params passed after siteId.
            return downloadFn.apply(downloadFn, [module, courseId, single, siteId].concat(args));
        }).then((extra: any) => {
            // Only accept string types.
            if (typeof extra != 'string') {
                extra = '';
            }

            // Prefetch finished, mark as downloaded.
            return this.setDownloaded(module.id, siteId, extra);
        }).catch((error) => {
            // Error prefetching, go back to previous status and reject the promise.
            return this.setPreviousStatusAndReject(module.id, error, siteId);
        });

        return this.addOngoingDownload(module.id, prefetchPromise, siteId);
    }

    /**
     * Mark the module as downloaded.
     *
     * @param {number} id Unique identifier per component.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @param {string} [extra] Extra data to store.
     * @return {Promise<any>} Promise resolved when done.
     */
    setDownloaded(id: number, siteId?: string, extra?: string): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.filepoolProvider.storePackageStatus(siteId, CoreConstants.DOWNLOADED, this.component, id, extra);
    }

    /**
     * Mark the module as downloading.
     *
     * @param {number} id Unique identifier per component.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when done.
     */
    setDownloading(id: number, siteId?: string): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.filepoolProvider.storePackageStatus(siteId, CoreConstants.DOWNLOADING, this.component, id);
    }

    /**
     * Set previous status and return a rejected promise.
     *
     * @param {number} id Unique identifier per component.
     * @param {any} [error] Error to return.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<never>} Rejected promise.
     */
    setPreviousStatusAndReject(id: number, error?: any, siteId?: string): Promise<never> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.filepoolProvider.setPackagePreviousStatus(siteId, this.component, id).then(() => {
            return Promise.reject(error);
        });
    }
}
