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

import { Component, Optional } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { CoreSitesProvider } from '@providers/sites';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreSplitViewComponent } from '@components/split-view/split-view';
import { AddonCompetencyProvider } from '../../providers/competency';

/**
 * Page that displays a learning plan.
 */
@IonicPage({ segment: 'addon-competency-competency' })
@Component({
    selector: 'page-addon-competency-competency',
    templateUrl: 'competency.html',
})
export class AddonCompetencyCompetencyPage {
    competencyLoaded = false;
    competencyId: number;
    planId: number;
    courseId: number;
    userId: number;
    planStatus: number;
    coursemodules: any;
    user: any;
    competency: any;

    constructor(private navCtrl: NavController, navParams: NavParams, private translate: TranslateService,
            private sitesProvider: CoreSitesProvider, private domUtils: CoreDomUtilsProvider,
            @Optional() private svComponent: CoreSplitViewComponent, private competencyProvider: AddonCompetencyProvider) {
        this.competencyId = navParams.get('competencyId');
        this.planId = navParams.get('planId');
        this.courseId = navParams.get('courseId');
        this.userId = navParams.get('userId');
    }

    /**
     * View loaded.
     */
    ionViewDidLoad(): void {
        this.fetchCompetency().then(() => {
            if (this.planId) {
                this.competencyProvider.logCompetencyInPlanView(this.planId, this.competencyId, this.planStatus, this.userId);
            } else {
                this.competencyProvider.logCompetencyInCourseView(this.courseId, this.competencyId, this.userId);
            }
        }).finally(() => {
            this.competencyLoaded = true;
        });
    }

    /**
     * Fetches the competency and updates the view.
     *
     * @return {Promise<void>} Promise resolved when done.
     */
    protected fetchCompetency(): Promise<void> {
        let promise;
        if (this.planId) {
            this.planStatus = null;
            promise = this.competencyProvider.getCompetencyInPlan(this.planId, this.competencyId);
        } else if (this.courseId) {
            promise = this.competencyProvider.getCompetencyInCourse(this.courseId, this.competencyId, this.userId);
        } else {
            promise = Promise.reject(null);
        }

        return promise.then((competency) => {
            this.competency = competency.usercompetencysummary;

            if (this.planId) {
                this.planStatus = competency.plan.status;
                this.competency.usercompetency.statusname = this.getStatusName(this.competency.usercompetency.status);
            } else {
                this.competency.usercompetency = this.competency.usercompetencycourse;
                this.coursemodules = competency.coursemodules;
            }

            if (this.competency.user.id != this.sitesProvider.getCurrentSiteUserId()) {
                this.competency.user.profileimageurl = this.competency.user.profileimageurl || true;

                // Get the user profile image from the returned object.
                this.user = this.competency.user;
            }

            this.competency.evidence.forEach((evidence) => {
                if (evidence.descidentifier) {
                    const key = 'addon.competency.' + evidence.descidentifier;
                    evidence.description = this.translate.instant(key, {$a: evidence.desca});
                }
            });
        }).catch((message) => {
            this.domUtils.showErrorModalDefault(message, 'Error getting competency data.');
        });
    }

    /**
     * Convenience function to get the review status name translated.
     *
     * @param {number} status
     * @return {string}
     */
    protected getStatusName(status: number): string {
        let statusTranslateName;
        switch (status) {
            case AddonCompetencyProvider.REVIEW_STATUS_IDLE:
                statusTranslateName = 'idle';
                break;
            case AddonCompetencyProvider.REVIEW_STATUS_IN_REVIEW:
                statusTranslateName = 'inreview';
                break;
            case AddonCompetencyProvider.REVIEW_STATUS_WAITING_FOR_REVIEW:
                statusTranslateName = 'waitingforreview';
                break;
            default:
                // We can use the current status name.
                return String(status);
        }

        return this.translate.instant('addon.competency.usercompetencystatus_' + statusTranslateName);
    }

    /**
     * Refreshes the competency.
     *
     * @param {any} refresher Refresher.
     */
    refreshCompetency(refresher: any): void {
        let promise;
        if (this.planId) {
            promise = this.competencyProvider.invalidateCompetencyInPlan(this.planId, this.competencyId);
        } else {
            promise = this.competencyProvider.invalidateCompetencyInCourse(this.courseId, this.competencyId);
        }

        return promise.finally(() => {
            this.fetchCompetency().finally(() => {
                refresher.complete();
            });
        });
    }

    /**
     * Opens the summary of a competency.
     *
     * @param {number} competencyId
     */
    openCompetencySummary(competencyId: number): void {
        // Decide which navCtrl to use. If this page is inside a split view, use the split view's master nav.
        const navCtrl = this.svComponent ? this.svComponent.getMasterNav() : this.navCtrl;
        navCtrl.push('AddonCompetencyCompetencySummaryPage', {competencyId});
    }

    /**
     * Opens the profile of a user.
     *
     * @param {number} userId
     */
    openUserProfile(userId: number): void {
        // Decide which navCtrl to use. If this page is inside a split view, use the split view's master nav.
        const navCtrl = this.svComponent ? this.svComponent.getMasterNav() : this.navCtrl;
        navCtrl.push('CoreUserProfilePage', {userId, courseId: this.courseId});
    }
}
