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
import { CoreSyncBaseProvider } from '@classes/base-sync';
import { CoreAppProvider } from '@providers/app';
import { AddonNotesOfflineProvider } from './notes-offline';
import { AddonNotesProvider } from './notes';
import { CoreCoursesProvider } from '@core/courses/providers/courses';
import { CoreEventsProvider } from '@providers/events';
import { CoreTextUtilsProvider } from '@providers/utils/text';
import { CoreUtilsProvider } from '@providers/utils/utils';
import { TranslateService } from '@ngx-translate/core';
import { CoreSyncProvider } from '@providers/sync';

/**
 * Service to sync notes.
 */
@Injectable()
export class AddonNotesSyncProvider extends CoreSyncBaseProvider {

    static AUTO_SYNCED = 'addon_notes_autom_synced';

    constructor(loggerProvider: CoreLoggerProvider, sitesProvider: CoreSitesProvider, appProvider: CoreAppProvider,
            syncProvider: CoreSyncProvider, textUtils: CoreTextUtilsProvider, translate: TranslateService,
            private notesOffline: AddonNotesOfflineProvider, private utils: CoreUtilsProvider,
            private eventsProvider: CoreEventsProvider,  private notesProvider: AddonNotesProvider,
            private coursesProvider: CoreCoursesProvider) {

        super('AddonNotesSync', loggerProvider, sitesProvider, appProvider, syncProvider, textUtils, translate);
    }

    /**
     * Try to synchronize all the notes in a certain site or in all sites.
     *
     * @param  {string} [siteId] Site ID to sync. If not defined, sync all sites.
     * @return {Promise<any>}    Promise resolved if sync is successful, rejected if sync fails.
     */
    syncAllNotes(siteId?: string): Promise<any> {
        return this.syncOnSites('all notes', this.syncAllNotesFunc.bind(this), [], siteId);
    }

    /**
     * Synchronize all the notes in a certain site
     *
     * @param  {string} siteId Site ID to sync.
     * @return {Promise<any>}  Promise resolved if sync is successful, rejected if sync fails.
     */
    private syncAllNotesFunc(siteId: string): Promise<any> {
        return this.notesOffline.getAllNotes(siteId).then((notes) => {
            // Get all the courses to be synced.
            const courseIds = [];
            notes.forEach((note) => {
                if (courseIds.indexOf(note.courseid) == -1) {
                    courseIds.push(note.courseid);
                }
            });

            // Sync all courses.
            const promises = courseIds.map((courseId) => {
                return this.syncNotesIfNeeded(courseId, siteId).then((warnings) => {
                    if (typeof warnings != 'undefined') {
                        // Sync successful, send event.
                        this.eventsProvider.trigger(AddonNotesSyncProvider.AUTO_SYNCED, {
                            courseId: courseId,
                            warnings: warnings
                        }, siteId);
                    }
                });
            });

            return Promise.all(promises);
        });
    }

    /**
     * Sync course notes only if a certain time has passed since the last time.
     *
     * @param  {number} courseId Course ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved when the notes are synced or if they don't need to be synced.
     */
    private syncNotesIfNeeded(courseId: number, siteId?: string): Promise<void> {
        return this.isSyncNeeded(courseId, siteId).then((needed) => {
            if (needed) {
                return this.syncNotes(courseId, siteId);
            }
        });
    }

    /**
     * Synchronize notes of a course.
     *
     * @param  {number} courseId Course ID.
     * @param  {string} [siteId] Site ID. If not defined, current site.
     * @return {Promise<any>}    Promise resolved if sync is successful, rejected otherwise.
     */
    syncNotes(courseId: number, siteId?: string): Promise<any> {
        siteId = siteId || this.sitesProvider.getCurrentSiteId();

        if (this.isSyncing(courseId, siteId)) {
            // There's already a sync ongoing for notes, return the promise.
            return this.getOngoingSync(courseId, siteId);
        }

        this.logger.debug('Try to sync notes for course ' + courseId);

        const warnings = [];

        // Get offline notes to be sent.
        const syncPromise = this.notesOffline.getNotesForCourse(courseId, siteId).then((notes) => {
            if (!notes.length) {
                // Nothing to sync.
                return;
            } else if (!this.appProvider.isOnline()) {
                // Cannot sync in offline.
                return Promise.reject(this.translate.instant('core.networkerrormsg'));
            }

            const errors = [];

            // Format the notes to be sent.
            const notesToSend = notes.map((note) => {
                return {
                    userid: note.userid,
                    publishstate: note.publishstate,
                    courseid: note.courseid,
                    text: note.content,
                    format: note.format
                };
            });

            // Send the notes.
            return this.notesProvider.addNotesOnline(notesToSend, siteId).then((response) => {
                // Search errors in the response.
                response.forEach((entry) => {
                    if (entry.noteid === -1 && errors.indexOf(entry.errormessage) == -1) {
                        errors.push(entry.errormessage);
                    }
                });

                // Fetch the notes from server to be sure they're up to date.
                return this.notesProvider.invalidateNotes(courseId, siteId).then(() => {
                    return this.notesProvider.getNotes(courseId, false, true, siteId);
                }).catch(() => {
                    // Ignore errors.
                });
            }).catch((error) => {
                if (this.utils.isWebServiceError(error)) {
                    // It's a WebService error, this means the user cannot send notes.
                    errors.push(error);
                } else {
                    // Not a WebService error, reject the synchronization to try again.
                    return Promise.reject(error);
                }
            }).then(() => {
                // Notes were sent, delete them from local DB.
                const promises = notes.map((note) => {
                    return this.notesOffline.deleteNote(note.userid, note.content, note.created, siteId);
                });

                return Promise.all(promises);
            }).then(() => {
                if (errors && errors.length) {
                    // At least an error occurred, get course name and add errors to warnings array.
                    return this.coursesProvider.getUserCourse(courseId, true, siteId).catch(() => {
                        // Ignore errors.
                        return {};
                    }).then((course) => {
                        errors.forEach((error) => {
                            warnings.push(this.translate.instant('addon.notes.warningnotenotsent', {
                                course: course.fullname ? course.fullname : courseId,
                                error: error
                            }));
                        });
                    });
                }
            });
        }).then(() => {
            // All done, return the warnings.
            return warnings;
        });

        return this.addOngoingSync(courseId, syncPromise, siteId);
    }
}
