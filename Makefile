.PHONY: all clean extension potfile mergepo install prefs enable disable reset info show zip-file

UUID = arcmenu@arcmenu.com

PACKAGE_FILES = \
	icons/ \
	LICENSE \
	README.md \
	RELEASENOTES.md \
	src/*

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

potfile:
	mkdir -p po
	find src/ -name '*.js' | xargs \
	xgettext -k_ -kN_ \
		--from-code=UTF-8 \
		--output=po/arcmenu.pot \
		--sort-by-file \
		--add-comments=TRANSLATORS \
		--package-name "ArcMenu"

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -NU $$l ./po/arcmenu.pot; \
	done;

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

install: _build
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
