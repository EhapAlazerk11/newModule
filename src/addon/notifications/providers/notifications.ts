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
import { CoreAppProvider } from '@providers/app';
import { CoreLoggerProvider } from '@providers/logger';
import { CoreSitesProvider } from '@providers/sites';
import { CoreTimeUtilsProvider } from '@providers/utils/time';
import { CoreUserProvider } from '@core/user/providers/user';
import { CoreEmulatorHelperProvider } from '@core/emulator/providers/helper';

/**
 * Service to handle notifications.
 */
@Injectable()
export class AddonNotificationsProvider {

    static READ_CHANGED_EVENT = 'addon_notifications_read_changed_event';
    static READ_CRON_EVENT = 'addon_notifications_read_cron_event';
    static PUSH_SIMULATION_COMPONENT = 'AddonNotificationsPushSimulation';
    static LIST_LIMIT = 20;

    protected ROOT_CACHE_KEY = 'mmaNotifications:';
    protected logger;

    constructor(logger: CoreLoggerProvider, private appProvider: CoreAppProvider, private sitesProvider: CoreSitesProvider,
            private timeUtils: CoreTimeUtilsProvider, private userProvider: CoreUserProvider,
            private emulatorHelper: CoreEmulatorHelperProvider) {
        this.logger = logger.getInstance('AddonNotificationsProvider');
    }

    /**
     * Function to format notification data.
     *
     * @param {any[]} notifications List of notifications.
     */
    protected formatNotificationsData(notifications: any[]): void {
        notifications.forEach((notification) => {
            // Set message to show.
            if (notification.contexturl && notification.contexturl.indexOf('/mod/forum/')) {
                notification.mobiletext = notification.smallmessage;
            } else {
                notification.mobiletext = notification.fullmessage;
            }
            // Try to set courseid the notification belongs to.
            const cid = notification.fullmessagehtml.match(/course\/view\.php\?id=([^"]*)/);
            if (cid && cid[1]) {
                notification.courseid = cid[1];
            }
            if (notification.useridfrom > 0) {
                // Try to get the profile picture of the user.
                this.userProvider.getProfile(notification.useridfrom, notification.courseid, true).then((user) => {
                    notification.profileimageurlfrom = user.profileimageurl;
                }).catch(() => {
                    // Error getting user. This can happen if device is offline or the user is deleted.
                });
            }
        });
    }

    /**
     * Get the cache key for the get notification preferences call.
     *
     * @return {string} Cache key.
     */
    protected getNotificationPreferencesCacheKey(): string {
        return this.ROOT_CACHE_KEY + 'notificationPreferences';
    }

    /**
     * Get notification preferences.
     *
     * @param {string} [siteId] Site ID. If not defined, use current site.
     * @return {Promise<any>} Promise resolved with the notification preferences.
     */
    getNotificationPreferences(siteId?: string): Promise<any> {
        this.logger.debug('Get notification preferences');

        return this.sitesProvider.getSite(siteId).then((site) => {
            const preSets = {
                cacheKey: this.getNotificationPreferencesCacheKey()
            };

            return site.read('core_message_get_user_notification_preferences', {}, preSets).then((data) => {
                return data.preferences;
            });
        });
    }

    /**
     * Get cache key for notification list WS calls.
     *
     * @return {string} Cache key.
     */
    protected getNotificationsCacheKey(): string {
        return this.ROOT_CACHE_KEY + 'list';
    }

    /**
     * Get notifications from site.
     *
     * @param {boolean} read True if should get read notifications, false otherwise.
     * @param {number} limitFrom Position of the first notification to get.
     * @param {number} limitNumber Number of notifications to get or 0 to use the default limit.
     * @param {boolean} [toDisplay=true] True if notifications will be displayed to the user, either in view or in a notification.
     * @param {boolean} [forceCache] True if it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] True if it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, use current site.
     * @return {Promise<any[]>} Promise resolved with notifications.
     */
    getNotifications(read: boolean, limitFrom: number, limitNumber: number = 0, toDisplay: boolean = true,
            forceCache?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        limitNumber = limitNumber || AddonNotificationsProvider.LIST_LIMIT;
        this.logger.debug('Get ' + (read ? 'read' : 'unread') + ' notifications from ' + limitFrom + '. Limit: ' + limitNumber);

        return this.sitesProvider.getSite(siteId).then((site) => {
            const data = {
                useridto: site.getUserId(),
                useridfrom: 0,
                type: 'notifications',
                read: read ? 1 : 0,
                newestfirst: 1,
                limitfrom: limitFrom,
                limitnum: limitNumber
            };
            const preSets: object = {
                cacheKey: this.getNotificationsCacheKey(),
                omitExpires: forceCache,
                getFromCache: forceCache || !ignoreCache,
                emergencyCache: forceCache || !ignoreCache,
            };

            // Get unread notifications.
            return site.read('core_message_get_messages', data, preSets).then((response) => {
                if (response.messages) {
                    const notifications = response.messages;
                    this.formatNotificationsData(notifications);
                    if (this.appProvider.isDesktop() && toDisplay && !read && limitFrom === 0) {
                        // Store the last received notification. Don't block the user for this.
                        this.emulatorHelper.storeLastReceivedNotification(
                            AddonNotificationsProvider.PUSH_SIMULATION_COMPONENT, notifications[0], siteId);
                    }

                    return notifications;
                } else {
                    return Promise.reject(null);
                }
            });
        });
    }

    /**
     * Get read notifications from site.
     *
     * @param {number} limitFrom Position of the first notification to get.
     * @param {number} limitNumber Number of notifications to get.
     * @param {boolean} [toDisplay=true] True if notifications will be displayed to the user, either in view or in a notification.
     * @param {boolean} [forceCache] True if it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] True if it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, use current site.
     * @return {Promise<any[]>} Promise resolved with notifications.
     */
    getReadNotifications(limitFrom: number, limitNumber: number, toDisplay: boolean = true,
            forceCache?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        return this.getNotifications(true, limitFrom, limitNumber, toDisplay, forceCache, ignoreCache, siteId);
    }

    /**
     * Get unread notifications from site.
     *
     * @param {number} limitFrom Position of the first notification to get.
     * @param {number} limitNumber Number of notifications to get.
     * @param {boolean} [toDisplay=true] True if notifications will be displayed to the user, either in view or in a notification.
     * @param {boolean} [forceCache] True if it should return cached data. Has priority over ignoreCache.
     * @param {boolean} [ignoreCache] True if it should ignore cached data (it will always fail in offline or server down).
     * @param {string} [siteId] Site ID. If not defined, use current site.
     * @return {Promise<any[]>} Promise resolved with notifications.
     */
    getUnreadNotifications(limitFrom: number, limitNumber: number, toDisplay: boolean = true,
            forceCache?: boolean, ignoreCache?: boolean, siteId?: string): Promise<any[]> {
        return this.getNotifications(false, limitFrom, limitNumber, toDisplay, forceCache, ignoreCache, siteId);
    }

    /**
     * Get unread notifications count. Do not cache calls.
     *
     * @param {number} [userId] The user id who received the notification. If not defined, use current user.
     * @param {string} [siteId] Site ID. If not defined, use current site.
     * @return {Promise<number>} Promise resolved with the message notifications count.
     */
    getUnreadNotificationsCount(userId?: number, siteId?: string): Promise<number> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            // @since 3.2
            if (site.wsAvailable('message_popup_get_unread_popup_notification_count')) {
                userId = userId || site.getUserId();
                const params = {
                    useridto: userId
                };
                const preSets = {
                    getFromCache: false,
                    emergencyCache: false,
                    saveToCache: false,
                    typeExpected: 'number'
                };

                return site.read('message_popup_get_unread_popup_notification_count', params, preSets).catch(() => {
                    // Return no messages if the call fails.
                    return 0;
                });
            }

            // Fallback call.
            const limit = AddonNotificationsProvider.LIST_LIMIT + 1;

            return this.getUnreadNotifications(0, limit, false, false, false, siteId).then((unread) => {
                // Add + sign if there are more than the limit reachable.
                return (unread.length > AddonNotificationsProvider.LIST_LIMIT) ?
                    AddonNotificationsProvider.LIST_LIMIT + '+' : unread.length;
            }).catch(() => {
                // Return no messages if the call fails.
                return 0;
            });
        });
    }

    /**
     * Mark all message notification as read.
     *
     * @returns {Promise<any>} Resolved when done.
     * @since 3.2
     */
    markAllNotificationsAsRead(): Promise<any> {
        const params = {
            useridto: this.sitesProvider.getCurrentSiteUserId()
        };

        return this.sitesProvider.getCurrentSite().write('core_message_mark_all_notifications_as_read', params);
    }

    /**
     * Mark message notification as read.
     *
     * @param {number} notificationId ID of notification to mark as read
     * @returns {Promise<any>} Resolved when done.
     */
    markNotificationRead(notificationId: number): Promise<any> {
        const params = {
            messageid: notificationId,
            timeread: this.timeUtils.timestamp()
        };

        return this.sitesProvider.getCurrentSite().write('core_message_mark_message_read', params);
    }

    /**
     * Invalidate get notification preferences.
     *
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when data is invalidated.
     */
    invalidateNotificationPreferences(siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getNotificationPreferencesCacheKey());
        });
    }

    /**
     * Invalidates notifications list WS calls.
     *
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>} Promise resolved when the list is invalidated.
     */
    invalidateNotificationsList(siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getNotificationsCacheKey());
        });
    }

    /**
     * Returns whether or not we can mark all notifications as read.
     *
     * @return {boolean} True if enabled, false otherwise.
     * @since 3.2
     */
    isMarkAllNotificationsAsReadEnabled(): boolean {
        return this.sitesProvider.wsAvailableInCurrentSite('core_message_mark_all_notifications_as_read');
    }

    /**
     * Returns whether or not we can count unread notifications precisely.
     *
     * @return {boolean} True if enabled, false otherwise.
     * @since 3.2
     */
    isPreciseNotificationCountEnabled(): boolean {
        return this.sitesProvider.wsAvailableInCurrentSite('message_popup_get_unread_popup_notification_count');
    }

    /**
     * Returns whether or not the notification preferences are enabled for the current site.
     *
     * @return {boolean} True if enabled, false otherwise.
     * @since 3.2
     */
    isNotificationPreferencesEnabled(): boolean {
        return this.sitesProvider.wsAvailableInCurrentSite('core_message_get_user_notification_preferences');
    }
}
