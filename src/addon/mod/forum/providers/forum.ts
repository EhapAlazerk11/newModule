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
import { CoreGroupsProvider } from '@providers/groups';
import { CoreSitesProvider } from '@providers/sites';
import { CoreUserProvider } from '@core/user/providers/user';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { AddonModForumOfflineProvider } from './offline';

/**
 * Service that provides some features for forums.
 */
@Injectable()
export class AddonModForumProvider {
    static COMPONENT = 'mmaModForum';
    static DISCUSSIONS_PER_PAGE = 10; // Max of discussions per page.
    static NEW_DISCUSSION_EVENT = 'addon_mod_forum_new_discussion';
    static REPLY_DISCUSSION_EVENT = 'addon_mod_forum_reply_discussion';
    static VIEW_DISCUSSION_EVENT = 'addon_mod_forum_view_discussion';
    static MARK_READ_EVENT = 'addon_mod_forum_mark_read';

    protected ROOT_CACHE_KEY = 'mmaModForum:';

    constructor(private appProvider: CoreAppProvider,
            private sitesProvider: CoreSitesProvider,
            private groupsProvider: CoreGroupsProvider,
            private filepoolProvider: CoreFilepoolProvider,
            private userProvider: CoreUserProvider,
            private translate: TranslateService,
            private utils: CoreUtilsProvider,
            private forumOffline: AddonModForumOfflineProvider) {}

    /**
     * Get cache key for can add discussion WS calls.
     *
     * @param  {number} forumId Forum ID.
     * @param  {number} groupId Group ID.
     * @return {string}         Cache key.
     */
    protected getCanAddDiscussionCacheKey(forumId: number, groupId: number): string {
        return this.getCommonCanAddDiscussionCacheKey(forumId) + ':' + groupId;
    }

    /**
     * Get common part of cache key for can add discussion WS calls.
     *
     * @param  {number} forumId Forum ID.
     * @return {string}         Cache key.
     */
    protected getCommonCanAddDiscussionCacheKey(forumId: number): string {
        return this.ROOT_CACHE_KEY + 'canadddiscussion:' + forumId;
    }

    /**
     * Get cache key for forum data WS calls.
     *
     * @param  {number} courseId Course ID.
     * @return {string}          Cache key.
     */
    protected getForumDataCacheKey(courseId: number): string {
        return this.ROOT_CACHE_KEY + 'forum:' + courseId;
    }

    /**
     * Get cache key for forum discussion posts WS calls.
     *
     * @param  {number} discussionId Discussion ID.
     * @return {string}              Cache key.
     */
    protected getDiscussionPostsCacheKey(discussionId: number): string {
        return this.ROOT_CACHE_KEY + 'discussion:' + discussionId;
    }

    /**
     * Get cache key for forum discussions list WS calls.
     *
     * @param  {number} forumId Forum ID.
     * @return {string}         Cache key.
     */
    protected getDiscussionsListCacheKey(forumId: number): string {
        return this.ROOT_CACHE_KEY + 'discussions:' + forumId;
    }

    /**
     * Add a new discussion.
     *
     * @param  {number}  forumId       Forum ID.
     * @param  {string}  name          Forum name.
     * @param  {number}  courseId      Course ID the forum belongs to.
     * @param  {string}  subject       New discussion's subject.
     * @param  {string}  message       New discussion's message.
     * @param  {any}     [options]     Options (subscribe, pin, ...).
     * @param  {string}  [groupId]     Group this discussion belongs to.
     * @param  {string}  [siteId]      Site ID. If not defined, current site.
     * @param  {number}  [timeCreated] The time the discussion was created. Only used when editing discussion.
     * @param  {boolean} allowOffline  True if it can be stored in offline, false otherwise.
     * @return {Promise<any>}          Promise resolved with discussion ID if sent online, resolved with false if stored offline.
     */
    addNewDiscussion(forumId: number, name: string, courseId: number, subject: string, message: string, options?: any,
            groupId?: number, siteId?: string, timeCreated?: number, allowOffline?: boolean): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        // Convenience function to store a message to be synchronized later.
        const storeOffline = (): Promise<any> => {
            return this.forumOffline.addNewDiscussion(forumId, name, courseId, subject, message, options,
                    groupId, timeCreated, siteId).then(() => {
                return false;
            });
        };

        // If we are editing an offline discussion, discard previous first.
        let discardPromise;
        if (timeCreated) {
            discardPromise = this.forumOffline.deleteNewDiscussion(forumId, timeCreated, siteId);
        } else {
            discardPromise = Promise.resolve();
        }

        return discardPromise.then(() => {
            if (!this.appProvider.isOnline() && allowOffline) {
                // App is offline, store the action.
                return storeOffline();
            }

            return this.addNewDiscussionOnline(forumId, subject, message, options, groupId, siteId).then((id) => {
                // Success, return the discussion ID.
                return id;
            }).catch((error) => {
                if (!allowOffline || this.utils.isWebServiceError(error)) {
                    // The WebService has thrown an error or offline not supported, reject.
                    return Promise.reject(error);
                }

                // Couldn't connect to server, store in offline.
                return storeOffline();
            });
        });
    }

    /**
     * Add a new discussion. It will fail if offline or cannot connect.
     *
     * @param  {number} forumId   Forum ID.
     * @param  {string} subject   New discussion's subject.
     * @param  {string} message   New discussion's message.
     * @param  {any}    [options] Options (subscribe, pin, ...).
     * @param  {string} [groupId] Group this discussion belongs to.
     * @param  {string} [siteId]  Site ID. If not defined, current site.
     * @return {Promise<any>}     Promise resolved when the discussion is created.
     */
    addNewDiscussionOnline(forumId: number, subject: string, message: string, options?: any, groupId?: number, siteId?: string)
            : Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params: any = {
                forumid: forumId,
                subject: subject,
                message: message,
                options: this.utils.objectToArrayOfObjects(options, 'name', 'value')
            };

            if (groupId) {
                params.groupid = groupId;
            }

            return site.write('mod_forum_add_discussion', params).then((response) => {
                // Other errors ocurring.
                if (!response || !response.discussionid) {
                    return Promise.reject(this.utils.createFakeWSError(''));
                } else {
                    return response.discussionid;
                }
            });
        });
    }

    /**
     * Check if a user can post to a certain group.
     *
     * @param  {number} forumId  Forum ID.
     * @param  {number} groupId  Group ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved with an object with the following properties:
     *                            - status (boolean)
     *                            - canpindiscussions (boolean)
     *                            - cancreateattachment (boolean)
     */
    canAddDiscussion(forumId: number, groupId: number, siteId?: string): Promise<any> {
        const params = {
            forumid: forumId,
            groupid: groupId
        };
        const preSets = {
            cacheKey: this.getCanAddDiscussionCacheKey(forumId, groupId)
        };

        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.read('mod_forum_can_add_discussion', params, preSets).then((result) => {
                if (result) {
                    if (typeof result.canpindiscussions == 'undefined') {
                        // WS doesn't support it yet, default it to false to prevent students from seing the option.
                        result.canpindiscussions = false;
                    }
                    if (typeof result.cancreateattachment == 'undefined') {
                        // WS doesn't support it yet, default it to true since usually the users will be able to create them.
                        result.cancreateattachment = true;
                    }

                    return result;
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Check if a user can post to all groups.
     *
     * @param  {number} forumId Forum ID.
     * @return {Promise<any>}   Promise resolved with an object with the following properties:
     *                           - status (boolean)
     *                           - canpindiscussions (boolean)
     *                           - cancreateattachment (boolean)
     */
    canAddDiscussionToAll(forumId: number): Promise<any> {
        return this.canAddDiscussion(forumId, -1);
    }

    /**
     * Extract the starting post of a discussion from a list of posts. The post is removed from the array passed as a parameter.
     *
     * @param  {any[]} posts Posts to search.
     * @return {any}         Starting post or undefined if not found.
     */
    extractStartingPost(posts: any[]): any {
        // Check the last post first, since they'll usually be ordered by create time.
        for (let i = posts.length - 1; i >= 0; i--) {
            if (posts[i].parent == 0) {
                return posts.splice(i, 1).pop(); // Remove it from the array.
            }
        }

        return undefined;
    }

    /**
     * There was a bug adding new discussions to All Participants (see MDL-57962). Check if it's fixed.
     *
     * @return {boolean} True if fixed, false otherwise.
     */
    isAllParticipantsFixed(): boolean {
        return this.sitesProvider.getCurrentSite().isVersionGreaterEqualThan(['3.1.5', '3.2.2']);
    }

    /**
     * Format discussions, setting groupname if the discussion group is valid.
     *
     * @param  {number} cmId        Forum cmid.
     * @param  {any[]}  discussions List of discussions to format.
     * @return {Promise<any[]>}     Promise resolved with the formatted discussions.
     */
    formatDiscussionsGroups(cmId: number, discussions: any[]): Promise<any[]> {
        discussions = this.utils.clone(discussions);

        return this.groupsProvider.getActivityAllowedGroups(cmId).then((forumGroups) => {
            const strAllParts = this.translate.instant('core.allparticipants');

            // Turn groups into an object where each group is identified by id.
            const groups = {};
            forumGroups.forEach((fg) => {
                groups[fg.id] = fg;
            });

            // Format discussions.
            discussions.forEach((disc) => {
                if (disc.groupid === -1) {
                    disc.groupname = strAllParts;
                } else {
                    const group = groups[disc.groupid];
                    if (group) {
                        disc.groupname = group.name;
                    }
                }
            });

            return discussions;
        }).catch(() => {
            return discussions;
        });
    }

    /**
     * Get all course forums.
     *
     * @param  {number} courseId Course ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any[]>}  Promise resolved when the forums are retrieved.
     */
    getCourseForums(courseId: number, siteId?: string): Promise<any[]> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                courseids: [courseId]
            };
            const preSets = {
                cacheKey: this.getForumDataCacheKey(courseId)
            };

            return site.read('mod_forum_get_forums_by_courses', params, preSets);
        });
    }

    /**
     * Get a forum by course module ID.
     *
     * @param  {number} courseId Course ID.
     * @param  {number} cmId     Course module ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved when the forum is retrieved.
     */
    getForum(courseId: number, cmId: number, siteId?: string): Promise<any> {
        return this.getCourseForums(courseId, siteId).then((forums) => {
            const forum = forums.find((forum) => forum.cmid == cmId);
            if (forum) {
                return forum;
            }

            return Promise.reject(null);
        });
    }

    /**
     * Get a forum by forum ID.
     *
     * @param  {number} courseId Course ID.
     * @param  {number} forumId  Forum ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved when the forum is retrieved.
     */
    getForumById(courseId: number, forumId: number, siteId?: string): Promise<any> {
        return this.getCourseForums(courseId, siteId).then((forums) => {
            const forum = forums.find((forum) => forum.id == forumId);
            if (forum) {
                return forum;
            }

            return Promise.reject(null);
        });
    }

    /**
     * Get forum discussion posts.
     *
     * @param  {number} discussionId Discussion ID.
     * @param  {string} [siteId]     Site ID. If not defined, current site.
     * @return {Promise<any[]>}      Promise resolved with forum posts.
     */
    getDiscussionPosts(discussionId: number, siteId?: string): Promise<any> {
        const params = {
            discussionid: discussionId
        };
        const preSets = {
            cacheKey: this.getDiscussionPostsCacheKey(discussionId)
        };

        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.read('mod_forum_get_forum_discussion_posts', params, preSets).then((response) => {
                if (response) {
                    this.storeUserData(response.posts);

                    return response.posts;
                } else {
                    return Promise.reject(null);
                }
            });
        });
    }

    /**
     * Sort forum discussion posts by an specified field.
     *
     * @param {any[]}  posts     Discussion posts to be sorted in place.
     * @param {string} direction Direction of the sorting (ASC / DESC).
     */
    sortDiscussionPosts(posts: any[], direction: string): void {
        // @todo: Check children when sorting.
        posts.sort((a, b) => {
            a = parseInt(a.created, 10);
            b = parseInt(b.created, 10);
            if (direction == 'ASC') {
                return a - b;
            } else {
                return b - a;
            }
        });
    }

    /**
     * Get forum discussions.
     *
     * @param  {number}  forumId      Forum ID.
     * @param  {number}  [page=0]     Page.
     * @param  {boolean} [forceCache] True to always get the value from cache. false otherwise.
     * @param  {string}  [siteId]     Site ID. If not defined, current site.
     * @return {Promise<any>}         Promise resolved with an object with:
     *                                 - discussions: List of discussions.
     *                                 - canLoadMore: True if there may be more discussions to load.
     */
    getDiscussions(forumId: number, page: number = 0, forceCache?: boolean, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                forumid: forumId,
                sortby:  'timemodified',
                sortdirection:  'DESC',
                page: page,
                perpage: AddonModForumProvider.DISCUSSIONS_PER_PAGE
            };
            const preSets: any = {
                cacheKey: this.getDiscussionsListCacheKey(forumId)
            };
            if (forceCache) {
                preSets.omitExpires = true;
            }

            return site.read('mod_forum_get_forum_discussions_paginated', params, preSets).then((response) => {
                if (response) {
                    this.storeUserData(response.discussions);

                    return Promise.resolve({
                        discussions: response.discussions,
                        canLoadMore: response.discussions.length >= AddonModForumProvider.DISCUSSIONS_PER_PAGE,
                    });
                } else {
                    return Promise.reject(null);
                }
            });
        });
    }

    /**
     * Get forum discussions in several pages.
     * If a page fails, the discussions until that page will be returned along with a flag indicating an error occurred.
     *
     * @param  {number}  forumId     Forum ID.
     * @param  {boolean} forceCache  True to always get the value from cache, false otherwise.
     * @param  {number}  [numPages]  Number of pages to get. If not defined, all pages.
     * @param  {number}  [startPage] Page to start. If not defined, first page.
     * @param  {string}  [siteId]    Site ID. If not defined, current site.
     * @return {Promise<any>}        Promise resolved with an object with:
     *                                - discussions: List of discussions.
     *                                - error: True if an error occurred, false otherwise.
     */
    getDiscussionsInPages(forumId: number, forceCache?: boolean, numPages?: number, startPage?: number, siteId?: string)
            : Promise<any> {
        if (typeof numPages == 'undefined') {
            numPages = -1;
        }
        startPage = startPage || 0;

        const result = {
            discussions: [],
            error: false
        };

        if (!numPages) {
            return Promise.resolve(result);
        }

        const getPage = (page: number): Promise<any> => {
            // Get page discussions.
            return this.getDiscussions(forumId, page, forceCache, siteId).then((response) => {
                result.discussions = result.discussions.concat(response.discussions);
                numPages--;

                if (response.canLoadMore && numPages !== 0) {
                    return getPage(page + 1); // Get next page.
                } else {
                    return result;
                }
            }).catch(() => {
                // Error getting a page.
                result.error = true;

                return result;
            });
        };

        return getPage(startPage);
    }

    /**
     * Invalidates can add discussion WS calls.
     *
     * @param  {number} forumId  Forum ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved when the data is invalidated.
     */
    invalidateCanAddDiscussion(forumId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKeyStartingWith(this.getCommonCanAddDiscussionCacheKey(forumId));
        });
    }

    /**
     * Invalidate the prefetched content except files.
     * To invalidate files, use AddonModForum#invalidateFiles.
     *
     * @param  {number} moduleId The module ID.
     * @param  {number} courseId Course ID.
     * @return {Promise<any>}    Promise resolved when data is invalidated.
     */
    invalidateContent(moduleId: number, courseId: number): Promise<any> {
        // Get the forum first, we need the forum ID.
        return this.getForum(courseId, moduleId).then((forum) => {
            // We need to get the list of discussions to be able to invalidate their posts.
            return this.getDiscussionsInPages(forum.id, true).then((response) => {
                // Now invalidate the WS calls.
                const promises = [];

                promises.push(this.invalidateForumData(courseId));
                promises.push(this.invalidateDiscussionsList(forum.id));
                promises.push(this.invalidateCanAddDiscussion(forum.id));

                response.discussions.forEach((discussion) => {
                    promises.push(this.invalidateDiscussionPosts(discussion.discussion));
                });

                return this.utils.allPromises(promises);
            });
        });
    }

    /**
     * Invalidates forum discussion posts.
     *
     * @param  {number} discussionId Discussion ID.
     * @param  {string} [siteId]     Site ID. If not defined, current site.
     * @return {Promise<any>}        Promise resolved when the data is invalidated.
     */
    invalidateDiscussionPosts(discussionId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getDiscussionPostsCacheKey(discussionId));
        });
    }

    /**
     * Invalidates discussion list.
     *
     * @param  {number} forumId  Forum ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved when the data is invalidated.
     */
    invalidateDiscussionsList(forumId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getDiscussionsListCacheKey(forumId));
        });
    }

    /**
     * Invalidate the prefetched files.
     *
     * @param  {number} moduleId The module ID.
     * @return {Promise<any>}   Promise resolved when the files are invalidated.
     */
    invalidateFiles(moduleId: number): Promise<any> {
        const siteId = this.sitesProvider.getCurrentSiteId();

        return this.filepoolProvider.invalidateFilesByComponent(siteId, AddonModForumProvider.COMPONENT, moduleId);
    }

    /**
     * Invalidates forum data.
     *
     * @param  {number} courseId Course ID.
     * @return {Promise<any>}    Promise resolved when the data is invalidated.
     */
    invalidateForumData(courseId: number): Promise<any> {
        return this.sitesProvider.getCurrentSite().invalidateWsCacheForKey(this.getForumDataCacheKey(courseId));
    }

    /**
     * Report a forum as being viewed.
     *
     * @param  {number} id    Module ID.
     * @return {Promise<any>} Promise resolved when the WS call is successful.
     */
    logView(id: number): Promise<any> {
        const params = {
            forumid: id
        };

        return this.sitesProvider.getCurrentSite().write('mod_forum_view_forum', params);
    }

    /**
     * Report a forum discussion as being viewed.
     *
     * @param  {number} id    Discussion ID.
     * @return {Promise<any>} Promise resolved when the WS call is successful.
     */
    logDiscussionView(id: number): Promise<any> {
        const params = {
            discussionid: id
        };

        return this.sitesProvider.getCurrentSite().write('mod_forum_view_forum_discussion', params);
    }

    /**
     * Reply to a certain post.
     *
     * @param  {number}  postId         ID of the post being replied.
     * @param  {number}  discussionId   ID of the discussion the user is replying to.
     * @param  {number}  forumId        ID of the forum the user is replying to.
     * @param  {string}  name           Forum name.
     * @param  {number}  courseId       Course ID the forum belongs to.
     * @param  {string}  subject        New post's subject.
     * @param  {string}  message        New post's message.
     * @param  {any}     [options]      Options (subscribe, attachments, ...).
     * @param  {string}  [siteId]       Site ID. If not defined, current site.
     * @param  {boolean} [allowOffline] True if it can be stored in offline, false otherwise.
     * @return {Promise<any>}           Promise resolved with post ID if sent online, resolved with false if stored offline.
     */
    replyPost(postId: number, discussionId: number, forumId: number, name: string, courseId: number, subject: string,
            message: string, options?: any, siteId?: string, allowOffline?: boolean): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        // Convenience function to store a message to be synchronized later.
        const storeOffline = (): Promise<boolean> => {
            if (!forumId) {
                // Not enough data to store in offline, reject.
                return Promise.reject(this.translate.instant('core.networkerrormsg'));
            }

            return this.forumOffline.replyPost(postId, discussionId, forumId, name, courseId, subject, message, options, siteId)
                    .then(() => {
                return false;
            });
        };

        if (!this.appProvider.isOnline() && allowOffline) {
            // App is offline, store the action.
            return storeOffline();
        }

        // If there's already a reply to be sent to the server, discard it first.
        return this.forumOffline.deleteReply(postId, siteId).then(() => {

            return this.replyPostOnline(postId, subject, message, options, siteId).then(() => {
                return true;
            }).catch((error) => {
                if (allowOffline && !this.utils.isWebServiceError(error)) {
                    // Couldn't connect to server, store in offline.
                    return storeOffline();
                } else {
                    // The WebService has thrown an error or offline not supported, reject.
                    return Promise.reject(error);
                }
            });
        });
    }

    /**
     * Reply to a certain post. It will fail if offline or cannot connect.
     *
     * @param  {number} postId    ID of the post being replied.
     * @param  {string} subject   New post's subject.
     * @param  {string} message   New post's message.
     * @param  {any}    [options] Options (subscribe, attachments, ...).
     * @param  {string} [siteId]  Site ID. If not defined, current site.
     * @return {Promise<number>}  Promise resolved with the created post id.
     */
    replyPostOnline(postId: number, subject: string, message: string, options?: any, siteId?: string): Promise<number> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            const params = {
                postid: postId,
                subject: subject,
                message: message,
                options: this.utils.objectToArrayOfObjects(options, 'name', 'value')
            };

            return site.write('mod_forum_add_discussion_post', params).then((response) => {
                if (!response || !response.postid) {
                    return Promise.reject(this.utils.createFakeWSError(''));
                } else {
                    return response.postid;
                }
            });
        });
    }

    /**
     * Store the users data from a discussions/posts list.
     *
     * @param {any[]} list Array of posts or discussions.
     */
    protected storeUserData(list: any[]): void {
        const users = {};

        list.forEach((entry) => {
            const userId = parseInt(entry.userid);
            if (!isNaN(userId) && !users[userId]) {
                users[userId] = {
                    id: userId,
                    fullname: entry.userfullname,
                    profileimageurl: entry.userpictureurl
                };
            }
            const userModified = parseInt(entry.usermodified);
            if (!isNaN(userModified) && !users[userModified]) {
                users[userModified] = {
                    id: userModified,
                    fullname: entry.usermodifiedfullname,
                    profileimageurl: entry.usermodifiedpictureurl
                };
            }
        });

        this.userProvider.storeUsers(this.utils.objectToArray(users));
    }
}
