#!/usr/bin/env python3
"""
Production-Build in einem Befehl:
  1. Tailwind kompilieren
  2. JS minifizieren (app.js → app.min.js, i18n.js → i18n.min.js)
  3. Asset-Version bumpen (oder Argument akzeptieren)

Nutzung:
  python3 scripts/build.py                # alles bauen, auto-Version
  python3 scripts/build.py v2026.06.01    # alles bauen, explizite Version

Voraussetzungen:
  - Node + npm im PATH
  - tailwindcss + terser werden bei Bedarf via npx geladen
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAILWIND_INPUT = '/tmp/tw-input.css'

def run(cmd, **kwargs):
    print(f'  $ {" ".join(cmd) if isinstance(cmd, list) else cmd}')
    return subprocess.run(cmd, **kwargs)

# 1) Tailwind kompilieren
print('═══ 1/3 Tailwind kompilieren ═══')
with open(TAILWIND_INPUT, 'w') as f:
    f.write('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')

result = run([
    'npx', '-y', '-p', 'tailwindcss@3.4.10', 'tailwindcss',
    '-i', TAILWIND_INPUT,
    '-o', os.path.join(ROOT, 'assets/tailwind.css'),
    '--content', f'{ROOT}/**/*.html,{ROOT}/assets/app.js',
    '--minify'
], capture_output=True, text=True)
if result.returncode != 0:
    print(f'  ✗ Tailwind-Build fehlgeschlagen:\n{result.stderr}')
    sys.exit(1)
print('  ✓ assets/tailwind.css')

# 2) JS minifizieren
print('\n═══ 2/3 JS minifizieren ═══')
for name in ['app', 'i18n']:
    src = os.path.join(ROOT, f'assets/{name}.js')
    dst = os.path.join(ROOT, f'assets/{name}.min.js')
    if not os.path.exists(src):
        print(f'  ⚠ {src} fehlt')
        continue
    result = run([
        'npx', '-y', '-p', 'terser@5', 'terser', src,
        '--compress', 'passes=2',
        '--mangle', "reserved=['I18N','TEAM_LABELS','t','teamLabel','GROUPS','matchData','outrightData']",
        '--output', dst
    ], capture_output=True, text=True)
    if result.returncode != 0:
        print(f'  ✗ Terser-Build für {name}.js fehlgeschlagen:\n{result.stderr}')
        sys.exit(1)
    so, sm = os.path.getsize(src), os.path.getsize(dst)
    pct = (1 - sm/so) * 100
    print(f'  ✓ {name}.js ({so/1024:.1f}KB) → {name}.min.js ({sm/1024:.1f}KB, -{pct:.1f}%)')

# 3) Version bumpen
print('\n═══ 3/3 Asset-Version bumpen ═══')
bump_args = ['python3', os.path.join(ROOT, 'scripts/bump.py')]
if len(sys.argv) > 1: bump_args.append(sys.argv[1])
result = run(bump_args)

print('\n═══ Build abgeschlossen ═══')
print('Empfohlen:')
print('  git add -A && git commit -m "Build" && git push')
