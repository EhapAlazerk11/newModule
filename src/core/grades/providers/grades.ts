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
import { CoreLoggerProvider } from '@providers/logger';
import { CoreSitesProvider } from '@providers/sites';
import { CoreCoursesProvider } from '@core/courses/providers/courses';

/**
 * Service to provide grade functionalities.
 */
@Injectable()
export class CoreGradesProvider {

    static TYPE_NONE = 0; // Moodle's GRADE_TYPE_NONE.
    static TYPE_VALUE = 1; // Moodle's GRADE_TYPE_VALUE.
    static TYPE_SCALE = 2; // Moodle's GRADE_TYPE_SCALE.
    static TYPE_TEXT = 3; // Moodle's GRADE_TYPE_TEXT.

    protected ROOT_CACHE_KEY = 'mmGrades:';

    protected logger;

    constructor(logger: CoreLoggerProvider, private sitesProvider: CoreSitesProvider,
            private coursesProvider: CoreCoursesProvider) {
        this.logger = logger.getInstance('CoreGradesProvider');
    }

    /**
     * Get cache key for grade table data WS calls.
     *
     * @param {number} courseId ID of the course to get the grades from.
     * @param {number} userId   ID of the user to get the grades from.
     * @return {string}         Cache key.
     */
    protected getCourseGradesCacheKey(courseId: number, userId: number): string {
        return this.getCourseGradesPrefixCacheKey(courseId) + userId;
    }

    /**
     * Get cache key for grade items data WS calls.
     *
     * @param {number} courseId     ID of the course to get the grades from.
     * @param {number} userId       ID of the user to get the grades from.
     * @param {number} [groupId]    ID of the group to get the grades from. Default: 0.
     * @return {string}         Cache key.
     */
    protected getCourseGradesItemsCacheKey(courseId: number, userId: number, groupId: number): string {
        groupId = groupId || 0;

        return this.getCourseGradesPrefixCacheKey(courseId) + userId + ':' + groupId;
    }

    /**
     * Get prefix cache key for grade table data WS calls.
     *
     * @param {number} courseId ID of the course to get the grades from.
     * @return {string}         Cache key.
     */
    protected getCourseGradesPrefixCacheKey(courseId: number): string {
        return this.ROOT_CACHE_KEY + 'items:' + courseId + ':';
    }

    /**
     * Get cache key for courses grade WS calls.
     *
     * @return {string}   Cache key.
     */
    protected getCoursesGradesCacheKey(): string {
        return this.ROOT_CACHE_KEY + 'coursesgrades';
    }

    /**
     * Get the grade items for a certain module. Keep in mind that may have more than one item to include outcomes and scales.
     * Fallback function only used if 'gradereport_user_get_grade_items' WS is not avalaible Moodle < 3.2.
     *
     * @param  {number}  courseId             ID of the course to get the grades from.
     * @param  {number}  [userId]             ID of the user to get the grades from. If not defined use site's current user.
     * @param  {number}  [groupId]            ID of the group to get the grades from. Not used for old gradebook table.
     * @param  {string}  [siteId]             Site ID. If not defined, current site.
     * @param  {boolean} [ignoreCache=false]  True if it should ignore cached data (it will always fail in offline or server down).
     * @return {Promise<any>}                Promise to be resolved when the grades are retrieved.
     */
    getGradeItems(courseId: number, userId?: number, groupId?: number, siteId?: string, ignoreCache: boolean = false):
            Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        return this.sitesProvider.getSite(siteId).then((site) => {
            userId = userId || site.getUserId();

            return this.isGradeItemsAvalaible(siteId).then((enabled) => {
                if (enabled) {
                    return this.getCourseGradesItems(courseId, userId, groupId, siteId, ignoreCache).catch(() => {
                        // FallBack while solving MDL-57255.
                        return this.getCourseGradesTable(courseId, userId, siteId, ignoreCache);
                    });
                } else {
                    return this.getCourseGradesTable(courseId, userId, siteId, ignoreCache);
                }
            });
        });
    }

    /**
     * Get the grade items for a certain course.
     *
     * @param  {number}  courseId             ID of the course to get the grades from.
     * @param  {number}  [userId]             ID of the user to get the grades from.
     * @param  {number}  [groupId]            ID of the group to get the grades from. Default 0.
     * @param  {string}  [siteId]             Site ID. If not defined, current site.
     * @param  {boolean} [ignoreCache=false]  True if it should ignore cached data (it will always fail in offline or server down).
     * @return {Promise<any>}                      Promise to be resolved when the grades table is retrieved.
     */
    getCourseGradesItems(courseId: number, userId?: number, groupId?: number, siteId?: string,
            ignoreCache: boolean = false): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            userId = userId || site.getUserId();
            groupId = groupId || 0;

            this.logger.debug(`Get grades for course '${courseId}' and user '${userId}'`);

            const data = {
                    courseid : courseId,
                    userid   : userId,
                    groupid  : groupId
                },
                preSets = {
                    cacheKey: this.getCourseGradesItemsCacheKey(courseId, userId, groupId)
                };

            if (ignoreCache) {
                preSets['getFromCache'] = 0;
                preSets['emergencyCache'] = 0;
            }

            return site.read('gradereport_user_get_grade_items', data, preSets).then((grades) => {
                if (grades && grades.usergrades && grades.usergrades[0]) {
                    return grades.usergrades[0].gradeitems;
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Get the grades for a certain course.
     *
     * @param  {number}  courseId             ID of the course to get the grades from.
     * @param  {number}  [userId]             ID of the user to get the grades from.
     * @param  {string}  [siteId]             Site ID. If not defined, current site.
     * @param  {boolean} [ignoreCache=false]  True if it should ignore cached data (it will always fail in offline or server down).
     * @return {Promise<any>}                      Promise to be resolved when the grades table is retrieved.
     */
    getCourseGradesTable(courseId: number, userId?: number, siteId?: string, ignoreCache: boolean = false): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            userId = userId || site.getUserId();

            this.logger.debug(`Get grades for course '${courseId}' and user '${userId}'`);

            const data = {
                    courseid : courseId,
                    userid   : userId
                },
                preSets = {
                    cacheKey: this.getCourseGradesCacheKey(courseId, userId)
                };

            if (ignoreCache) {
                preSets['getFromCache'] = 0;
                preSets['emergencyCache'] = 0;
            }

            return site.read('gradereport_user_get_grades_table', data, preSets).then((table) => {
                if (table && table.tables && table.tables[0]) {
                    return table.tables[0];
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Get the grades for a certain course.
     *
     * @param {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}   Promise to be resolved when the grades are retrieved.
     */
    getCoursesGrades(siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            this.logger.debug('Get course grades');

            const preSets = {
                cacheKey: this.getCoursesGradesCacheKey()
            };

            return site.read('gradereport_overview_get_course_grades', undefined, preSets).then((data) => {
                if (data && data.grades) {
                    return data.grades;
                }

                return Promise.reject(null);
            });
        });
    }

    /**
     * Invalidates courses grade table and items WS calls for all users.
     *
     * @param {number} courseId ID of the course to get the grades from.
     * @param {string} [siteId] Site ID (empty for current site).
     * @return {Promise<any>} Promise resolved when the data is invalidated.
     */
    invalidateAllCourseGradesData(courseId: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKeyStartingWith(this.getCourseGradesPrefixCacheKey(courseId));
        });
    }

    /**
     * Invalidates grade table data WS calls.
     *
     * @param {number} courseId Course ID.
     * @param {number} [userId]   User ID.
     * @param {string} [siteId]   Site id (empty for current site).
     * @return {Promise<any>}        Promise resolved when the data is invalidated.
     */
    invalidateCourseGradesData(courseId: number, userId?: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            userId = userId || site.getUserId();

            return site.invalidateWsCacheForKey(this.getCourseGradesCacheKey(courseId, userId));
        });
    }

    /**
     * Invalidates courses grade data WS calls.
     *
     * @param {string} [siteId]   Site id (empty for current site).
     * @return {Promise<any>}     Promise resolved when the data is invalidated.
     */
    invalidateCoursesGradesData(siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getCoursesGradesCacheKey());
        });
    }

    /**
     * Invalidates courses grade items data WS calls.
     *
     * @param {number} courseId     ID of the course to get the grades from.
     * @param {number} userId       ID of the user to get the grades from.
     * @param {number} [groupId]    ID of the group to get the grades from. Default: 0.
     * @param {string} [siteId]     Site id (empty for current site).
     * @return {Promise<any>}     Promise resolved when the data is invalidated.
     */
    invalidateCourseGradesItemsData(courseId: number, userId: number, groupId?: number, siteId?: string): Promise<any> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.invalidateWsCacheForKey(this.getCourseGradesItemsCacheKey(courseId, userId, groupId));
        });
    }

    /**
     * Returns whether or not the plugin is enabled for a certain site.
     *
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<boolean>}  Resolve with true if plugin is enabled, false otherwise.
     * @since  Moodle 3.2
     */
    isCourseGradesEnabled(siteId?: string): Promise<boolean> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            if (!site.wsAvailable('gradereport_overview_get_course_grades')) {
                return false;
            }
            // Now check that the configurable mygradesurl is pointing to the gradereport_overview plugin.
            const url = site.getStoredConfig('mygradesurl') || '';

            return url.indexOf('/grade/report/overview/') !== -1;
        });
    }

    /**
     * Returns whether or not the grade addon is enabled for a certain course.
     *
     * @param {number} courseId  Course ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promisee<boolean>} Promise resolved with true if plugin is enabled, rejected or resolved with false otherwise.
     */
    isPluginEnabledForCourse(courseId: number, siteId?: string): Promise<boolean> {
        if (!courseId) {
            return Promise.reject(null);
        }

        return this.coursesProvider.getUserCourse(courseId, true, siteId).then((course) => {
            return !(course && typeof course.showgrades != 'undefined' && course.showgrades == 0);
        });
    }

    /**
     * Returns whether or not WS Grade Items is avalaible.
     *
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<boolean>}         True if ws is avalaible, false otherwise.
     * @since  Moodle 3.2
     */
    isGradeItemsAvalaible(siteId?: string): Promise<boolean> {
        return this.sitesProvider.getSite(siteId).then((site) => {
            return site.wsAvailable('gradereport_user_get_grade_items');
        });
    }

    /**
     * Log Course grades view in Moodle.
     *
     * @param  {number}  courseId Course ID.
     * @param  {number}  userId   User ID.
     * @return {Promise<any>}     Promise resolved when done.
     */
    logCourseGradesView(courseId: number, userId: number): Promise<any> {
        userId = userId || this.sitesProvider.getCurrentSiteUserId();

        return this.sitesProvider.getCurrentSite().write('gradereport_user_view_grade_report', {
            courseid: courseId,
            userid: userId
        });
    }

    /**
     * Log Courses grades view in Moodle.
     *
     * @param  {number}  [courseId] Course ID. If not defined, site Home ID.
     * @return {Promise<any>}     Promise resolved when done.
     */
    logCoursesGradesView(courseId?: number): Promise<any> {
        if (!courseId) {
            courseId = this.sitesProvider.getCurrentSiteHomeId();
        }

        return this.sitesProvider.getCurrentSite().write('gradereport_overview_view_grade_report', {
            courseid: courseId
        });
    }
}
