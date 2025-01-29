import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const PROJECT_NAME = 'ArcMenu';
const PROJECT_ICON = '/icons/hicolor/16x16/actions/settings-arcmenu-logo.svg';
const PROJECT_GITLAB = 'https://gitlab.com/arcmenu/ArcMenu/-/releases/v';

const PAYPAY_LINK = `https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=53CWA7NR743WC&item_name=Support+${PROJECT_NAME}&source=url`;
const BUYMEACOFFEE_LINK = 'https://buymeacoffee.com/azaech';

const MONTH_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000; // 30 days

const NotifyType = {
    NEW_VERSION: 0,
    MONTHLY: 1,
};

/**
 * A MessageTray notification
 *
 * Shows users what's new and displays donation options.
 *
 * Shown once per new release and once every month
 * @param {*} extension
 */
export class SupportNotification {
    constructor(extension) {
        const {settings} = extension;
        const {metadata} = extension;

        this._version = metadata.version;
        this._iconPath = `${extension.path}/${PROJECT_ICON}`;
        this._whatsNewLink = `${PROJECT_GITLAB}${this._version}`;

        this._maybeShowNotification(settings);
    }

    _maybeShowNotification(settings) {
        const previousNotificationVersion = settings.get_int('support-notifier-project-version');
        const previousNotificationDate = settings.get_uint64('support-notifier-date-shown');

        const dateNow = Date.now();

        const isNewVersion = previousNotificationVersion < this._version;
        const hasMonthElapsed = this._hasMonthElapsed(previousNotificationDate, dateNow);

        // If a notification type is to be shown,
        // update the support-notifier settings
        if (isNewVersion || hasMonthElapsed) {
            settings.set_int('support-notifier-project-version', this._version);
            settings.set_uint64('support-notifier-date-shown', dateNow);
        }

        if (isNewVersion)
            this._showNotification(NotifyType.NEW_VERSION);
        else if (hasMonthElapsed)
            this._showNotification(NotifyType.MONTHLY);
    }

    _showNotification(notifyType) {
        /* TRANSLATORS: This will display as "ProjectName v21 Released!" as an example.*/
        const newVersionTitle = _('%s v%s Released!').format(PROJECT_NAME, this._version);
        const monthlyTitle = _('Message from %s').format(PROJECT_NAME);

        const title = notifyType === NotifyType.NEW_VERSION ? newVersionTitle : monthlyTitle;
        const body = _('Thank you for using %s! If you enjoy it and would like to help support its continued development, please consider making a donation. Your support, no matter the amount, makes a big difference.').format(PROJECT_NAME);
        const gicon = Gio.icon_new_for_string(this._iconPath);

        // Use MessageTray.SystemNotificationSource for GNOME versions < 46
        if (MessageTray.SystemNotificationSource) {
            const source = new MessageTray.SystemNotificationSource();
            Main.messageTray.add(source);

            const notification = new MessageTray.Notification(source, title, body, {
                gicon,
            });

            notification.setUrgency(MessageTray.Urgency.CRITICAL);
            notification.resident = true;
            this._addNotificationActions(notification, notifyType);

            source.showNotification(notification);
        } else {
            const source = MessageTray.getSystemSource();
            const notification = new MessageTray.Notification({
                source,
                title,
                body,
                gicon,
            });

            notification.urgency = MessageTray.Urgency.CRITICAL;
            notification.resident = true;
            this._addNotificationActions(notification, notifyType);

            source.addNotification(notification);
        }
    }

    _addNotificationActions(notification, notifyType) {
        if (notifyType === NotifyType.NEW_VERSION)
            notification.addAction(_("What's new?"), () => this._openUri(this._whatsNewLink));
        notification.addAction(_('Donate via PayPal'), () => this._openUri(PAYPAY_LINK));
        notification.addAction(_('Buy Me a Coffee'), () => this._openUri(BUYMEACOFFEE_LINK));
    }

    _hasMonthElapsed(startTimestamp, endTimestamp) {
        if (startTimestamp === 0)
            return true;

        const elapsedTime = endTimestamp - startTimestamp;
        return elapsedTime > MONTH_IN_MILLISECONDS;
    }

    _openUri(uri) {
        Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    }
}
