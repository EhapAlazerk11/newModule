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
import { CoreContentLinksModuleIndexHandler } from '@core/contentlinks/classes/module-index-handler';
import { CoreCourseHelperProvider } from '@core/course/providers/helper';
import { AddonModForumProvider } from './forum';

/**
 * Handler to treat links to forum index.
 */
@Injectable()
export class AddonModForumIndexLinkHandler extends CoreContentLinksModuleIndexHandler {
    name = 'AddonModForumIndexLinkHandler';

    constructor(courseHelper: CoreCourseHelperProvider, protected forumProvider: AddonModForumProvider) {
        super(courseHelper, 'AddonModForum', 'forum');
    }

    /**
     * Check if the handler is enabled for a certain site (site + user) and a URL.
     * If not defined, defaults to true.
     *
     * @param {string} siteId The site ID.
     * @param {string} url The URL to treat.
     * @param {any} params The params of the URL. E.g. 'mysite.com?id=1' -> {id: 1}
     * @param {number} [courseId] Course ID related to the URL. Optional but recommended.
     * @return {boolean|Promise<boolean>} Whether the handler is enabled for the URL and site.
     */
    isEnabled(siteId: string, url: string, params: any, courseId?: number): boolean | Promise<boolean> {
        return true;
    }
}
