#!/usr/bin/env python3
"""
Regenerate the service worker for the "HamShackTech CW Trainer" app
(static/cw-trainer/sw.js).

The app is a Progressive Web App (PWA): a small shell page with two tabs
(ICR, Code Groups, Progress, Jeopardy), sharing one engine (shared/hst-engine.js). Its
service worker keeps a saved copy of every app file so the installed app
opens with no internet connection.

This script writes sw.js with:
  * the full list of files to save (every file under static/cw-trainer/), and
  * a version that is a hash of all of them -- so ANY change to ANY app
    file produces a new version, and installed copies update themselves
    on their next launch. Nobody has to remember to bump a number.

  >>> Run it after every change to anything in static/cw-trainer/: <<<

    python3 scripts/build-cw-trainer.py

It also refreshes the app's copies of the site icons. Pass
--fonts /path/to/fontsource-packages only if the bundled font list changes.

Hugo/Cloudflare do NOT run this script; its output is committed like any
other static file.
"""
import argparse
import hashlib
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
APP = STATIC / "cw-trainer"


# Font files the app uses: (family name, fontsource package, weights).
# Only the "latin" subset is bundled -- it covers everything the trainers
# display and keeps the download small (~20 KB per weight).
FONTS = [
    ("Oswald", "oswald", [400, 500, 600, 700]),
    ("Inter", "inter", [400, 500, 600]),
    ("JetBrains Mono", "jetbrains-mono", [400, 500, 700]),
    ("IBM Plex Sans", "ibm-plex-sans", [400, 500, 600]),
    ("IBM Plex Mono", "ibm-plex-mono", [400, 500, 600, 700]),
    # Morse Code Jeopardy
    ("Bebas Neue", "bebas-neue", [400]),
    ("Russo One", "russo-one", [400]),
    ("Source Sans 3", "source-sans-3", [400, 600, 700]),
]


def build_fonts(fontsource_dir):
    font_dir = APP / "fonts"
    font_dir.mkdir(parents=True, exist_ok=True)
    css = ["/* Bundled copies of the trainers' Google Fonts, for offline use.\n"
           "   All five families are SIL Open Font License 1.1 -- see OFL.txt. */\n"]
    for family, pkg, weights in FONTS:
        # e.g. .../fontsource-oswald-5.3.0/package/files/oswald-latin-400-normal.woff2
        files_dir = next(fontsource_dir.glob(f"fontsource-{pkg}-*/package/files"))
        for w in weights:
            name = f"{pkg}-latin-{w}-normal.woff2"
            shutil.copyfile(files_dir / name, font_dir / name)
            css.append(
                "@font-face{font-family:'%s';font-style:normal;font-weight:%d;"
                "font-display:swap;src:url(%s) format('woff2')}\n" % (family, w, name))
    (font_dir / "fonts.css").write_text("".join(css), encoding="utf-8")
    lic = next(fontsource_dir.glob("fontsource-oswald-*/package/LICENSE"))
    shutil.copyfile(lic, font_dir / "OFL.txt")


def build_icons():
    icon_dir = APP / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    for name in ("apple-touch-icon.png", "android-chrome-192x192.png",
                 "android-chrome-512x512.png", "favicon-32x32.png"):
        shutil.copyfile(STATIC / name, icon_dir / name)


def build_service_worker():
    # Every file the app needs, as the URL the browser will request.
    # Folder pages are listed by folder URL ("/cw-trainer/icr/"), which is how
    # Cloudflare Pages serves them (it redirects ".../index.html" to "/").
    files = sorted(p for p in APP.rglob("*")
                   if p.is_file() and p.name not in ("sw.js", "OFL.txt"))
    urls, digest = [], hashlib.sha256()
    for p in files:
        rel = p.relative_to(STATIC).as_posix()
        url = "/" + (rel[: -len("index.html")] if rel.endswith("index.html") else rel)
        urls.append(url)
        digest.update(rel.encode() + b"\0" + p.read_bytes())
    template = (ROOT / "scripts" / "cw-trainer-sw.template.js").read_text()
    sw = template.replace("__VERSION__", digest.hexdigest()[:12])
    sw = sw.replace("__PRECACHE__", ",\n  ".join(f"'{u}'" for u in urls))
    (APP / "sw.js").write_text(sw, encoding="utf-8")
    print(f"sw.js: {len(urls)} files, version {digest.hexdigest()[:12]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", help="folder holding extracted @fontsource packages "
                    "(only needed when the font list changes)")
    args = ap.parse_args()
    if args.fonts:
        build_fonts(pathlib.Path(args.fonts))
    build_icons()
    build_service_worker()
