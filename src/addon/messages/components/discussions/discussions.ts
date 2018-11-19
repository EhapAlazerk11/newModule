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

import { Component, OnDestroy } from '@angular/core';
import { Platform, NavParams } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { CoreEventsProvider } from '@providers/events';
import { CoreSitesProvider } from '@providers/sites';
import { AddonMessagesProvider } from '../../providers/messages';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreAppProvider } from '@providers/app';
import { AddonPushNotificationsDelegate } from '@addon/pushnotifications/providers/delegate';

/**
 * Component that displays the list of discussions.
 */
@Component({
    selector: 'addon-messages-discussions',
    templateUrl: 'addon-messages-discussions.html',
})
export class AddonMessagesDiscussionsComponent implements OnDestroy {
    protected newMessagesObserver: any;
    protected readChangedObserver: any;
    protected cronObserver: any;
    protected appResumeSubscription: any;
    protected loadingMessages: string;
    protected siteId: string;

    loaded = false;
    loadingMessage: string;
    discussions: any;
    discussionUserId: number;
    pushObserver: any;
    search = {
        enabled: false,
        showResults: false,
        results: [],
        loading: '',
        text: ''
    };

    constructor(private eventsProvider: CoreEventsProvider, sitesProvider: CoreSitesProvider, translate: TranslateService,
            private messagesProvider: AddonMessagesProvider, private domUtils: CoreDomUtilsProvider, navParams: NavParams,
            private appProvider: CoreAppProvider, platform: Platform, utils: CoreUtilsProvider,
            pushNotificationsDelegate: AddonPushNotificationsDelegate) {

        this.search.loading =  translate.instant('core.searching');
        this.loadingMessages = translate.instant('core.loading');
        this.siteId = sitesProvider.getCurrentSiteId();

        // Update discussions when new message is received.
        this.newMessagesObserver = eventsProvider.on(AddonMessagesProvider.NEW_MESSAGE_EVENT, (data) => {
            if (data.userId) {
                const discussion = this.discussions.find((disc) => {
                    return disc.message.user == data.userId;
                });

                if (typeof discussion == 'undefined') {
                    this.loaded = false;
                    this.refreshData().finally(() => {
                        this.loaded = true;
                    });
                } else {
                    // An existing discussion has a new message, update the last message.
                    discussion.message.message = data.message;
                    discussion.message.timecreated = data.timecreated;
                }
            }
        }, this.siteId);

        // Update discussions when a message is read.
        this.readChangedObserver = eventsProvider.on(AddonMessagesProvider.READ_CHANGED_EVENT, (data) => {
            if (data.userId) {
                const discussion = this.discussions.find((disc) => {
                    return disc.message.user == data.userId;
                });

                if (typeof discussion != 'undefined') {
                    // A discussion has been read reset counter.
                    discussion.unread = false;

                    // Discussions changed, invalidate them.
                    this.messagesProvider.invalidateDiscussionsCache();
                }
            }
        }, this.siteId);

        // Update discussions when cron read is executed.
        this.cronObserver = eventsProvider.on(AddonMessagesProvider.READ_CRON_EVENT, (data) => {
            this.refreshData();
        }, this.siteId);

        // Refresh the view when the app is resumed.
        this.appResumeSubscription = platform.resume.subscribe(() => {
            if (!this.loaded) {
                return;
            }
            this.loaded = false;
            this.refreshData();
        });

        this.discussionUserId = navParams.get('discussionUserId') || false;

        // If a message push notification is received, refresh the view.
        this.pushObserver = pushNotificationsDelegate.on('receive').subscribe((notification) => {
            // New message received. If it's from current site, refresh the data.
            if (utils.isFalseOrZero(notification.notif) && notification.site == this.siteId) {
                this.refreshData();
            }
        });
    }

    /**
     * Component loaded.
     */
    ngOnInit(): void {
        if (this.discussionUserId) {
            // There is a discussion to load, open the discussion in a new state.
            this.gotoDiscussion(this.discussionUserId);
        }

        this.fetchData().then(() => {
            if (!this.discussionUserId && this.discussions.length > 0) {
                // Take first and load it.
                this.gotoDiscussion(this.discussions[0].message.user, undefined, true);
            }
        });
    }

    /**
     * Refresh the data.
     *
     * @param {any} [refresher] Refresher.
     * @return {Promise<any>} Promise resolved when done.
     */
    refreshData(refresher?: any): Promise<any> {
        return this.messagesProvider.invalidateDiscussionsCache().then(() => {
            return this.fetchData().finally(() => {
                if (refresher) {
                    // Actions to take if refresh comes from the user.
                    this.eventsProvider.trigger(AddonMessagesProvider.READ_CHANGED_EVENT, undefined, this.siteId);
                    refresher.complete();
                }
            });
        });
    }

    /**
     * Fetch discussions.
     *
     * @return {Promise<any>} Promise resolved when done.
     */
    protected fetchData(): Promise<any> {
        this.loadingMessage = this.loadingMessages;
        this.search.enabled = this.messagesProvider.isSearchMessagesEnabled();

        return this.messagesProvider.getDiscussions().then((discussions) => {
            // Convert to an array for sorting.
            const discussionsSorted = [];
            for (const userId in discussions) {
                discussions[userId].unread = !!discussions[userId].unread;
                discussionsSorted.push(discussions[userId]);
            }

            this.discussions = discussionsSorted.sort((a, b) => {
                return b.message.timecreated - a.message.timecreated;
            });
        }).catch((error) => {
            this.domUtils.showErrorModalDefault(error, 'addon.messages.errorwhileretrievingdiscussions', true);
        }).finally(() => {
            this.loaded = true;
        });
    }

    /**
     * Clear search and show discussions again.
     */
    clearSearch(): void {
        this.loaded = false;
        this.search.showResults = false;
        this.search.text = ''; // Reset searched string.
        this.fetchData().finally(() => {
            this.loaded = true;
        });
    }

    /**
     * Search messages cotaining text.
     *
     * @param  {string}       query Text to search for.
     * @return {Promise<any>}       Resolved when done.
     */
    searchMessage(query: string): Promise<any> {
        this.appProvider.closeKeyboard();
        this.loaded = false;
        this.loadingMessage = this.search.loading;

        return this.messagesProvider.searchMessages(query).then((searchResults) => {
            this.search.showResults = true;
            this.search.results = searchResults;
        }).catch((error) => {
            this.domUtils.showErrorModalDefault(error, 'addon.messages.errorwhileretrievingmessages', true);
        }).finally(() => {
            this.loaded = true;
        });
    }

    /**
     * Navigate to a particular discussion.
     *
     * @param {number} discussionUserId Discussion Id to load.
     * @param {number} [messageId]      Message to scroll after loading the discussion. Used when searching.
     * @param {boolean} [onlyWithSplitView=false]  Only go to Discussion if split view is on.
     */
    gotoDiscussion(discussionUserId: number, messageId?: number, onlyWithSplitView: boolean = false): void {
        this.discussionUserId = discussionUserId;

        const params = {
            discussion: discussionUserId,
            onlyWithSplitView: onlyWithSplitView
        };
        if (messageId) {
            params['message'] = messageId;
        }
        this.eventsProvider.trigger(AddonMessagesProvider.SPLIT_VIEW_LOAD_EVENT, params, this.siteId);
    }

    /**
     * Component destroyed.
     */
    ngOnDestroy(): void {
        this.newMessagesObserver && this.newMessagesObserver.off();
        this.readChangedObserver && this.readChangedObserver.off();
        this.cronObserver && this.cronObserver.off();
        this.appResumeSubscription && this.appResumeSubscription.unsubscribe();
        this.pushObserver && this.pushObserver.unsubscribe();
    }
}
