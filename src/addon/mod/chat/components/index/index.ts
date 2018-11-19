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

import { Component, Injector } from '@angular/core';
import { NavController } from 'ionic-angular';
import { CoreCourseModuleMainActivityComponent } from '@core/course/classes/main-activity-component';
import { CoreTimeUtilsProvider } from '@providers/utils/time';
import { AddonModChatProvider } from '../../providers/chat';
import * as moment from 'moment';

/**
 * Component that displays a chat.
 */
@Component({
    selector: 'addon-mod-chat-index',
    templateUrl: 'addon-mod-chat-index.html',
})
export class AddonModChatIndexComponent extends CoreCourseModuleMainActivityComponent {
    component = AddonModChatProvider.COMPONENT;
    moduleName = 'chat';

    chat: any;
    chatInfo: any;

    protected title: string;

    constructor(injector: Injector, private chatProvider: AddonModChatProvider, private timeUtils: CoreTimeUtilsProvider,
            private navCtrl: NavController) {
        super(injector);
    }

    /**
     * Component being initialized.
     */
    ngOnInit(): void {
        super.ngOnInit();

        this.loadContent().then(() => {
            this.chatProvider.logView(this.chat.id).then(() => {
                this.courseProvider.checkModuleCompletion(this.courseId, this.module.completionstatus);
            });
        });
    }

    /**
     * Download chat.
     *
     * @param  {boolean}      [refresh=false]    If it's refreshing content.
     * @param  {boolean}      [sync=false]       If the refresh is needs syncing.
     * @param  {boolean}      [showErrors=false] If show errors to the user of hide them.
     * @return {Promise<any>} Promise resolved when done.
     */
    protected fetchContent(refresh: boolean = false, sync: boolean = false, showErrors: boolean = false): Promise<any> {
        return this.chatProvider.getChat(this.courseId, this.module.id).then((chat) => {
            this.chat = chat;
            this.description = chat.intro || chat.description;

            const now = this.timeUtils.timestamp();
            const span = chat.chattime - now;

            if (chat.chattime && chat.schedule > 0 && span > 0) {
                this.chatInfo = {
                    date: moment(chat.chattime * 1000).format('LLL'),
                    fromnow: this.timeUtils.formatTime(span)
                };
            } else {
                this.chatInfo = false;
            }

            this.dataRetrieved.emit(chat);

            // All data obtained, now fill the context menu.
            this.fillContextMenu(refresh);
        });
    }

    /**
     * Enter the chat.
     */
    enterChat(): void {
        const title = this.chat.name || this.moduleName;
        this.navCtrl.push('AddonModChatChatPage', {chatId: this.chat.id, courseId: this.courseId, title: title });
    }
}
