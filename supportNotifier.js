import Gio from 'gi://Gio';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {SettingsPage} from './constants.js';

const PROJECT_NAME = 'ArcMenu';
const PROJECT_ICON = '/icons/hicolor/16x16/actions/settings-arcmenu-logo.svg';
const PROJECT_GITLAB = 'https://gitlab.com/arcmenu/ArcMenu/-/releases/v';

const [ShellVersion] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));

/**
 * A MessageTray notification
 *
 * Shows users what's new and displays donation options.
 *
 * Shown once per new release/version
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
        const shouldShowNotification = this._settings.get_boolean('support-notifier-enabled');
        if (!shouldShowNotification)
            return;

        const previousNotificationVersion = this._settings.get_int('support-notifier-project-version');
        const shouldNotifyNewVersion = previousNotificationVersion < this._version;

        if (shouldNotifyNewVersion) {
            this._settings.set_int('support-notifier-project-version', this._version);
            this._showNotification();
        }
    }

    _showNotification() {
        /* TRANSLATORS: This will display as "ProjectName v21 Released!" as an example.*/
        const title = _('%s v%s Released!').format(PROJECT_NAME, this._version);
        const body = _('Thank you for using %s! If you enjoy it and would like to help support its continued development, please consider making a donation.').format(PROJECT_NAME);
        const gicon = Gio.icon_new_for_string(this._iconPath);

        const source = this._getSource();
        source.title = PROJECT_NAME;
        source.iconName = 'application-x-addon-symbolic';

        const notification = this._getNotification(source, title, body, gicon);
        notification.urgency = MessageTray.Urgency.CRITICAL;
        notification.resident = true;
        this._addNotificationActions(notification);

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

    _addNotificationActions(notification) {
        notification.addAction(_('Donate'), () => this._openSettingsDonatePage());
        notification.addAction(_("What's new?"), () => this._openUri(this._whatsNewLink));
        notification.addAction(_('Dismiss'), () => notification.destroy());
    }

    _openSettingsDonatePage() {
        this._settings.set_int('prefs-visible-page', SettingsPage.DONATE);
        this._extension.openPreferences();
    }

    _openUri(uri) {
        Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    }
}
