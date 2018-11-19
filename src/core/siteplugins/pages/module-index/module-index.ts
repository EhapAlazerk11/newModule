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

import { Component, ViewChild } from '@angular/core';
import { IonicPage, NavParams } from 'ionic-angular';
import { CoreSitePluginsModuleIndexComponent } from '../../components/module-index/module-index';

/**
 * Page to render the index page of a module site plugin.
 */
@IonicPage({ segment: 'core-site-plugins-module-index-page' })
@Component({
    selector: 'page-core-site-plugins-module-index',
    templateUrl: 'module-index.html',
})
export class CoreSitePluginsModuleIndexPage {
    @ViewChild(CoreSitePluginsModuleIndexComponent) content: CoreSitePluginsModuleIndexComponent;

    title: string; // Page title.

    module: any;
    courseId: number;

    constructor(params: NavParams) {
        this.title = params.get('title');
        this.module = params.get('module');
        this.courseId = params.get('courseId');
    }

    /**
     * Refresh the data.
     *
     * @param {any} refresher Refresher.
     */
    refreshData(refresher: any): void {
        this.content.doRefresh().finally(() => {
            refresher.complete();
        });
    }
}
