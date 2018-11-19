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

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, Optional } from '@angular/core';
import { NavController } from 'ionic-angular';
import { CoreEventsProvider } from '@providers/events';
import { CoreSitesProvider } from '@providers/sites';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreCourseHelperProvider } from '../../providers/helper';
import { CoreCourseModuleHandlerButton } from '../../providers/module-delegate';
import { CoreCourseModulePrefetchDelegate, CoreCourseModulePrefetchHandler } from '../../providers/module-prefetch-delegate';
import { CoreConstants } from '../../../constants';

/**
 * Component to display a module entry in a list of modules.
 *
 * Example usage:
 *
 * <core-course-module [module]="module" [courseId]="courseId" (completionChanged)="onCompletionChange()"></core-course-module>
 */
@Component({
    selector: 'core-course-module',
    templateUrl: 'core-course-module.html'
})
export class CoreCourseModuleComponent implements OnInit, OnDestroy {
    @Input() module: any; // The module to render.
    @Input() courseId: number; // The course the module belongs to.
    @Input('downloadEnabled') set enabled(value: boolean) {
        this.downloadEnabled = value;

        if (this.module.handlerData.showDownloadButton && this.downloadEnabled && !this.statusCalculated) {
            // First time that the download is enabled. Initialize the data.
            this.statusCalculated = true;
            this.spinner = true; // Show spinner while calculating the status.

            // Get current status to decide which icon should be shown.
            this.prefetchDelegate.getModuleStatus(this.module, this.courseId).then(this.showStatus.bind(this));
        }
    }
    @Output() completionChanged?: EventEmitter<void>; // Will emit an event when the module completion changes.

    showDownload: boolean; // Whether to display the download button.
    showRefresh: boolean; // Whether to display the refresh button.
    spinner: boolean; // Whether to display a spinner.
    downloadEnabled: boolean; // Whether the download of sections and modules is enabled.

    protected prefetchHandler: CoreCourseModulePrefetchHandler;
    protected statusObserver;
    protected statusCalculated = false;
    protected isDestroyed = false;

    constructor(@Optional() protected navCtrl: NavController, protected prefetchDelegate: CoreCourseModulePrefetchDelegate,
            protected domUtils: CoreDomUtilsProvider, protected courseHelper: CoreCourseHelperProvider,
            protected eventsProvider: CoreEventsProvider, protected sitesProvider: CoreSitesProvider) {
        this.completionChanged = new EventEmitter();
    }

    /**
     * Component being initialized.
     */
    ngOnInit(): void {
        // Handler data must be defined. If it isn't, set it to prevent errors.
        if (this.module && !this.module.handlerData) {
            this.module.handlerData = {};
        }

        if (this.module.handlerData.showDownloadButton) {
            // Listen for changes on this module status, even if download isn't enabled.
            this.prefetchHandler = this.prefetchDelegate.getPrefetchHandlerFor(this.module);

            this.statusObserver = this.eventsProvider.on(CoreEventsProvider.PACKAGE_STATUS_CHANGED, (data) => {
                if (data.componentId === this.module.id && this.prefetchHandler &&
                        data.component === this.prefetchHandler.component) {

                    if (this.downloadEnabled) {
                        // Download is enabled, show the status.
                        this.showStatus(data.status);
                    } else if (this.module.handlerData.updateStatus) {
                        // Download isn't enabled but the handler defines a updateStatus function, call it anyway.
                        this.module.handlerData.updateStatus(data.status);
                    }
                }
            }, this.sitesProvider.getCurrentSiteId());
        }
    }

    /**
     * Function called when the module is clicked.
     *
     * @param {Event} event Click event.
     */
    moduleClicked(event: Event): void {
        if (this.module.uservisible !== false && this.module.handlerData.action) {
            this.module.handlerData.action(event, this.navCtrl, this.module, this.courseId);
        }
    }

    /**
     * Function called when a button is clicked.
     *
     * @param {Event} event Click event.
     * @param {CoreCourseModuleHandlerButton} button The clicked button.
     */
    buttonClicked(event: Event, button: CoreCourseModuleHandlerButton): void {
        if (button && button.action) {
            event.preventDefault();
            event.stopPropagation();

            button.action(event, this.navCtrl, this.module, this.courseId);
        }
    }

    /**
     * Download the module.
     *
     * @param {Event} event Click event.
     * @param {boolean} refresh Whether it's refreshing.
     */
    download(event: Event, refresh: boolean): void {
        event.preventDefault();
        event.stopPropagation();

        if (!this.prefetchHandler) {
            return;
        }

        // Show spinner since this operation might take a while.
        this.spinner = true;

        // Get download size to ask for confirm if it's high.
        this.prefetchHandler.getDownloadSize(this.module, this.courseId, true).then((size) => {
            return this.courseHelper.prefetchModule(this.prefetchHandler, this.module, size, this.courseId, refresh);
        }).catch((error) => {
            // Error, hide spinner.
            this.spinner = false;
            if (!this.isDestroyed) {
                this.domUtils.showErrorModalDefault(error, 'core.errordownloading', true);
            }
        });
    }

    /**
     * Show download buttons according to module status.
     *
     * @param {string} status Module status.
     */
    protected showStatus(status: string): void {
        if (status) {
            this.spinner = status === CoreConstants.DOWNLOADING;
            this.showDownload = status === CoreConstants.NOT_DOWNLOADED;
            this.showRefresh = status === CoreConstants.OUTDATED ||
                (!this.prefetchDelegate.canCheckUpdates() && status === CoreConstants.DOWNLOADED);

            if (this.module.handlerData.updateStatus) {
                this.module.handlerData.updateStatus(status);
            }
        }
    }

    /**
     * Component destroyed.
     */
    ngOnDestroy(): void {
        this.statusObserver && this.statusObserver.off();
        this.module && this.module.handlerData && this.module.handlerData.onDestroy && this.module.handlerData.onDestroy();
        this.isDestroyed = true;
    }
}
