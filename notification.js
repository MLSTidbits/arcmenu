import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const PROJECT_NAME = 'ArcMenu';
const PROJECT_ICON = '/icons/hicolor/16x16/actions/settings-arcmenu-logo.svg';
const PROJECT_GITLAB = 'https://gitlab.com/arcmenu/ArcMenu/-/releases/v';

const NEW_RELEASE_SETTING = 'show-update-notification-v64';
const MONTHLY_SETTING = 'previous-notification-date';

const PAYPAY_LINK = `https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=53CWA7NR743WC&item_name=Support+${PROJECT_NAME}&source=url`;
const BUYMEACOFFEE_LINK = 'https://buymeacoffee.com/azaech';

function openUri(uri) {
    Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
}

const NotifyType = {
    MONTHLY: 1,
    NEW_RELEASE: 2,
};

/**
 * A MessageTray notification that alerts the user of a new release or a donation plea.
 *
 * Shows users what's new and/or displays donation options.
 *
 * Shown only once per new release or once every month
 * @param {*} extension
 */

export const Notification = class Notification {
    constructor(extension) {
        const {settings} = extension;
        const {metadata} = extension;

        this._version = metadata['version-name'] ? metadata['version-name'] : metadata.version.toString();
        this._iconPath = `${extension.path}/${PROJECT_ICON}`;
        this._whatsNewLink = `${PROJECT_GITLAB}${this._version}`;

        this._maybeShowNotifcation(settings);
    }

    _maybeShowNotifcation(settings) {
        // Change this setting version number on every new release
        const showUpdateNotification = settings.get_boolean(NEW_RELEASE_SETTING);

        const previousNotificationDate = settings.get_uint64(MONTHLY_SETTING);
        const dateNow = Date.now();
        const hasMonthElapsed = this._hasMonthElapsed(previousNotificationDate, dateNow);

        // If either notification type is to be shown,
        // Set the NEW_REALSE notification to false,
        // And the MONTHLY notification date to now.
        if (hasMonthElapsed || showUpdateNotification) {
            settings.set_boolean(NEW_RELEASE_SETTING, false);
            settings.set_uint64(MONTHLY_SETTING, dateNow);
        }

        if (showUpdateNotification)
            this._showNotification(NotifyType.NEW_RELEASE);
        else if (hasMonthElapsed)
            this._showNotification(NotifyType.MONTHLY);
    }

    _showNotification(notifyType) {
        this._notifyType = notifyType;

        const monthlyTitle = _('Message from %s').format(PROJECT_NAME);
        /* TRANSLATORS: This will display as "ProjectName v21 Released!" as an example.*/
        const newReleaseTitle = _('%s v%s Released!').format(PROJECT_NAME, this._version);
        const title = this._notifyType === NotifyType.MONTHLY ? monthlyTitle : newReleaseTitle;

        const body = _('Thank you for using %s! If you enjoy it and would like to help support its continued development, please consider making a donation. Your support, no matter the amount, makes a big difference.').format(PROJECT_NAME);

        // Use MessageTray.SystemNotificationSource for GNOME versions < 46
        if (MessageTray.SystemNotificationSource) {
            const source = new MessageTray.SystemNotificationSource();
            Main.messageTray.add(source);

            const notification = new MessageTray.Notification(source, title, body, {
                gicon: Gio.icon_new_for_string(this._iconPath),
            });

            notification.setUrgency(MessageTray.Urgency.CRITICAL);
            notification.resident = true;
            this._addNotificationActions(notification);

            source.showNotification(notification);
        } else {
            const source = MessageTray.getSystemSource();
            const notification = new MessageTray.Notification({
                source,
                title,
                body,
                gicon: Gio.icon_new_for_string(this._iconPath),
            });

            notification.urgency = MessageTray.Urgency.CRITICAL;
            notification.resident = true;
            this._addNotificationActions(notification);

            source.addNotification(notification);
        }
    }

    _addNotificationActions(notification) {
        if (this._notifyType === NotifyType.NEW_RELEASE)
            notification.addAction(_("What's new?"), () => openUri(this._whatsNewLink));
        notification.addAction(_('Donate via PayPal'), () => openUri(PAYPAY_LINK));
        notification.addAction(_('Buy Me a Coffee'), () => openUri(BUYMEACOFFEE_LINK));
    }

    _hasMonthElapsed(startTimestamp, endTimestamp) {
        if (startTimestamp === 0)
            return true;

        const startDate = new Date(startTimestamp);
        const endDate = new Date(endTimestamp);

        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth();
        const startDay = startDate.getDate();

        const endYear = endDate.getFullYear();
        const endMonth = endDate.getMonth();
        const endDay = endDate.getDate();

        // Calculate the difference in months
        const monthDifference = (endYear - startYear) * 12 + (endMonth - startMonth);

        // Check if at least one full month has passed
        if (monthDifference > 1) {
            return true;
        } else if (monthDifference === 1) {
            // Check if the day of the month in the end date is greater than or equal to the start date
            return endDay >= startDay;
        }

        return false;
    }
};
