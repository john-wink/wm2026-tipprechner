#!/usr/bin/env python3
"""
Setzt die Domain überall im Projekt: HTMLs, sitemap.xml, robots.txt, manifest.

Notwendig wenn das Projekt auf einer anderen URL gehostet wird als der Default
(`wm2026-tipprechner.vercel.app`). Ohne korrekte Domain lehnt Google Search Console
die Sitemap ab, weil die <loc>-URLs nicht zur verifizierten Property passen.

Nutzung:
  python3 scripts/set-domain.py https://deine-app.vercel.app
  python3 scripts/set-domain.py https://wm2026.deinedomain.de

Akzeptiert mit oder ohne trailing slash, mit oder ohne https://.
"""
import os, re, sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if len(sys.argv) < 2:
    print('Usage: python3 scripts/set-domain.py <new-domain>')
    print('Example: python3 scripts/set-domain.py https://my-app.vercel.app')
    sys.exit(1)

raw = sys.argv[1].strip()
# Normalisieren: https://hostname (ohne trailing slash)
if not raw.startswith('http'): raw = 'https://' + raw
parsed = urlparse(raw)
NEW_HOST = parsed.netloc
NEW_BASE = f'{parsed.scheme}://{NEW_HOST}'

# Default-Platzhalter (was wir ersetzen)
OLD_HOST_PATTERNS = [
    'wm2026-tipprechner.vercel.app',  # initial default
]
# Auch die jetzt-aktive Domain auslesen falls sie schon mal gesetzt wurde
# Falls die canonical-URL in de/index.html anders ist als der Default, das auch ersetzen
de_html = os.path.join(ROOT, 'de/index.html')
if os.path.exists(de_html):
    with open(de_html) as f: html = f.read()
    m = re.search(r'canonical"\s+href="https?://([^/"]+)', html)
    if m and m.group(1) not in OLD_HOST_PATTERNS:
        OLD_HOST_PATTERNS.append(m.group(1))

print(f'New base: {NEW_BASE}')
print(f'Replacing hosts: {OLD_HOST_PATTERNS}\n')

# Files & patterns
FILES_TO_PATCH = [
    'index.html', 'de/index.html', 'en/index.html', 'fr/index.html', 'es/index.html',
    'sitemap.xml', 'robots.txt',
]

# manifest.webmanifest: enthält keine vollen URLs (Pfade ab "/"), kein Update nötig
# vercel.json: enthält keine Hostnames

total_changes = 0
for rel in FILES_TO_PATCH:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        print(f'  ⚠ skip (not found): {rel}')
        continue
    with open(p, 'r', encoding='utf-8') as f: content = f.read()
    orig = content
    for old in OLD_HOST_PATTERNS:
        if old == NEW_HOST: continue
        # https://OLD oder OLD ohne Protokoll – beides ersetzen
        content = content.replace(f'https://{old}', NEW_BASE)
        content = content.replace(f'http://{old}', NEW_BASE)
    if content != orig:
        with open(p, 'w', encoding='utf-8') as f: f.write(content)
        n_diff = sum(1 for o, n in zip(orig.split('\n'), content.split('\n')) if o != n)
        print(f'  ✓ {rel} ({n_diff} Zeilen geändert)')
        total_changes += 1
    else:
        print(f'  · {rel} (no change)')

print(f'\n{total_changes} Datei(en) aktualisiert.')

# Hinweise
print('\nNächste Schritte:')
print(f'  1. python3 scripts/bump.py        (Asset-Version bumpen)')
print(f'  2. git add -A && git commit -m "Domain auf {NEW_HOST}"')
print(f'  3. git push                       (Vercel deployed)')
print(f'  4. In Google Search Console:      Sitemap erneut einreichen:')
print(f'                                    {NEW_BASE}/sitemap.xml')
