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

import { Component } from '@angular/core';
import { NavParams, ViewController } from 'ionic-angular';
import { AddonModBookTocChapter } from '../../providers/book';

/**
 * Component to display the TOC of a book.
 */
@Component({
    selector: 'addon-mod-book-toc-popover',
    templateUrl: 'addon-mod-assign-submission-toc-popover.html'
})
export class AddonModBookTocPopoverComponent {
    chapters: AddonModBookTocChapter[];

    constructor(navParams: NavParams, private viewCtrl: ViewController) {
        this.chapters = navParams.get('chapters') || [];
    }

    /**
     * Function called when a course is clicked.
     *
     * @param {string} id ID of the clicked chapter.
     */
    loadChapter(id: string): void {
        this.viewCtrl.dismiss(id);
    }
}
