.PHONY: all clean extension potfile mergepo install prefs enable disable reset info show zip-file

GETTEXT_DOMAIN = arcmenu
NAME = ArcMenu
RESOURCES_PATH = /org/gnome/shell/extensions/arcmenu
SETTINGS_SCHEMA = org.gnome.shell.extensions.arcmenu
UUID = arcmenu@arcmenu.com

# Files and directories to build into extension.
# src/* flattens the src directory to root.
PACKAGE_FILES = \
	LICENSE \
	metadata.json \
	README.md \
	RELEASENOTES.md \
	src/*

# Directories to scan for .js and .ui files.
# `make potfile` uses xgettext to extract strings to build the .pot template.
I18N_DIRS = src/

# If VERSION is provided via CLI, suffix ZIP_NAME with _$(VERSION).
# Otherwise, inject git commit SHA (if available) into metadata.json.
COMMIT = $(if $(VERSION),,$(shell git rev-parse HEAD))
ZIP_NAME = $(UUID)$(if $(VERSION),_$(VERSION),)

MSGSRC = $(wildcard po/*.po)

ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif

define CLEAN_UP
@echo 'Cleaning up...'
@-rm -fR _build
@-rm -f ./schemas/gschemas.compiled
@-rm -f ./data/resources.gresource
@-rm -f ./data/resources.gresource.xml
@-rm -f ./po/*.po~
@-rm -f ./po/*.mo
@echo "Done."
endef

all: extension

clean:
	$(CLEAN_UP)

extension: ./data/resources.gresource ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/$(SETTINGS_SCHEMA).gschema.xml
	@echo "Compiling $(SETTINGS_SCHEMA).gschema.xml..."
	@glib-compile-schemas ./schemas/
	@echo "Done."

./data/resources.gresource: ./data/resources.gresource.xml
	@echo "Compiling resources.gresource.xml..."
	@glib-compile-resources --sourcedir=data data/resources.gresource.xml
	@echo "Done."

./data/resources.gresource.xml:
	@mkdir -p data/
	@echo "Creating resources.gresource.xml..."
	@FILES=$$(find data/ -mindepth 2 -type f -name "*.svg" -printf '    <file compressed="true" preprocess="xml-stripblanks">%P</file>\n') ; \
	printf "<?xml version='1.0' encoding='UTF-8'?>\n<gresources>\n  <gresource prefix='$(RESOURCES_PATH)'>\n$$FILES\n  </gresource>\n</gresources>" \
		> data/resources.gresource.xml
	@echo "Done."

potfile:
	@echo "Creating $(GETTEXT_DOMAIN).pot file..."
	@mkdir -p po
	@find $(I18N_DIRS) \( -name '*.js' -o -name '*.ui' \) | xargs \
	xgettext \
		--from-code=UTF-8 \
		--output=po/$(GETTEXT_DOMAIN).pot \
		--sort-by-file \
		--add-comments=TRANSLATORS \
		--package-name "$(NAME)"
	@echo "Done."

mergepo: potfile
	@echo "Updating po files..."
	@for l in $(MSGSRC); do \
		msgmerge -NU $$l ./po/$(GETTEXT_DOMAIN).pot; \
	done;
	@echo "Done."

./po/%.mo: ./po/%.po
	@echo "Compiling $<..."
	@msgfmt -c $< -o $@
	@echo "Done."

install: _build
	@echo "Installing to $(INSTALLBASE)..."
	@rm -rf $(INSTALLBASE)/$(UUID)
	@mkdir -p $(INSTALLBASE)/$(UUID)
	@cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings and locale files
	@rm -r $(INSTALLBASE)/$(UUID)/schemas $(INSTALLBASE)/$(UUID)/locale
	@mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas $(SHARE_PREFIX)/locale
	@cp -r ./schemas/*gschema.* $(SHARE_PREFIX)/glib-2.0/schemas
	@cp -r ./_build/locale/* $(SHARE_PREFIX)/locale
endif
	@echo "Done."
	$(CLEAN_UP)

prefs enable disable reset info show:
	gnome-extensions $@ $(UUID)

zip-file: _build
	@echo "Bundling zip file..."
	@cd _build ; \
	zip -qr "$(ZIP_NAME).zip" . -x "schemas/gschemas.compiled"
	@mv _build/$(ZIP_NAME).zip ./
	@echo "Done."
	$(CLEAN_UP)

_build: all
	@echo "Building extension..."
	@-rm -fR ./_build
	@mkdir -p _build
	@cp -r $(PACKAGE_FILES) _build
	@mkdir -p _build/schemas
	@cp schemas/*.xml _build/schemas/
	@cp schemas/gschemas.compiled _build/schemas/
	@mkdir -p _build/data
	@cp data/resources.gresource _build/data/resources.gresource
	@mkdir -p _build/locale
	@for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/$(GETTEXT_DOMAIN).mo; \
	done;
	@echo "Done."
ifneq ($(COMMIT),)
	@sed -i '/"version": .*,/a \  "commit": "$(COMMIT)",'  _build/metadata.json;
endif