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
import { NavController, NavOptions } from 'ionic-angular';
import { DomSanitizer } from '@angular/platform-browser';
import { CoreCourseModuleHandler, CoreCourseModuleHandlerData } from '@core/course/providers/module-delegate';
import { CoreAppProvider } from '@providers/app';
import { CoreCourseProvider } from '@core/course/providers/course';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreFilepoolProvider } from '@providers/filepool';
import { CoreSitesProvider } from '@providers/sites';
import { AddonModLtiIndexComponent } from '../components/index/index';
import { AddonModLtiProvider } from './lti';

/**
 * Handler to support LTI modules.
 */
@Injectable()
export class AddonModLtiModuleHandler implements CoreCourseModuleHandler {
    name = 'AddonModLti';
    modName = 'lti';

    constructor(private appProvider: CoreAppProvider,
            private courseProvider: CoreCourseProvider,
            private domUtils: CoreDomUtilsProvider,
            private filepoolProvider: CoreFilepoolProvider,
            private sitesProvider: CoreSitesProvider,
            private ltiProvider: AddonModLtiProvider,
            private sanitizer: DomSanitizer) {}

    /**
     * Check if the handler is enabled on a site level.
     *
     * @return {boolean|Promise<boolean>} Whether or not the handler is enabled on a site level.
     */
    isEnabled(): boolean | Promise<boolean> {
        return true;
    }

    /**
     * Get the data required to display the module in the course contents view.
     *
     * @param {any} module The module object.
     * @param {number} courseId The course ID.
     * @param {number} sectionId The section ID.
     * @return {CoreCourseModuleHandlerData} Data to render the module.
     */
    getData(module: any, courseId: number, sectionId: number): CoreCourseModuleHandlerData {
        const data: CoreCourseModuleHandlerData = {
            icon: this.courseProvider.getModuleIconSrc('lti'),
            title: module.name,
            class: 'addon-mod_lti-handler',
            action(event: Event, navCtrl: NavController, module: any, courseId: number, options: NavOptions): void {
                navCtrl.push('AddonModLtiIndexPage', {module: module, courseId: courseId}, options);
            },
            buttons: [{
                icon: 'link',
                label: 'addon.mod_lti.launchactivity',
                action: (event: Event, navCtrl: NavController, module: any, courseId: number): void => {
                    const modal = this.domUtils.showModalLoading();

                    // Get LTI and launch data.
                    this.ltiProvider.getLti(courseId, module.id).then((ltiData) => {
                        return this.ltiProvider.getLtiLaunchData(ltiData.id).then((launchData) => {
                            // "View" LTI.
                            this.ltiProvider.logView(ltiData.id).then(() => {
                                this.courseProvider.checkModuleCompletion(courseId, module.completionstatus);
                            }).catch(() => {
                                // Ignore errors.
                            });

                            // Launch LTI.
                            return this.ltiProvider.launch(launchData.endpoint, launchData.parameters);
                        });
                    }).catch((message) => {
                        this.domUtils.showErrorModalDefault(message, 'addon.mod_lti.errorgetlti', true);
                    }).finally(() => {
                        modal.dismiss();
                    });
                }
            }]
        };

        // Handle custom icons.
        this.ltiProvider.getLti(courseId, module.id).then((ltiData) => {
            const icon = ltiData.secureicon || ltiData.icon;
            if (icon) {
                const siteId = this.sitesProvider.getCurrentSiteId();
                this.filepoolProvider.downloadUrl(siteId,  icon, false, AddonModLtiProvider.COMPONENT, module.id).then(() => {
                    // Get the internal URL.
                    return this.filepoolProvider.getSrcByUrl(siteId, icon, AddonModLtiProvider.COMPONENT, module.id);
                }).then((url) => {
                    data.icon = this.sanitizer.bypassSecurityTrustUrl(url);
                }).catch(() => {
                    // Error downloading. If we're online we'll set the online url.
                    if (this.appProvider.isOnline()) {
                        data.icon = this.sanitizer.bypassSecurityTrustUrl(icon);
                    }
                });
            }
        }).catch(() => {
            // Ignore errors.
        });

        return data;
    }

    /**
     * Get the component to render the module. This is needed to support singleactivity course format.
     * The component returned must implement CoreCourseModuleMainComponent.
     *
     * @param {any} course The course object.
     * @param {any} module The module object.
     * @return {any} The component to use, undefined if not found.
     */
    getMainComponent(course: any, module: any): any {
        return AddonModLtiIndexComponent;
    }
}
