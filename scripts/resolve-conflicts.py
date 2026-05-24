#!/usr/bin/env python3
"""
Löst Git-Merge-Konflikte automatisch indem überall die "ours"-Sektion behalten wird.

Behandelt sowohl 3-way (mit |||||||  ancestor) als auch 2-way Konflikte.
Scannt rekursiv alle relevanten Datei-Typen und überspringt _archive/ + node_modules/.

Nutzung:
  python3 scripts/resolve-conflicts.py            # auflösen
  python3 scripts/resolve-conflicts.py --check    # nur prüfen, nicht ändern
  python3 scripts/resolve-conflicts.py --theirs   # alternativ "theirs" behalten
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = ('.html', '.js', '.css', '.xml', '.json', '.md', '.txt', '.webmanifest')
SKIP_DIRS = ('_archive', 'node_modules', '.git', '.vercel')

mode = 'ours'
check_only = False
for arg in sys.argv[1:]:
    if arg == '--theirs': mode = 'theirs'
    elif arg == '--check': check_only = True

# Pattern: <<<<<<< ours ... [||||||| ancestor ...] ======= ... >>>>>>> theirs
# Capture-Gruppen: 1 = ours, 2 = theirs
PATTERN = re.compile(
    r'<{7}[^\n]*\n(.*?)(?:\|{7}[^\n]*\n.*?)?={7}[^\n]*\n(.*?)>{7}[^\n]*\n?',
    re.DOTALL
)

def should_skip(path):
    for s in SKIP_DIRS:
        if f'/{s}/' in path or path.endswith(f'/{s}') or s in path.split(os.sep):
            return True
    return False

files_with_conflicts = 0
files_resolved = 0
total_conflicts = 0

for dirpath, dirnames, filenames in os.walk(ROOT):
    # Skip Ordner
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        if not fn.endswith(EXTS): continue
        full = os.path.join(dirpath, fn)
        if should_skip(full): continue
        try:
            with open(full, 'r', encoding='utf-8') as f: content = f.read()
        except Exception: continue

        markers = re.findall(r'<{7}|={7}|>{7}', content)
        if not markers: continue

        files_with_conflicts += 1
        n_conflicts = len(re.findall(r'<{7}', content))
        total_conflicts += n_conflicts
        rel = os.path.relpath(full, ROOT)

        if check_only:
            print(f'  ⚠ {rel}: {n_conflicts} Konflikt(e)')
            continue

        # Auflösen
        new_content = PATTERN.sub(lambda m: m.group(1) if mode == 'ours' else m.group(2), content)
        # Sanity: keine Marker mehr
        if re.search(r'<{7}|={7}|>{7}', new_content):
            print(f'  ✗ {rel}: Auflösung unvollständig')
            continue
        with open(full, 'w', encoding='utf-8') as f: f.write(new_content)
        files_resolved += 1
        print(f'  ✓ {rel}: {n_conflicts} Konflikt(e) → "{mode}" behalten')

print()
if check_only:
    print(f'{files_with_conflicts} Datei(en) mit {total_conflicts} Konflikt(en).')
    sys.exit(1 if files_with_conflicts else 0)
else:
    print(f'{files_resolved} Datei(en) aufgelöst, {total_conflicts} Konflikte gefixt.')
    if files_resolved > 0:
        print('\nEmpfohlen: python3 scripts/bump.py  (Asset-Version bumpen)')
        print('           dann: git add -A && git commit && git push')
