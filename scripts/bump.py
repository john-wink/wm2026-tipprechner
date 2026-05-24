#!/usr/bin/env python3
"""
Bumpt die Asset-Version synchron über alle HTMLs und den Service Worker.

Workflow:
  - Du änderst Dateien in /assets/ oder die HTMLs
  - Du führst dieses Script aus → neue Version wird überall gesetzt
  - git push → Vercel deployed → User-Browser merkt die neue SW-Version,
    leert den alten Cache und lädt frische Assets

Nutzung:
  python3 scripts/bump.py              # auto-bump nach Datum+Uhrzeit
  python3 scripts/bump.py v2026.06.01  # explizite Version setzen

Asset-URLs sehen danach so aus:
  /assets/app.js?v=v2026.05.23.1620

Der SW cacht die versionierten URLs als immutable. Bei neuer Version
wird der ganze alte Cache verworfen.
"""
import os, re, sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Version ermitteln
if len(sys.argv) > 1:
    VERSION = sys.argv[1]
else:
    VERSION = datetime.now().strftime('v%Y.%m.%d.%H%M')

HTML_FILES = [
    'index.html',
    'de/index.html',
    'en/index.html',
    'fr/index.html',
    'es/index.html',
]

# Assets die versioniert werden müssen (inkl. minifizierte Varianten)
ASSETS = ['app.js', 'app.min.js', 'i18n.js', 'i18n.min.js', 'styles.css', 'tailwind.css']

def patch_html(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    # Pattern: /assets/<file>(?v=...)?
    for asset in ASSETS:
        # Entfernt vorhandenen ?v=... und fügt neuen ein
        pattern = re.compile(
            r'(/assets/' + re.escape(asset) + r')(\?v=[^"\'\s>]*)?'
        )
        content = pattern.sub(r'\1?v=' + VERSION, content)
    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def patch_sw(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    # VERSION-Konstante setzen
    content = re.sub(
        r"const VERSION = '[^']+';",
        f"const VERSION = '{VERSION}';",
        content
    )
    # CORE-Asset-URLs versionieren
    for asset in ASSETS:
        pattern = re.compile(
            r"'(/assets/" + re.escape(asset) + r")(\?v=[^']*)?'"
        )
        content = pattern.sub(r"'\1?v=" + VERSION + "'", content)
    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    print(f'Bumping to {VERSION}\n')
    changed = []
    for rel in HTML_FILES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            print(f'  ⚠ skip (not found): {rel}')
            continue
        if patch_html(p):
            changed.append(rel)
            print(f'  ✓ {rel}')
        else:
            print(f'  · {rel} (no change needed)')

    sw_path = os.path.join(ROOT, 'sw.js')
    if patch_sw(sw_path):
        changed.append('sw.js')
        print(f'  ✓ sw.js')
    else:
        print(f'  · sw.js (no change needed)')

    print(f'\nDone. {len(changed)} file(s) updated.')
    print(f'\nNext: git add -A && git commit -m "Bump to {VERSION}" && git push')

if __name__ == '__main__':
    main()
