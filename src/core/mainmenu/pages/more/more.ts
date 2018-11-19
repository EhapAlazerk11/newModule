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
import { IonicPage, NavController } from 'ionic-angular';
import { CoreEventsProvider } from '@providers/events';
import { CoreSitesProvider } from '@providers/sites';
import { CoreMainMenuDelegate, CoreMainMenuHandlerData } from '../../providers/delegate';
import { CoreMainMenuProvider, CoreMainMenuCustomItem } from '../../providers/mainmenu';

/**
 * Page that displays the list of main menu options that aren't in the tabs.
 */
@IonicPage({segment: 'core-mainmenu-more'})
@Component({
    selector: 'page-core-mainmenu-more',
    templateUrl: 'more.html',
})
export class CoreMainMenuMorePage implements OnDestroy {
    handlers: CoreMainMenuHandlerData[];
    handlersLoaded: boolean;
    siteInfo: any;
    logoutLabel: string;
    showWeb: boolean;
    showHelp: boolean;
    docsUrl: string;
    customItems: CoreMainMenuCustomItem[];

    protected subscription;
    protected langObserver;
    protected updateSiteObserver;

    constructor(private menuDelegate: CoreMainMenuDelegate, private sitesProvider: CoreSitesProvider,
            private navCtrl: NavController, private mainMenuProvider: CoreMainMenuProvider,
            eventsProvider: CoreEventsProvider) {

        this.langObserver = eventsProvider.on(CoreEventsProvider.LANGUAGE_CHANGED, this.loadSiteInfo.bind(this));
        this.updateSiteObserver = eventsProvider.on(CoreEventsProvider.SITE_UPDATED, this.loadSiteInfo.bind(this),
            sitesProvider.getCurrentSiteId());
        this.loadSiteInfo();
    }

    /**
     * View loaded.
     */
    ionViewDidLoad(): void {
        // Load the handlers.
        this.subscription = this.menuDelegate.getHandlers().subscribe((handlers) => {
            this.handlers = handlers.slice(CoreMainMenuProvider.NUM_MAIN_HANDLERS); // Remove the main handlers.
            this.handlersLoaded = this.menuDelegate.areHandlersLoaded();
        });
    }

    /**
     * Page destroyed.
     */
    ngOnDestroy(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }

    /**
     * Load the site info required by the view.
     */
    protected loadSiteInfo(): void {
        const currentSite = this.sitesProvider.getCurrentSite(),
            config = currentSite.getStoredConfig();

        this.siteInfo = currentSite.getInfo();
        this.logoutLabel = 'core.mainmenu.' + (config && config.tool_mobile_forcelogout == '1' ? 'logout' : 'changesite');
        this.showWeb = !currentSite.isFeatureDisabled('CoreMainMenuDelegate_website');
        this.showHelp = !currentSite.isFeatureDisabled('CoreMainMenuDelegate_help');

        currentSite.getDocsUrl().then((docsUrl) => {
            this.docsUrl = docsUrl;
        });

        this.mainMenuProvider.getCustomMenuItems().then((items) => {
            this.customItems = items;
        });
    }

    /**
     * Open a handler.
     *
     * @param {CoreMainMenuHandlerData} handler Handler to open.
     */
    openHandler(handler: CoreMainMenuHandlerData): void {
        this.navCtrl.push(handler.page, handler.pageParams);
    }

    /**
     * Open an embedded custom item.
     *
     * @param {CoreMainMenuCustomItem} item Item to open.
     */
    openItem(item: CoreMainMenuCustomItem): void {
        this.navCtrl.push('CoreViewerIframePage', {title: item.label, url: item.url});
    }

    /**
     * Open settings page.
     */
    openSettings(): void {
        this.navCtrl.push('CoreSettingsListPage');
    }

    /**
     * Logout the user.
     */
    logout(): void {
        this.sitesProvider.logout();
    }
}
