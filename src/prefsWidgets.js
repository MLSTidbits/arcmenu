import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const IconGroup = Object.freeze({
    ALL:        0,
    CUSTOM:     1,
    DISTRO:     2,
    ACTIONS:    3,
    APPS:       4,
    CATEGORIES: 5,
    DEVICES:    6,
    EMBLEMS:    7,
    EMOTES:     8,
    MIMETYPES:  9,
    OTHER:      10,
    PLACES:     11,
    SCALABLE:   12,
    STATUS:     13,
});

export const IconCategory = Object.freeze({
    'actions':     IconGroup.ACTIONS,
    'apps':        IconGroup.APPS,
    'categories':  IconGroup.CATEGORIES,
    'devices':     IconGroup.DEVICES,
    'emblems':     IconGroup.EMBLEMS,
    'emotes':      IconGroup.EMOTES,
    'mimetypes':   IconGroup.MIMETYPES,
    'other':       IconGroup.OTHER,
    'places':      IconGroup.PLACES,
    'scalable':    IconGroup.SCALABLE,
    'status':      IconGroup.STATUS,
});

export class SwitchRow extends Adw.ActionRow {
    static [GObject.properties] = {
        'setting-name': GObject.ParamSpec.string('setting-name', 'setting-name', 'setting-name',
            GObject.ParamFlags.READWRITE,
            ''),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(settings, params) {
        super(params);

        if (!this.settingName)
            throw new Error('SwitchRow requires a "setting-name" property');

        if (!settings)
            throw new Error('SwitchRow settings must be initialized');

        const switchButton = new Gtk.Switch({valign: Gtk.Align.CENTER});
        settings.bind(this.settingName, switchButton, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add_suffix(switchButton);
        this.activatable_widget = switchButton;
    }
}

export const DialogWindow = GObject.registerClass({
    Signals: {
        'response': {param_types: [GObject.TYPE_INT]},
    },
}, class ArcMenuDialogWindow extends Adw.PreferencesWindow {
    _init(title, parent) {
        super._init({
            title,
            transient_for: parent.get_root(),
            modal: true,
            search_enabled: true,
        });
        this.page = new Adw.PreferencesPage();
        this.pageGroup = new Adw.PreferencesGroup();

        this.add(this.page);
        this.page.add(this.pageGroup);
    }
});

export const HeaderBarDialog = GObject.registerClass({
    Signals: {
        'response': {param_types: [GObject.TYPE_INT]},
    },
}, class ArcMenuHeaderBarDialog extends Adw.Window {
    _init(title, actionButtonLabel, parent) {
        super._init({
            title,
            transient_for: parent.get_root(),
            modal: true,
        });

        const sidebarToolBarView = new Adw.ToolbarView({
            top_bar_style: Adw.ToolbarStyle.RAISED,
        });
        this.set_content(sidebarToolBarView);

        this._headerBar = new Adw.HeaderBar({
            show_end_title_buttons: false,
            show_start_title_buttons: true,
        });
        sidebarToolBarView.add_top_bar(this._headerBar);

        this._actionButton = new Gtk.Button({
            label: actionButtonLabel ?? _('Apply'),
            halign: Gtk.Align.END,
            hexpand: false,
            css_classes: ['suggested-action'],
            sensitive: false,
        });
        this._actionButton.connect('clicked', () => {
            this._onActionClicked();
        });
        this._headerBar.pack_end(this._actionButton);

        const cancelButton = new Gtk.Button({
            label: _('Cancel'),
            halign: Gtk.Align.START,
            hexpand: false,
        });
        cancelButton.connect('clicked', () => this.close());
        this._headerBar.pack_start(cancelButton);

        this.page = new Adw.PreferencesPage();
        sidebarToolBarView.set_content(this.page);

        this.pageGroup = new Adw.PreferencesGroup();
        this.page.add(this.pageGroup);
    }

    _setActionButtonSensitive(bool) {
        this._actionButton.sensitive = bool;
    }

    _onActionClicked() {
        this.emit('response', Gtk.ResponseType.APPLY);
    }
});

export class IconChooserDialog extends HeaderBarDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, parent) {
        super(_('Select an Icon'), _('Select'), parent);
        this._settings = settings;
        this.set_default_size(420, 620);
        this.iconString = '';
        this._currentGroup = IconGroup.ALL;
        this._searchQuery = '';

        const iconTypes = new Gtk.StringList();
        iconTypes.append(_('All'));
        iconTypes.append(_('Custom'));
        iconTypes.append(_('Distros'));
        iconTypes.append(_('Actions'));
        iconTypes.append(_('Applications'));
        iconTypes.append(_('Categories'));
        iconTypes.append(_('Devices'));
        iconTypes.append(_('Emblems'));
        iconTypes.append(_('Emotes'));
        iconTypes.append(_('Mimetypes'));
        iconTypes.append(_('Other'));
        iconTypes.append(_('Places'));
        iconTypes.append(_('Scalable'));
        iconTypes.append(_('Status'));

        const topBox = new Gtk.Box({
            css_classes: ['linked'],
            margin_bottom: 12,
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search icons…'),
            search_delay: 300,
            hexpand: true,
        });
        topBox.append(searchEntry);

        const iconMenuButton = new Gtk.DropDown({
            model: iconTypes,
            selected: this._currentGroup,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });
        topBox.append(iconMenuButton);

        this.pageGroup.add(topBox);

        this._listStore = new Gio.ListStore();
        this._filter = new Gtk.CustomFilter();

        const filterModel = new Gtk.FilterListModel({
            model: this._listStore,
            filter: this._filter,
        });

        const selection = new Gtk.SingleSelection({
            model: filterModel,
            autoselect: false,
            can_unselect: true,
        });

        const factory = new Gtk.SignalListItemFactory();
        factory.connect('setup', this._setupItem.bind(this));
        factory.connect('bind', this._bindItem.bind(this));

        this._iconGridView = new Gtk.GridView({
            model: selection,
            factory,
            max_columns: 9,
            min_columns: 4,
            css_classes: ['card'],
        });

        const scrolled = new Gtk.ScrolledWindow({
            child: this._iconGridView,
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });
        this.pageGroup.add(scrolled);

        const fileChooserButton = new Gtk.Button({
            label: _('Browse Files...'),
            valign: Gtk.Align.CENTER,
            margin_top: 12,
        });
        fileChooserButton.connect('clicked', () => this._launchFileChooser());
        this.pageGroup.add(fileChooserButton);

        const updateFilter = () => {
            const query = this._searchQuery;
            const currentGroup = this._currentGroup;

            this._filter.set_filter_func(item => {
                const {name, group} = item;

                // Group filter
                if (currentGroup !== IconGroup.ALL && group !== currentGroup)
                    return false;

                // Search filter
                if (query && !name.toLowerCase().includes(query))
                    return false;

                return true;
            });

            this._filter.changed(Gtk.FilterChange.DIFFERENT);
        };

        iconMenuButton.connect('notify::selected', () => {
            this._currentGroup = iconMenuButton.selected;
            updateFilter();
        });

        searchEntry.connect('search-changed', () => {
            this._searchQuery = searchEntry.text.trim().toLowerCase();
            updateFilter();
        });

        updateFilter();

        // Add some padding inbetween the gridview children
        const provider = new Gtk.CssProvider();
        provider.load_from_string(`
            gridview.icon-grid > child { margin: 2px; }
            gridview.icon-grid { padding: 2px; }
        `);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
        this._iconGridView.add_css_class('icon-grid');

        selection.selected = Gtk.INVALID_LIST_POSITION;
        selection.connect('notify::selected-item', () => this._setActionButtonSensitive(true));

        const extension = ExtensionPreferences.lookupByURL(import.meta.url);
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            extension.getSystemIcons().then(allIcons => {
                this._listStore.splice(0, 0, allIcons);
            }).catch(e => console.log(e));
            return GLib.SOURCE_REMOVE;
        });
    }

    _setupItem(_factory, listItem) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 8,
            margin_end: 8,
        });

        const image = new Gtk.Image({pixel_size: 32});
        box.append(image);

        listItem._image = image;
        listItem.set_child(box);
    }

    _bindItem(_factory, listItem) {
        const item = listItem.get_item();
        const {name} = item;

        listItem.child.tooltip_text = name;
        listItem._image.icon_name = name;
    }

    _launchFileChooser() {
        const fileFilter = new Gtk.FileFilter();
        fileFilter.add_pixbuf_formats();
        const dialog = new Gtk.FileChooserDialog({
            title: _('Select an Icon'),
            transient_for: this.get_root(),
            modal: true,
            action: Gtk.FileChooserAction.OPEN,
        });
        dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        dialog.add_button(_('Select'), Gtk.ResponseType.ACCEPT);

        dialog.set_filter(fileFilter);

        dialog.connect('response', (self, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                this.iconString = dialog.get_file().get_path();
                this.emit('response', Gtk.ResponseType.APPLY);
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _onActionClicked() {
        const selected = this._iconGridView.model.selected_item;
        if (selected)
            this.iconString = selected.icon;

        super._onActionClicked();
    }
}

export const SettingRow = GObject.registerClass(
class ArcMenuSettingRow extends Adw.ActionRow {
    _init(params) {
        super._init({
            activatable: true,
            ...params,
        });

        const goNextImage = new Gtk.Image({
            gicon: Gio.Icon.new_for_string('go-next-symbolic'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        });

        this.add_suffix(goNextImage);
    }
});

export const DragRow = GObject.registerClass({
    Properties: {
        'shortcut-name': GObject.ParamSpec.string(
            'shortcut-name', 'shortcut-name', 'shortcut-name',
            GObject.ParamFlags.READWRITE,
            ''),
        'shortcut-icon': GObject.ParamSpec.string(
            'shortcut-icon', 'shortcut-icon', 'shortcut-icon',
            GObject.ParamFlags.READWRITE,
            ''),
        'shortcut-command': GObject.ParamSpec.string(
            'shortcut-command', 'shortcut-command', 'shortcut-command',
            GObject.ParamFlags.READWRITE,
            ''),
        'gicon': GObject.ParamSpec.object(
            'gicon', 'gicon', 'gicon',
            GObject.ParamFlags.READWRITE,
            Gio.Icon.$gtype),
        'pixbuf': GObject.ParamSpec.object(
            'pixbuf', 'pixbuf', 'pixbuf',
            GObject.ParamFlags.READWRITE,
            GdkPixbuf.Pixbuf.$gtype),
        'icon-pixel-size': GObject.ParamSpec.int(
            'icon-pixel-size', 'icon-pixel-size', 'icon-pixel-size',
            GObject.ParamFlags.READWRITE,
            1, GLib.MAXINT32, 22),
        'switch-enabled': GObject.ParamSpec.boolean(
            'switch-enabled', 'switch-enabled', 'switch-enabled',
            GObject.ParamFlags.READWRITE,
            false),
        'switch-active': GObject.ParamSpec.boolean(
            'switch-active', 'switch-active', 'switch-active',
            GObject.ParamFlags.READWRITE,
            false),
    },
    Signals: {
        'drag-drop-done': { },
        'change-button-clicked': { },
        'switch-toggled': { },
    },
}, class ArcMenuDragRow extends Adw.ActionRow {
    _init(params) {
        super._init(params);

        this._params = params;

        this.icon = new Gtk.Image({
            gicon: this.gicon,
            pixel_size: this.icon_pixel_size,
        });
        this.add_prefix(this.icon);

        if (this.pixbuf)
            this.icon.set_from_pixbuf(this.pixbuf);

        this.connect('notify::gicon', () => (this.icon.gicon = this.gicon));

        this.dragIcon = new Gtk.Image({
            gicon: Gio.Icon.new_for_string('list-drag-handle-symbolic'),
            pixel_size: 12,
        });
        this.add_prefix(this.dragIcon);

        if (this.switch_enabled) {
            this.switch = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                vexpand: false,
                margin_start: 10,
                active: this.switch_active,
            });
            this.switch.connect('notify::active', () => {
                this.switch_active = this.switch.get_active();
                this.emit('switch-toggled');
            });
            this.add_suffix(this.switch);
            this.add_suffix(new Gtk.Separator({
                orientation: Gtk.Orientation.VERTICAL,
                margin_top: 10,
                margin_bottom: 10,
            }));
        }

        const dragSource = new Gtk.DragSource({actions: Gdk.DragAction.MOVE});
        this.add_controller(dragSource);

        const dropTarget = new Gtk.DropTargetAsync({actions: Gdk.DragAction.MOVE});
        this.add_controller(dropTarget);

        dragSource.connect('drag-begin', (self, gdkDrag) => {
            this._dragParent = self.get_widget().get_parent();
            this._dragParent.dragRow = this;

            const alloc = this.get_allocation();
            const dragWidget = self.get_widget().createDragRow(alloc);
            this._dragParent.dragWidget = dragWidget;

            const icon = Gtk.DragIcon.get_for_drag(gdkDrag);
            icon.set_child(dragWidget);

            gdkDrag.set_hotspot(this._dragParent.dragX, this._dragParent.dragY);
        });

        dragSource.connect('prepare', (self, x, y) => {
            this.set_state_flags(Gtk.StateFlags.NORMAL, true);
            const parent = self.get_widget().get_parent();
            // store drag start cursor location
            parent.dragX = x;
            parent.dragY = y;
            return new Gdk.ContentProvider();
        });

        dragSource.connect('drag-end', (_self, _gdkDrag) => {
            this._dragParent.dragWidget = null;
            this._dragParent.drag_unhighlight_row();
        });

        dropTarget.connect('drag-enter', self => {
            const parent = self.get_widget().get_parent();
            const widget = self.get_widget();

            parent.drag_highlight_row(widget);
        });

        dropTarget.connect('drag-leave', self => {
            const parent = self.get_widget().get_parent();
            parent.drag_unhighlight_row();
        });

        dropTarget.connect('drop', (_self, gdkDrop) => {
            const parent = this.get_parent();
            const {dragRow} = parent; // The row being dragged.
            const dragRowStartIndex = dragRow.get_index();
            const dragRowNewIndex = this.get_index();

            gdkDrop.read_value_async(ArcMenuDragRow, 1, null, () => gdkDrop.finish(Gdk.DragAction.MOVE));

            // The drag row hasn't moved
            if (dragRowStartIndex === dragRowNewIndex)
                return true;

            parent.remove(dragRow);
            parent.show();
            parent.insert(dragRow, dragRowNewIndex);

            this.emit('drag-drop-done');
            return true;
        });
    }

    createDragRow(alloc) {
        const dragWidget = new Gtk.ListBox();
        dragWidget.set_size_request(alloc.width, alloc.height);

        const dragRow = new DragRow(this._params);
        dragWidget.append(dragRow);
        dragWidget.drag_highlight_row(dragRow);

        dragRow.title = _(this.title);
        dragRow.css_classes = this.css_classes;
        dragRow.icon.gicon = this.gicon;

        if (this.pixbuf)
            dragRow.icon.set_from_pixbuf(this.pixbuf);

        const editButton = new Gtk.Button({
            icon_name: 'view-more-symbolic',
            valign: Gtk.Align.CENTER,
        });
        dragRow.add_suffix(editButton);

        return dragWidget;
    }
});

const ModifyEntryType = {
    MOVE_UP: 0,
    MOVE_DOWN: 1,
    REMOVE: 2,
};

export const EditEntriesBox = GObject.registerClass({
    Properties: {
        'allow-modify': GObject.ParamSpec.boolean(
            'allow-modify', 'allow-modify', 'allow-modify',
            GObject.ParamFlags.READWRITE,
            false),
        'allow-remove': GObject.ParamSpec.boolean(
            'allow-remove', 'allow-remove', 'allow-remove',
            GObject.ParamFlags.READWRITE,
            false),
        'row': GObject.ParamSpec.object(
            'row', 'row', 'row',
            GObject.ParamFlags.READWRITE,
            Gtk.Widget.$gtype),
    },
    Signals: {
        'modify-button-clicked': {},
        'entry-modified': {param_types: [GObject.TYPE_INT, GObject.TYPE_INT]},
    },
},  class ArcMenuEditEntriesBox extends Gtk.MenuButton {
    _init(params) {
        super._init({
            icon_name: 'view-more-symbolic',
            valign: Gtk.Align.CENTER,
            popover: new Gtk.Popover(),
            ...params,
        });

        const popoverBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 3,
        });
        this.popover.set_child(popoverBox);

        const modifyEntryButton = new Gtk.Button({
            label: _('Modify'),
            has_frame: false,
            visible: this.allow_modify,
        });
        modifyEntryButton.connect('clicked', () => {
            this.popover.popdown();
            this.emit('modify-button-clicked');
        });
        popoverBox.append(modifyEntryButton);

        const topSeparator = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
        topSeparator.visible = this.allow_modify;
        popoverBox.append(topSeparator);

        const moveUpButton = new Gtk.Button({
            label: _('Move Up'),
            has_frame: false,
        });
        moveUpButton.connect('clicked', () => this.modifyEntry(ModifyEntryType.MOVE_UP));
        popoverBox.append(moveUpButton);

        const moveDownButton = new Gtk.Button({
            label: _('Move Down'),
            has_frame: false,
        });
        moveDownButton.connect('clicked', () => this.modifyEntry(ModifyEntryType.MOVE_DOWN));
        popoverBox.append(moveDownButton);

        const removeEntryButton = new Gtk.Button({
            label: _('Remove'),
            has_frame: false,
            visible: this.allow_remove,
        });
        removeEntryButton.connect('clicked', () => this.modifyEntry(ModifyEntryType.REMOVE));

        const bottomSeparator = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
        bottomSeparator.visible = this.allow_remove;
        popoverBox.append(bottomSeparator);

        popoverBox.append(removeEntryButton);

        this.connect('notify::allow-modify', () => {
            modifyEntryButton.visible = this.allow_modify;
            topSeparator.visible = this.allow_modify;
        });
        this.connect('notify::allow-remove', () => {
            removeEntryButton.visible = this.allow_remove;
            bottomSeparator.visible = this.allow_remove;
        });
    }

    modifyEntry(modifyEntryType) {
        this.popover.popdown();

        const startIndex = this.row.get_index();
        const parent = this.row.get_parent();
        const children = [...parent];
        let indexModification;

        if (modifyEntryType === ModifyEntryType.MOVE_DOWN) {
            if (startIndex >= children.length - 1)
                return;

            indexModification = 1;
        } else if (modifyEntryType === ModifyEntryType.MOVE_UP) {
            if (startIndex <= 0)
                return;

            indexModification = -1;
        }
        if (modifyEntryType === ModifyEntryType.REMOVE)
            indexModification = (startIndex + 1) * -1; // we want newIndex == -1 for a remove

        const newIndex = startIndex + indexModification;

        parent.remove(this.row);
        if (newIndex !== -1)
            parent.insert(this.row, newIndex);
        parent.show();

        this.emit('entry-modified', startIndex, newIndex);
    }
});
