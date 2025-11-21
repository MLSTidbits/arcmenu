import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Constants from './constants.js';

import {AboutPage} from './settings/aboutPage.js';
import {DonatePage} from './settings/donatePage.js';
import {GeneralPage} from './settings/generalPage.js';
import {MenuButtonPage} from './settings/menuButtonPage.js';
import {MenuPage} from './settings/menuPage.js';

import {IconCategory, IconGroup} from './prefsWidgets.js';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const IconDataItem = GObject.registerClass({
    Properties: {
        'name': GObject.ParamSpec.string('name', 'Name', 'Name', GObject.ParamFlags.READWRITE, ''),
        'icon': GObject.ParamSpec.string('icon', 'Icon', 'Icon', GObject.ParamFlags.READWRITE, ''),
        'group': GObject.ParamSpec.int('group', 'Group', 'Group', GObject.ParamFlags.READWRITE, 0, 15, 0),
    },
}, class Item extends GObject.Object {});

export default class ArcMenuPrefs extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);

        this._startTime = Date.now();
        this._systemIconsPromise = null;
        this._cachedSystemIcons = null;
        const resourcePath = '/org/gnome/shell/extensions/arcmenu/icons';
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_resource_path().includes(resourcePath))
            iconTheme.add_resource_path(resourcePath);

        const resource = Gio.Resource.load(`${this.path}/data/resources.gresource`);
        Gio.resources_register(resource);
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_search_enabled(true);
        window.set_default_size(settings.get_int('settings-width'), settings.get_int('settings-height'));

        let pageChangedId = settings.connect('changed::prefs-visible-page', () => {
            if (settings.get_int('prefs-visible-page') !== Constants.SettingsPage.MAIN)
                this._setVisiblePage(window, settings);
        });

        let pinnedAppsChangedId = settings.connect('changed::pinned-apps', () => {
            for (const page of window.pages) {
                if (page instanceof MenuPage) {
                    const {settingPage} = page.pinnedAppsRow;
                    settingPage.updatePinnedApps();
                }
            }
        });

        window.connect('notify::visible-page', () => {
            const page = window.visible_page;
            const maybeScrolledWindowChild = [...page][0];

            if (maybeScrolledWindowChild instanceof Gtk.ScrolledWindow)
                maybeScrolledWindowChild.vadjustment.value = 0;
        });

        window.connect('close-request', () => {
            if (pageChangedId) {
                settings.disconnect(pageChangedId);
                pageChangedId = null;
            }

            if (pinnedAppsChangedId) {
                settings.disconnect(pinnedAppsChangedId);
                pinnedAppsChangedId = null;
            }

            if (this._idleAddId) {
                GLib.source_remove(this._idleAddId);
                this._idleAddId = null;
            }

            if (this._timeoutAddId) {
                GLib.source_remove(this._timeoutAddId);
                this._timeoutAddId = null;
            }

            this._cachedSystemIcons = null;
            this._systemIconsPromise = null;
        });

        this._populateWindow(window, settings);
        window.connect('realize', () => {
            console.log(`Window Creation Time: ${Date.now() - this._startTime}ms`);
        });
        this._timeoutAddId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.getSystemIcons();
            this._timeoutAddId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _populateWindow(window, settings) {
        if (window.pages?.length > 0)
            window.pages.forEach(page => window.remove(page));

        window.pages = [];

        const generalPage = new GeneralPage(settings);
        window.add(generalPage);
        window.pages.push(generalPage);

        const menuPage = new MenuPage(settings, window);
        window.add(menuPage);
        window.pages.push(menuPage);

        const menuButtonPage = new MenuButtonPage(settings);
        window.add(menuButtonPage);
        window.pages.push(menuButtonPage);

        const donatePage = new DonatePage(this.metadata);
        window.add(donatePage);
        window.pages.push(donatePage);

        const aboutPage = new AboutPage(settings, this.metadata, this.path);
        window.add(aboutPage);
        window.pages.push(aboutPage);

        this._setVisiblePage(window, settings);
    }

    _setVisiblePage(window, settings) {
        const prefsVisiblePage = settings.get_int('prefs-visible-page');

        window.pop_subpage();
        if (prefsVisiblePage === Constants.SettingsPage.MAIN) {
            window.set_visible_page_name('GeneralPage');
        } else if (prefsVisiblePage === Constants.SettingsPage.CUSTOMIZE_MENU) {
            window.set_visible_page_name('MenuPage');
        } else if (prefsVisiblePage === Constants.SettingsPage.MENU_LAYOUT) {
            window.set_visible_page_name('MenuPage');
            const page = window.get_visible_page();
            page.presentSubpage(Constants.SettingsPage.MENU_LAYOUT);
        } else if (prefsVisiblePage === Constants.SettingsPage.MENU_THEME) {
            window.set_visible_page_name('MenuPage');
            const page = window.get_visible_page();
            page.presentSubpage(Constants.SettingsPage.MENU_THEME);
        } else if (prefsVisiblePage === Constants.SettingsPage.BUTTON_APPEARANCE) {
            window.set_visible_page_name('MenuButtonPage');
        } else if (prefsVisiblePage === Constants.SettingsPage.RUNNER_TWEAKS) {
            window.set_visible_page_name('MenuPage');
            const page = window.get_visible_page();
            page.presentSubpage(Constants.SettingsPage.RUNNER_TWEAKS);
        } else if (prefsVisiblePage === Constants.SettingsPage.ABOUT) {
            window.set_visible_page_name('AboutPage');
        } else if (prefsVisiblePage === Constants.SettingsPage.GENERAL) {
            window.set_visible_page_name('GeneralPage');
        } else if (prefsVisiblePage === Constants.SettingsPage.DONATE) {
            window.set_visible_page_name('DonatePage');
        } else if (prefsVisiblePage === Constants.SettingsPage.WHATS_NEW) {
            window.set_visible_page_name('AboutPage');
            const page = window.get_visible_page();
            page.showWhatsNewPage();
        }

        settings.set_int('prefs-visible-page', Constants.SettingsPage.MAIN);
    }

    getSystemIcons() {
        if (this._cachedSystemIcons)
            return Promise.resolve(this._cachedSystemIcons);

        if (this._systemIconsPromise)
            return this._systemIconsPromise;

        this._startSystemIconsPromise();
        return this._systemIconsPromise;
    }

    _startSystemIconsPromise() {
        this._systemIconsPromise = new Promise(resolve => {
            const startTime = Date.now();
            const iconsData = [];
            const iconThemeDefault = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
            const resourcePaths = [...iconThemeDefault.resource_path];
            const searchPaths = [...iconThemeDefault.get_search_path()];

            // Remove ArcMenu's own icons from theme resource
            const myResourcePath = '/org/gnome/shell/extensions/arcmenu/icons';
            const arcMenuIndex = resourcePaths.indexOf(myResourcePath);
            if (arcMenuIndex !== -1)
                resourcePaths.splice(arcMenuIndex, 1);

            const iconTheme = new Gtk.IconTheme({
                resource_path: resourcePaths,
                search_path: searchPaths,
                theme_name: iconThemeDefault.theme_name,
            });

            const names = iconTheme.get_icon_names();
            const CHUNK_SIZE = 400;
            let i = 0;
            this._idleAddId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (i === 0) {
                    const prefix = `${myResourcePath}/scalable/actions`;
                    try {
                        const entries = Gio.resources_enumerate_children(prefix, 0);
                        for (const entry of entries) {
                            if (!entry.endsWith('.svg'))
                                continue;

                            const name = entry.slice(0, -4);
                            const iconData = new IconDataItem({
                                name,
                                icon: `${Constants.RESOURCE_PATH}/actions/${entry}`,
                                group: entry.startsWith('distro') ? IconGroup.DISTRO : IconGroup.CUSTOM,
                            });
                            iconsData.push(iconData);
                        }
                    } catch (e) {
                        console.log(e, 'No custom action icons found or path wrong');
                    }
                }
                const end = Math.min(i + CHUNK_SIZE, names.length);
                for (; i < end; i++) {
                    const iconInfo = iconTheme.lookup_icon(
                        names[i],
                        null,
                        48, 1,
                        Gtk.TextDirection.NONE,
                        Gtk.IconLookupFlags.FORCE_SIZE
                    );
                    const file = iconInfo.get_file();
                    const filename = file.get_uri();
                    const match = filename.match(/[/](actions|apps|categories|devices|emblems|emotes|mimetypes|places|scalable|status)[/]?(?:[\dx]+|scalable)?[/]/i);
                    const category = match ? match[1].toLowerCase() : 'other';
                    const iconData = new IconDataItem({
                        name: names[i],
                        icon: names[i],
                        group: IconCategory[category] ?? IconGroup.OTHER,
                    });
                    iconsData.push(iconData);
                }

                if (i < names.length)
                    return GLib.SOURCE_CONTINUE;

                this._cachedSystemIcons = iconsData.sort((a, b) => a.name.localeCompare(b.name));
                console.log(`Build icon cache time: ${Date.now() - startTime}ms`);
                console.log(`Total icons gathered: ${this._cachedSystemIcons.length}`);
                resolve(this._cachedSystemIcons);
                this._idleAddId = null;
                return GLib.SOURCE_REMOVE;
            });
        });
    }
}
