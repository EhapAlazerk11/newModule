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
import { CoreCronHandler } from '@providers/cron';
import { AddonModFeedbackSyncProvider } from './sync';

/**
 * Synchronization cron handler.
 */
@Injectable()
export class AddonModFeedbackSyncCronHandler implements CoreCronHandler {
    name = 'AddonModFeedbackSyncCronHandler';

    constructor(private feedbackSync: AddonModFeedbackSyncProvider) {}

    /**
     * Execute the process.
     * Receives the ID of the site affected, undefined for all sites.
     *
     * @param  {string} [siteId] ID of the site affected, undefined for all sites.
     * @return {Promise<any>}         Promise resolved when done, rejected if failure.
     */
    execute(siteId?: string): Promise<any> {
        return this.feedbackSync.syncAllFeedbacks(siteId);
    }

    /**
     * Get the time between consecutive executions.
     *
     * @return {number} Time between consecutive executions (in ms).
     */
    getInterval(): number {
        return this.feedbackSync.syncInterval;
    }
}
