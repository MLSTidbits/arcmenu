import Gio from 'gi://Gio';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {SettingsPage} from './constants.js';

const PROJECT_NAME = 'ArcMenu';
const PROJECT_ICON = '/icons/hicolor/16x16/actions/settings-arcmenu-logo.svg';
const PROJECT_GITLAB = 'https://gitlab.com/arcmenu/ArcMenu/-/releases/v';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const [ShellVersion] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));

const NotifyType = {
    NEW_VERSION: 0,
    RECURRING: 1,
};

const RecurringInterval = {
    OFF: 0,
    DAYS_30: 1,
    DAYS_60: 2,
    DAYS_90: 3,
};

/**
 * A MessageTray notification
 *
 * Shows users what's new and displays donation options.
 *
 * Shown once per new release and/or at a user defined interval
 * @param {*} extension
 */
export class SupportNotification {
    constructor(extension) {
        const {metadata} = extension;
        this._extension = extension;
        this._settings = extension.settings;

        this._version = metadata.version;
        this._iconPath = `${extension.path}/${PROJECT_ICON}`;
        this._whatsNewLink = `${PROJECT_GITLAB}${this._version}`;

        this._maybeShowNotification();
    }

    destroy() {
        this._settings = null;
        this._extension = null;
        this._version = null;
        this._iconPath = null;
        this._whatsNewLink = null;
    }

    _maybeShowNotification() {
        const previousNotificationVersion = this._settings.get_int('support-notifier-project-version');
        const previousNotificationDate = this._settings.get_uint64('support-notifier-date-shown');
        const recurringInterval = this._settings.get_enum('support-notifier-recurring-interval');

        const dateNow = Date.now();

        const isNewVersion = previousNotificationVersion < this._version;
        const hasTimeElapsed = this._hasTimeElapsed(previousNotificationDate, dateNow, recurringInterval);

        if (isNewVersion || hasTimeElapsed) {
            this._settings.set_int('support-notifier-project-version', this._version);
            this._settings.set_uint64('support-notifier-date-shown', dateNow);
        }

        if (isNewVersion)
            this._showNotification(NotifyType.NEW_VERSION);
        else if (hasTimeElapsed)
            this._showNotification(NotifyType.RECURRING);
    }

    _showNotification(notifyType) {
        /* TRANSLATORS: This will display as "ProjectName v21 Released!" as an example.*/
        const newVersionTitle = _('%s v%s Released!').format(PROJECT_NAME, this._version);
        const monthlyTitle = _('Help Support %s').format(PROJECT_NAME);

        const title = notifyType === NotifyType.NEW_VERSION ? newVersionTitle : monthlyTitle;
        const body = _('Thank you for using %s! If you enjoy it and would like to help support its continued development, please consider making a donation. Your support, no matter the amount, makes a big difference.').format(PROJECT_NAME);
        const gicon = Gio.icon_new_for_string(this._iconPath);

        const source = this._getSource();
        source.title = PROJECT_NAME;
        source.iconName = 'application-x-addon-symbolic';

        const notification = this._getNotification(source, title, body, gicon);
        notification.urgency = MessageTray.Urgency.CRITICAL;
        notification.resident = true;
        this._addNotificationActions(notification, notifyType);

        if (ShellVersion >= 46) {
            source.addNotification(notification);
        } else {
            Main.messageTray.add(source);
            source.showNotification(notification);
        }
    }

    _getNotification(source, title, body, gicon) {
        if (ShellVersion >= 46)
            return new MessageTray.Notification({source, title, body, gicon});
        else
            return new MessageTray.Notification(source, title, body, {gicon});
    }

    _getSource() {
        return ShellVersion >= 46 ? MessageTray.getSystemSource() : new MessageTray.SystemNotificationSource();
    }

    _addNotificationActions(notification, notifyType) {
        if (notifyType === NotifyType.NEW_VERSION) {
            notification.addAction(_("What's new?"), () => this._openUri(this._whatsNewLink));
        } else if (notifyType === NotifyType.RECURRING) {
            notification.addAction(_("Don't Show Again"), () => {
                this._setDontShowAgain();
                notification.destroy();
            });
        }
        notification.addAction(_('Make a Donation'), () => this._openSettingsDonatePage());
    }

    _hasTimeElapsed(startTimestamp, endTimestamp, recurringInterval) {
        if (recurringInterval === RecurringInterval.OFF)
            return false;

        if (startTimestamp === 0)
            return true;

        let days;
        if (recurringInterval === RecurringInterval.DAYS_30)
            days = 30;
        else if (recurringInterval === RecurringInterval.DAYS_60)
            days = 60;
        else if (recurringInterval === RecurringInterval.DAYS_90)
            days = 90;
        else
            return false;

        const elapsedTime = endTimestamp - startTimestamp;
        return elapsedTime > (days * MILLISECONDS_PER_DAY);
    }

    _openSettingsDonatePage() {
        this._settings.set_int('prefs-visible-page', SettingsPage.DONATE);
        this._extension.openPreferences();
    }

    _setDontShowAgain() {
        this._settings.set_enum('support-notifier-recurring-interval', RecurringInterval.OFF);
    }

    _openUri(uri) {
        Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    }
}
