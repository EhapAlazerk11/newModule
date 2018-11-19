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
import { CoreCourseProvider } from '@core/course/providers/course';
import { CoreCourseResourcePrefetchHandlerBase } from '@core/course/classes/resource-prefetch-handler';
import { AddonModResourceProvider } from './resource';
import { AddonModResourceHelperProvider } from './helper';

/**
 * Handler to prefetch resources.
 */
@Injectable()
export class AddonModResourcePrefetchHandler extends CoreCourseResourcePrefetchHandlerBase {
    name = 'AddonModResource';
    modName = 'resource';
    component = AddonModResourceProvider.COMPONENT;

    constructor(translate: TranslateService, appProvider: CoreAppProvider, utils: CoreUtilsProvider,
            courseProvider: CoreCourseProvider, filepoolProvider: CoreFilepoolProvider, sitesProvider: CoreSitesProvider,
            domUtils: CoreDomUtilsProvider, protected resourceProvider: AddonModResourceProvider,
            protected resourceHelper: AddonModResourceHelperProvider) {

        super(translate, appProvider, utils, courseProvider, filepoolProvider, sitesProvider, domUtils);
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
        let promise;

        if (this.resourceHelper.isDisplayedInIframe(module)) {
            promise = this.filepoolProvider.getPackageDirPathByUrl(this.sitesProvider.getCurrentSiteId(), module.url);
        } else {
            promise = Promise.resolve();
        }

        return promise.then((dirPath) => {
            const promises = [];

            promises.push(super.downloadOrPrefetch(module, courseId, prefetch, dirPath));

            if (this.resourceProvider.isGetResourceWSAvailable()) {
                promises.push(this.resourceProvider.getResourceData(courseId, module.id));
            }

            /* When prefetching we usually use ignoreCache=true. However, this WS call can return a lot of data, so if
               a user downloads resources 1 by 1 we would be downloading the same data over and over again. Since
               this data won't change often it's probably better to use ignoreCache=false. */
            promises.push(this.courseProvider.getModule(module.id, courseId, undefined, false, false, undefined, this.modName));

            return Promise.all(promises);
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
        return this.resourceProvider.invalidateContent(moduleId, courseId);
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

        promises.push(this.resourceProvider.invalidateResourceData(courseId));
        promises.push(this.courseProvider.invalidateModule(module.id, undefined, this.modName));

        return Promise.all(promises);
    }

    /**
     * Whether or not the handler is enabled on a site level.
     *
     * @return {boolean|Promise<boolean>} A boolean, or a promise resolved with a boolean, indicating if the handler is enabled.
     */
    isEnabled(): boolean | Promise<boolean> {
        return this.resourceProvider.isPluginEnabled();
    }
}
