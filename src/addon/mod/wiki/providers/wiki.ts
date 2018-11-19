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
import { CoreEventsProvider } from '@providers/events';
import { CoreLoggerProvider } from '@providers/logger';
import { CoreSitesProvider } from '@providers/sites';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { CoreAppProvider } from '@providers/app';
import { CoreFilepoolProvider } from '@providers/filepool';
import { AddonModWikiOfflineProvider } from './wiki-offline';
import { CoreSiteWSPreSets } from '@classes/site';

export interface AddonModWikiSubwikiListData {
    /**
     * Number of subwikis.
     * @type {number}
     */
    count: number;

    /**
     * Subwiki ID currently selected.
     * @type {number}
     */
    subwikiSelected: number;

    /**
     * User of the subwiki currently selected.
     * @type {number}
     */
    userSelected: number;

    /**
     * Group of the subwiki currently selected.
     * @type {number}
     */
    groupSelected: number;

    /**
     * List of subwikis.
     * @type {any[]}
     */
    subwikis: any[];
}

/**
 * Service that provides some features for wikis.
 */
@Injectable()
export class AddonModWikiProvider {
    static COMPONENT = 'mmaModWiki';
    static PAGE_CREATED_EVENT = 'addon_mod_wiki_page_created';
    static RENEW_LOCK_TIME = 30000; // Milliseconds.

    protected ROOT_CACHE_KEY = 'mmaModWiki:';
    protected logger;
    protected subwikiListsCache: {[wikiId: number]: AddonModWikiSubwikiListData} = {};

    constructor(logger: CoreLoggerProvider, private sitesProvider: CoreSitesProvider, private appProvider: CoreAppProvider,
            private filepoolProvider: CoreFilepoolProvider, private utils: CoreUtilsProvider, private translate: TranslateService,
            private wikiOffline: AddonModWikiOfflineProvider, eventsProvider: CoreEventsProvider) {
        this.logger = logger.getInstance('AddonModWikiProvider');

        // Clear subwiki lists cache on logout.
        eventsProvider.on(CoreEventsProvider.LOGIN, () => {
            this.clearSubwikiList();
        });
    }

    /**
     * Clear subwiki list cache for a certain wiki or all of them.
     *
     * @param {number} [wikiId] wiki Id, if not provided all will be cleared.
     */
    clearSubwikiList(wikiId?: number): void {
        if (typeof wikiId == 'undefined') {
            this.subwikiListsCache = {};
        } else {
            delete this.subwikiListsCache[wikiId];
        }
    }

    /**
     * Save wiki contents on a page or section.
     *
     * @param {number} pageId Page ID.
     * @param {string} content content to be saved.
     * @param {string} [section] section to get.
     * @return {Promise<number>} Promise resolved with the page ID.
     */
    editPage(pageId: number, content: string, section?: string, siteId?: string): Promise<number> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params: any = {
                    pageid: pageId,
                    content: content
                };

            if (section) {
                params.section = section;
            }

            return site.write('mod_wiki_edit_page', params).then((response) => {
                return response.pageid || Promise.reject(null);
            });
        });
    }

    /**
     * Get a wiki page contents.
     *
     * @param {number} pageId Page ID.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved with the page data.
     */
    getPageContents(pageId: number, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                    pageid: pageId
                },
                preSets: CoreSiteWSPreSets = {
                    cacheKey: this.getPageContentsCacheKey(pageId)
                };

            if (offline) {
                preSets.omitExpires = true;
            } else if (ignoreCache) {
                preSets.getFromCache = false;
                preSets.emergencyCache = false;
            }

            return site.read('mod_wiki_get_page_contents', params, preSets).then((response) => {
                return response.page || Promise.reject(null);
            });
        });
    }

    /**
     * Get cache key for wiki Pages Contents WS calls.
     *
     * @param {number} pageId Wiki Page ID.
     * @return {string} Cache key.
     */
    protected getPageContentsCacheKey(pageId: number): string {
        return this.ROOT_CACHE_KEY + 'page:' + pageId;
    }

    /**
     * Get a wiki page contents for editing. It does not cache calls.
     *
     * @param {number} pageId Page ID.
     * @param {string} [section] Section to get.
     * @param {boolean} [lockOnly] Just renew lock and not return content.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved with page contents.
     */
    getPageForEditing(pageId: number, section?: string, lockOnly?: boolean, siteId?: string): Promise<any> {

        return this.sitesProvider.getSite(siteId).then((site) => {
            const params: any = {
                    pageid: pageId
                };

            if (section) {
                params.section = section;
            }

            // This parameter requires Moodle 3.2. It saves network usage.
            if (lockOnly && site.isVersionGreaterEqualThan('3.2')) {
                params.lockonly = 1;
            }

            return site.write('mod_wiki_get_page_for_editing', params).then((response) => {
                return response.pagesection || Promise.reject(null);
            });
        });
    }

    /**
     * Gets the list of files from a specific subwiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} [groupId] Group to get files from.
     * @param {number} [userId] User to get files from.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>} Promise resolved with subwiki files.
     */
    getSubwikiFiles(wikiId: number, groupId?: number, userId?: number, offline?: boolean, ignoreCache?: boolean, siteId?: string)
            : Promise<any[]> {

        return this.sitesProvider.getSite(siteId).then((site) => {
            groupId = groupId || -1;
            userId = userId || 0;

            const params = {
                    wikiid: wikiId,
                    groupid: groupId,
                    userid: userId
                },
                preSets: CoreSiteWSPreSets = {
                    cacheKey: this.getSubwikiFilesCacheKey(wikiId, groupId, userId)
                };

            if (offline) {
                preSets.omitExpires = true;
            } else if (ignoreCache) {
                preSets.getFromCache = false;
                preSets.emergencyCache = false;
            }

            return site.read('mod_wiki_get_subwiki_files', params, preSets).then((response) => {
                return response.files || Promise.reject(null);
            });
        });
    }

    /**
     * Get cache key for wiki Subwiki Files WS calls.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} groupId Group ID.
     * @param {number} userId User ID.
     * @return {string} Cache key.
     */
    protected getSubwikiFilesCacheKey(wikiId: number, groupId: number, userId: number): string {
        return this.getSubwikiFilesCacheKeyPrefix(wikiId) + ':' + groupId + ':' + userId;
    }

    /**
     * Get cache key for all wiki Subwiki Files WS calls.
     *
     * @param {number} wikiId Wiki ID.
     * @return {string} Cache key.
     */
    protected getSubwikiFilesCacheKeyPrefix(wikiId: number): string {
        return this.ROOT_CACHE_KEY + 'subwikifiles:' + wikiId;
    }

    /**
     * Get a list of subwikis and related data for a certain wiki from the cache.
     *
     * @param {number} wikiId wiki Id
     * @return {AddonModWikiSubwikiListData} Subwiki list and related data.
     */
    getSubwikiList(wikiId: number): AddonModWikiSubwikiListData {
        return this.subwikiListsCache[wikiId];
    }

    /**
     * Get the list of Pages of a SubWiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} [groupId] Group to get pages from.
     * @param {number} [userId] User to get pages from.
     * @param {string} [sortBy=title] The attribute to sort the returned list.
     * @param {string} [sortDirection=ASC] Direction to sort the returned list (ASC | DESC).
     * @param {boolean} [includeContent] Whether the pages have to include its content. Default: false.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>} Promise resolved with wiki subwiki pages.
     */
    getSubwikiPages(wikiId: number, groupId?: number, userId?: number, sortBy: string = 'title', sortDirection: string = 'ASC',
            includeContent?: boolean, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {

        return this.sitesProvider.getSite(siteId).then((site) => {
            groupId = groupId || -1;
            userId = userId || 0;
            sortBy = sortBy || 'title';
            sortDirection = sortDirection || 'ASC';
            includeContent = includeContent || false;

            const params = {
                    wikiid: wikiId,
                    groupid: groupId,
                    userid: userId,
                    options: {
                        sortby: sortBy,
                        sortdirection: sortDirection,
                        includecontent: includeContent ? 1 : 0
                    }

                },
                preSets: CoreSiteWSPreSets = {
                    cacheKey: this.getSubwikiPagesCacheKey(wikiId, groupId, userId)
                };

            if (offline) {
                preSets.omitExpires = true;
            } else if (ignoreCache) {
                preSets.getFromCache = false;
                preSets.emergencyCache = false;
            }

            return site.read('mod_wiki_get_subwiki_pages', params, preSets).then((response) => {
                return response.pages || Promise.reject(null);
            });
        });
    }

    /**
     * Get cache key for wiki Subwiki Pages WS calls.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} groupId Group ID.
     * @param {number} userId User ID.
     * @return {string} Cache key.
     */
    protected getSubwikiPagesCacheKey(wikiId: number, groupId: number, userId: number): string {
        return this.getSubwikiPagesCacheKeyPrefix(wikiId) + ':' + groupId + ':' + userId;
    }

    /**
     * Get cache key for all wiki Subwiki Pages WS calls.
     *
     * @param {number} wikiId Wiki ID.
     * @return {string} Cache key.
     */
    protected getSubwikiPagesCacheKeyPrefix(wikiId: number): string {
        return this.ROOT_CACHE_KEY + 'subwikipages:' + wikiId;
    }

    /**
     * Get all the subwikis of a wiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>} Promise resolved with subwikis.
     */
    getSubwikis(wikiId: number, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                    wikiid: wikiId
                },
                preSets: CoreSiteWSPreSets = {
                    cacheKey: this.getSubwikisCacheKey(wikiId)
                };

            if (offline) {
                preSets.omitExpires = true;
            } else if (ignoreCache) {
                preSets.getFromCache = false;
                preSets.emergencyCache = false;
            }

            return site.read('mod_wiki_get_subwikis', params, preSets).then((response) => {
                return response.subwikis || Promise.reject(null);
            });
        });
    }

    /**
     * Get cache key for get wiki subWikis WS calls.
     *
     * @param {number} wikiId Wiki ID.
     * @return {string} Cache key.
     */
    protected getSubwikisCacheKey(wikiId: number): string {
        return this.ROOT_CACHE_KEY + 'subwikis:' + wikiId;
    }

    /**
     * Get a wiki by module ID.
     *
     * @param {number} courseId Course ID.
     * @param {number} cmId Course module ID.
     * @param {boolean} [forceCache] Whether it should always return cached data.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the wiki is retrieved.
     */
    getWiki(courseId: number, cmId: number, forceCache?: boolean, siteId?: string): Promise<any> {
        return this.getWikiByField(courseId, 'coursemodule', cmId, forceCache, siteId);
    }

    /**
     * Get a wiki with key=value. If more than one is found, only the first will be returned.
     *
     * @param {number} courseId Course ID.
     * @param {string} key Name of the property to check.
     * @param {any} value Value to search.
     * @param {boolean} [forceCache] Whether it should always return cached data.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the wiki is retrieved.
     */
    protected getWikiByField(courseId: number, key: string, value: any, forceCache?: boolean, siteId?: string): Promise<any> {

        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                    courseids: [courseId]
                },
                preSets = {
                    cacheKey: this.getWikiDataCacheKey(courseId)
                };

            return site.read('mod_wiki_get_wikis_by_courses', params, preSets).then((response) => {
                if (response.wikis) {
                    const currentWiki = response.wikis.find((wiki) => {
                        return wiki[key] == value;
                    });

                    if (currentWiki) {
                        return currentWiki;
                    }
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Get a wiki by wiki ID.
     *
     * @param {number} courseId Course ID.
     * @param {number} id Wiki ID.
     * @param {boolean} [forceCache] Whether it should always return cached data.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the wiki is retrieved.
     */
    getWikiById(courseId: number, id: number, forceCache?: boolean, siteId?: string): Promise<any> {
        return this.getWikiByField(courseId, 'id', id, forceCache, siteId);
    }

    /**
     * Get cache key for wiki data WS calls.
     *
     * @param {number} courseId Course ID.
     * @return {string} Cache key.
     */
    protected getWikiDataCacheKey(courseId: number): string {
        return this.ROOT_CACHE_KEY + 'wiki:' + courseId;
    }

    /**
     * Gets a list of files to download for a wiki, using a format similar to module.contents from get_course_contents.
     *
     * @param {any} wiki Wiki.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>} Promise resolved with the list of files.
     */
    getWikiFileList(wiki: any, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        let files = [];

        return this.getSubwikis(wiki.id, offline, ignoreCache, siteId).then((subwikis) => {
            const promises = [];

            subwikis.forEach((subwiki) => {
                promises.push(this.getSubwikiFiles(subwiki.wikiid, subwiki.groupid, subwiki.userid, offline, ignoreCache, siteId)
                        .then((swFiles) => {
                    files = files.concat(swFiles);
                }));
            });

            return Promise.all(promises).then(() => {
                return files;
            });
        });
    }

    /**
     * Gets a list of all pages for a Wiki.
     *
     * @param {any} wiki Wiki.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>} Page list.
     */
    getWikiPageList(wiki: any, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        let pages = [];

        return this.getSubwikis(wiki.id, offline, ignoreCache, siteId).then((subwikis) => {
            const promises = [];

            subwikis.forEach((subwiki) => {
                promises.push(this.getSubwikiPages(subwiki.wikiid, subwiki.groupid, subwiki.userid, undefined, undefined,
                        undefined, offline, ignoreCache, siteId).then((subwikiPages) => {
                    pages = pages.concat(subwikiPages);
                }));
            });

            return Promise.all(promises).then(() => {
                return pages;
            });
        });
    }

    /**
     * Invalidate the prefetched content except files.
     * To invalidate files, use invalidateFiles.
     *
     * @param {number} moduleId The module ID.
     * @param {number} courseId Course ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when done.
     */
    invalidateContent(moduleId: number, courseId: number, siteId?: string): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.getWiki(courseId, moduleId, false, siteId).then((wiki) => {
            const promises = [];

            promises.push(this.invalidateWikiData(courseId, siteId));
            promises.push(this.invalidateSubwikis(wiki.id, siteId));
            promises.push(this.invalidateSubwikiPages(wiki.id, siteId));
            promises.push(this.invalidateSubwikiFiles(wiki.id, siteId));

            return Promise.all(promises);
        });
    }

    /**
     * Invalidate the prefetched files.
     *
     * @param {number} moduleId The module ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the files are invalidated.
     */
    invalidateFiles(moduleId: number, siteId?: string): Promise<any> {
        return this.filepoolProvider.invalidateFilesByComponent(siteId, AddonModWikiProvider.COMPONENT, moduleId);
    }

    /**
     * Invalidates page content WS call for a certain page.
     *
     * @param {number} pageId Wiki Page ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidatePage(pageId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getPageContentsCacheKey(pageId));
        });
    }

    /**
     * Invalidates all the subwiki files WS calls for a certain wiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateSubwikiFiles(wikiId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKeyStartingWith(this.getSubwikiFilesCacheKeyPrefix(wikiId));
        });
    }

    /**
     * Invalidates all the subwiki pages WS calls for a certain wiki.
     *
     * @param {Number} wikiId Wiki ID.
     * @param  {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateSubwikiPages(wikiId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKeyStartingWith(this.getSubwikiPagesCacheKeyPrefix(wikiId));
        });
    }

    /**
     * Invalidates all the get subwikis WS calls for a certain wiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateSubwikis(wikiId: number, siteId?: string): Promise<any> {
        this.clearSubwikiList(wikiId);

        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getSubwikisCacheKey(wikiId));
        });
    }

    /**
     * Invalidates wiki data.
     *
     * @param {Number} courseId Course ID.
     * @param  {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise}        Promise resolved when the data is invalidated.
     */
    invalidateWikiData(courseId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getWikiDataCacheKey(courseId));
        });
    }

    /**
     * Check if a page title is already used.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} subwikiId Subwiki ID.
     * @param {string} title Page title.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId]  Site ID. If not defined, current site.
     * @return {Promise<boolean>} Promise resolved with true if used, resolved with false if not used or cannot determine.
     */
    isTitleUsed(wikiId: number, subwikiId: number, title: string, offline?: boolean, ignoreCache?: boolean, siteId?: string)
            : Promise<boolean> {

        // First get the subwiki.
        return this.getSubwikis(wikiId, offline, ignoreCache, siteId).then((subwikis) => {
            // Search the subwiki.
            const subwiki = subwikis.find((subwiki) => {
                return subwiki.id == subwikiId;
            });

            return subwiki || Promise.reject(null);
        }).then((subwiki) => {
            // Now get all the pages of the subwiki.
            return this.getSubwikiPages(wikiId, subwiki.groupid, subwiki.userid, undefined, undefined, false, offline,
                    ignoreCache, siteId);
        }).then((pages) => {
            // Check if there's any page with the same title.
            const page = pages.find((page) => {
                return page.title == title;
            });

            return !!page;
        }).catch(() => {
            return false;
        });
    }

    /**
     * Report a wiki page as being viewed.
     *
     * @param {string} id Page ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the WS call is successful.
     */
    logPageView(id: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                pageid: id
            };

            return site.write('mod_wiki_view_page', params);
        });
    }

    /**
     * Report the wiki as being viewed.
     *
     * @param {number} id Wiki ID.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the WS call is successful.
     */
    logView(id: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                wikiid: id
            };

            return site.write('mod_wiki_view_wiki', params);
        });
    }

    /**
     * Create a new page on a subwiki.
     *
     * @param {string} title Title to create the page.
     * @param {string} content Content to save on the page.
     * @param {number} [subwikiId] Subwiki ID. If not defined, wikiId, userId and groupId should be defined.
     * @param {number} [wikiId] Wiki ID. Optional, will be used to create a new subwiki if subwikiId not supplied.
     * @param {number} [userId] User ID. Optional, will be used to create a new subwiki if subwikiId not supplied.
     * @param {number} [groupId] Group ID. Optional, will be used to create a new subwiki if subwikiId not supplied.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<number>} Promise resolved with page ID if page was created in server, -1 if stored in device.
     */
    newPage(title: string, content: string, subwikiId?: number, wikiId?: number, userId?: number, groupId?: number,
            siteId?: string): Promise<number> {

        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        // Convenience function to store a new page to be synchronized later.
        const storeOffline = (): Promise<number> => {
            let promise;

            if (wikiId) {
                // We have wiki ID, check if there's already an online page with this title and subwiki.
                promise = this.isTitleUsed(wikiId, subwikiId, title, true, false, siteId).catch(() => {
                    // Error, assume not used.
                    return false;
                }).then((used) => {
                    if (used) {
                        return Promise.reject(this.translate.instant('addon.mod_wiki.pageexists'));
                    }
                });
            } else {
                promise = Promise.resolve();
            }

            return promise.then(() => {
                return this.wikiOffline.saveNewPage(title, content, subwikiId, wikiId, userId, groupId, siteId).then(() => {
                    return -1;
                });
            });
        };

        if (!this.appProvider.isOnline()) {
            // App is offline, store the action.
            return storeOffline();
        }

        // Discard stored content for this page. If it exists it means the user is editing it.
        return this.wikiOffline.deleteNewPage(title, subwikiId, wikiId, userId, groupId, siteId).then(() => {
            // Try to create it in online.
            return this.newPageOnline(title, content, subwikiId, wikiId, userId, groupId, siteId).catch((error) => {
                if (this.utils.isWebServiceError(error)) {
                    // The WebService has thrown an error, this means that the page cannot be added.
                    return Promise.reject(error);
                } else {
                    // Couldn't connect to server, store in offline.
                    return storeOffline();
                }
            });
        });
    }

    /**
     * Create a new page on a subwiki. It will fail if offline or cannot connect.
     *
     * @param {string} title Title to create the page.
     * @param {string} content Content to save on the page.
     * @param {number} [subwikiId] Subwiki ID. If not defined, wikiId, userId and groupId should be defined.
     * @param {number} [wikiId] Wiki ID. Optional, will be used create subwiki if not informed.
     * @param {number} [userId] User ID. Optional, will be used create subwiki if not informed.
     * @param {number} [groupId] Group ID. Optional, will be used create subwiki if not informed.
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<number>} Promise resolved with the page ID if created, rejected otherwise.
     */
    newPageOnline(title: string, content: string, subwikiId?: number, wikiId?: number, userId?: number, groupId?: number,
            siteId?: string): Promise<number> {

        return this.sitesProvider.getSite(siteId).then((site) => {
            const params: any = {
                    title: title,
                    content: content,
                    contentformat: 'html'
                };

            subwikiId = this.wikiOffline.convertToPositiveNumber(subwikiId);
            wikiId = this.wikiOffline.convertToPositiveNumber(wikiId);

            if (subwikiId && subwikiId > 0) {
                params.subwikiid = subwikiId;
            } else if (wikiId) {
                params.wikiid = wikiId;
                params.userid = this.wikiOffline.convertToPositiveNumber(userId);
                params.groupid = this.wikiOffline.convertToPositiveNumber(groupId);
            }

            return site.write('mod_wiki_new_page', params).then((response) => {
                return response.pageid || Promise.reject(null);
            });
        });
    }

    /**
     * Save subwiki list for a wiki to the cache.
     *
     * @param {number} wikiId Wiki Id.
     * @param {any[]} subwikis List of subwikis.
     * @param {number} count Number of subwikis in the subwikis list.
     * @param {number} subwikiId Subwiki Id currently selected.
     * @param {number} userId User Id currently selected.
     * @param {number} groupId Group Id currently selected.
     */
    setSubwikiList(wikiId: number, subwikis: any[], count: number, subwikiId: number, userId: number, groupId: number): void {
        this.subwikiListsCache[wikiId] = {
            count: count,
            subwikiSelected: subwikiId,
            userSelected: userId,
            groupSelected: groupId,
            subwikis: subwikis
        };
    }

    /**
     * Sort an array of wiki pages by title.
     *
     * @param {any[]} pages Pages to sort.
     * @param {boolean} [desc] True to sort in descendent order, false to sort in ascendent order. Defaults to false.
     * @return {any[]} Sorted pages.
     */
    sortPagesByTitle(pages: any[], desc?: boolean): any[] {
        return pages.sort((a, b) => {
            let result = a.title >= b.title ? 1 : -1;

            if (desc) {
                result = -result;
            }

            return result;
        });
    }

    /**
     * Check if a wiki has a certain subwiki.
     *
     * @param {number} wikiId Wiki ID.
     * @param {number} subwikiId Subwiki ID to search.
     * @param {boolean} [offline] Whether it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] Whether it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<boolean>} Promise resolved with true if it has subwiki, resolved with false otherwise.
     */
    wikiHasSubwiki(wikiId: number, subwikiId: number, offline?: boolean, ignoreCache?: boolean, siteId?: string): Promise<boolean> {
        // Get the subwikis to check if any of them matches the one passed as param.
        return this.getSubwikis(wikiId, offline, ignoreCache, siteId).then((subwikis) => {
            const subwiki = subwikis.find((subwiki) => {
                return subwiki.id == subwikiId;
            });

            return !!subwiki;
        }).catch(() => {
            // Not found, return false.
            return false;
        });
    }
}
