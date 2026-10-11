"""
Check ios/native against xtool's own schema and its own examples.

Nothing here compiles Swift -- there is no Swift toolchain on this machine --
so this checks the things that can be checked without one: that the YAML
parses, that every key in it is a key xtool's PackSchemaBase actually decodes,
that the required ones are present, that the paths named really exist, and
that the package layout matches what SwiftPM demands.
"""
import os, sys, re, plistlib
import yaml

# Defaults to the project next door; pass a path to xtool's own checkout as a
# second argument to re-read its schema from source instead of the copy below.
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'ios', 'native')
XTOOL = sys.argv[2] if len(sys.argv) > 2 else None

bad = 0
def check(name, ok, detail=''):
    global bad
    print(f"  {'ok  ' if ok else 'FAIL'} {name}" + (f" -- {detail}" if detail else ''))
    if not ok: bad += 1

# ---- the keys xtool will actually decode, read out of its source
# Read the keys out of xtool's own source when it is to hand, so this cannot
# drift from the real schema; otherwise fall back to the copy taken from
# PackSchemaBase at xtool d802c71.
if XTOOL and os.path.isfile(os.path.join(XTOOL, 'Sources/PackLib/PackSchema.swift')):
    src = open(os.path.join(XTOOL, 'Sources/PackLib/PackSchema.swift')).read()
    base = src.split('public struct PackSchemaBase')[1].split('public struct Extension')[0]
    top_keys = set(re.findall(r'public var (\w+):', base))
    ext_block = src.split('public struct Extension')[1].split('}')[0]
    ext_keys = set(re.findall(r'public var (\w+):', ext_block))
else:
    top_keys = {'version', 'orgID', 'bundleID', 'product', 'infoPath',
                'entitlementsPath', 'iconPath', 'resources', 'extensions', 'skipLSP'}
    ext_keys = {'product', 'bundleID', 'infoPath', 'resources', 'entitlementsPath'}
print(f"  xtool accepts top-level: {', '.join(sorted(top_keys))}")
print(f"  xtool accepts per-extension: {', '.join(sorted(ext_keys))}\n")

doc = yaml.safe_load(open(os.path.join(ROOT, 'xtool.yml')))
check('xtool.yml parses as YAML', isinstance(doc, dict), str(type(doc).__name__))

unknown = set(doc) - top_keys
check('every key is one xtool reads', not unknown,
      ('unknown: ' + ', '.join(sorted(unknown))) if unknown else ', '.join(sorted(doc)))

check('version is 1', doc.get('version') == 1, repr(doc.get('version')))
check('it names a bundleID or an orgID',
      bool(doc.get('bundleID') or doc.get('orgID')), doc.get('bundleID') or doc.get('orgID'))

for key in ('infoPath', 'entitlementsPath', 'iconPath'):
    if key in doc:
        p = os.path.join(ROOT, doc[key])
        check(f'{key} points at a file that exists', os.path.isfile(p), doc[key])
if 'iconPath' in doc:
    check('the icon is a png', doc['iconPath'].lower().endswith('.png'), doc['iconPath'])

for ext in doc.get('extensions') or []:
    unknown = set(ext) - ext_keys
    check('extension keys are ones xtool reads', not unknown, str(ext))
    check('extension names an infoPath that exists',
          os.path.isfile(os.path.join(ROOT, ext.get('infoPath', ''))), ext.get('infoPath'))

# ---- Package.swift and the layout SwiftPM insists on
pkg = open(os.path.join(ROOT, 'Package.swift')).read()
check('Package.swift declares a tools version',
      bool(re.match(r'// swift-tools-version:', pkg)), pkg.splitlines()[0])
check('it targets iOS', '.iOS(' in pkg, re.search(r'\.iOS\(\.[\w]+\)', pkg).group(0) if '.iOS(' in pkg else '-')

product = doc.get('product')
if product:
    check('xtool.yml names a product Package.swift declares',
          re.search(r'\.library\(\s*name:\s*"%s"' % re.escape(product), pkg) is not None, product)
    check('and a target of that name exists',
          re.search(r'\.target\(\s*\n?\s*name:\s*"%s"' % re.escape(product), pkg) is not None, product)
    tdir = os.path.join(ROOT, 'Sources', product)
    check('Sources/<target>/ exists', os.path.isdir(tdir), f'Sources/{product}')
    swift = []
    for dirpath, _, files in os.walk(tdir):
        swift += [f for f in files if f.endswith('.swift')]
    check('and holds the Swift', len(swift) > 5, f'{len(swift)} files')

# ---- the entry point must be inside the target
main = None
for dirpath, _, files in os.walk(os.path.join(ROOT, 'Sources')):
    for f in files:
        if f.endswith('.swift') and '@main' in open(os.path.join(dirpath, f)).read():
            main = os.path.relpath(os.path.join(dirpath, f), ROOT)
check('the @main entry point is inside the target', main is not None, main or 'not found')

# ---- nothing stray inside Sources/ that SwiftPM would refuse to place
stray = []
for entry in os.listdir(os.path.join(ROOT, 'Sources')):
    if not os.path.isdir(os.path.join(ROOT, 'Sources', entry)):
        stray.append(entry)
check('nothing loose in Sources/', not stray, ', '.join(stray) or 'only target folders')

# ---- the parked widget is parked, not half-in
parked = os.path.join(ROOT, 'WidgetKit-parked')
check('the widget source is kept', os.path.isfile(os.path.join(parked, 'BreslovWidget.swift')))
check('and is outside Sources/', not os.path.exists(os.path.join(ROOT, 'Sources', 'BreslovWidget')))
check('and the manifests do not build it',
      'extensions:' not in [l.strip() for l in open(os.path.join(ROOT, 'xtool.yml'))]
      and not re.search(r'^\s*\.target\(name: "BreslovWidget"\)', pkg, re.M),
      'both commented out')

# ---- the location key, without which iOS kills the app when it asks
info = plistlib.load(open(os.path.join(ROOT, doc['infoPath']), 'rb'))
uses_location = any('CLLocationManager' in open(os.path.join(dp, f)).read()
                    for dp, _, fs in os.walk(os.path.join(ROOT, 'Sources'))
                    for f in fs if f.endswith('.swift'))
check('the app asks for location', uses_location, 'CLLocationManager is used')
check('and Info.plist says why',
      not uses_location or 'NSLocationWhenInUseUsageDescription' in info,
      info.get('NSLocationWhenInUseUsageDescription', '')[:60] + '…')

print('\n' + ('%d problem(s).' % bad if bad else 'The package matches xtool\'s schema and SwiftPM\'s layout.'))
sys.exit(1 if bad else 0)
