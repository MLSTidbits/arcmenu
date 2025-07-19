UUID = arcmenu@arcmenu.com

PACKAGE_FILES = \
	icons/ \
	LICENSE \
	README.md \
	RELEASENOTES.md \
	src/*

TOLOCALIZE = \
	src/appMenu.js \
	src/arcmenuManager.js \
	src/constants.js \
	src/iconGrid.js \
	src/menuButton.js \
	src/menuController.js \
	src/menuWidgets.js \
	src/placeDisplay.js \
	src/prefs.js \
	src/prefsWidgets.js \
	src/recentFilesManager.js \
	src/search.js \
	src/standaloneRunner.js \
	src/updateNotifier.js \
	src/utils.js \
	$(wildcard src/menulayouts/*.js) \
	$(wildcard src/searchProviders/*.js) \
	$(wildcard src/settings/*.js) \
	$(wildcard src/settings/menuSettings/*.js)

MSGSRC = $(wildcard po/*.po)

ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif

# The command line passed variable VERSION is used to set the version string
# in the generated zip-file. If no VERSION is passed,
# the current commit SHA1 is added to the metadata
ifdef VERSION
	VSTRING = _$(VERSION)
else
	COMMIT = $(shell git rev-parse HEAD)
	VSTRING =
endif

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.arcmenu.gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/arcmenu.pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/arcmenu.pot; \
	done;

./po/arcmenu.pot: $(TOLOCALIZE)
	mkdir -p po
	xgettext -k_ -kN_ --from-code utf-8 -o po/arcmenu.pot --sort-by-file --add-comments=TRANSLATORS --package-name "ArcMenu" $(TOLOCALIZE)

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings and locale files
	rm -r $(INSTALLBASE)/$(UUID)/schemas $(INSTALLBASE)/$(UUID)/locale
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas $(SHARE_PREFIX)/locale
	cp -r ./schemas/*gschema.* $(SHARE_PREFIX)/glib-2.0/schemas
	cp -r ./_build/locale/* $(SHARE_PREFIX)/locale
endif
	-rm -fR _build
	echo done

prefs enable disable reset info show:
	gnome-extensions $@ $(UUID)

zip-file: _build
	cd _build ; \
	zip -qr "$(UUID)$(VSTRING).zip" .
	mv _build/$(UUID)$(VSTRING).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build
	mkdir -p _build
	cp -r $(PACKAGE_FILES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	mkdir -p _build/locale
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/arcmenu.mo; \
	done;
ifneq ($(COMMIT),)
	sed -i '/"version": .*,/a \  "commit": "$(COMMIT)",'  _build/metadata.json;
endif
