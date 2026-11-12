"""Gedeelde paden, locatie-identiteit en gecontroleerde bestandsuitvoer."""
import json
import os
from pathlib import Path
import re
import tempfile

SOURCE_ROOT = Path(__file__).resolve().parent.parent
ROOT = Path(os.environ.get('PINO_OUTPUT_ROOT', SOURCE_ROOT))
RAW_DIR = Path(os.environ.get('PINO_RAW_DIR', '/tmp'))
HEADER = '/* Gegenereerd uit Kiesraad-brondata. Zie scripts/ en README.md. */\n'


def read_js(path, variable):
    text = Path(path).read_text(encoding='utf-8')
    return json.loads(text.split('const ' + variable + ' = ', 1)[1].strip().removesuffix(';'))


def write_js(path, variable, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = HEADER + 'const ' + variable + ' = ' + json.dumps(value, ensure_ascii=False, indent=1 if variable == 'STEMBUREAUS' else None) + ';\n'
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as f:
        f.write(text)
        temporary = f.name
    os.replace(temporary, path)


def postcode(name):
    match = re.search(r'(\d{4})\s*([A-Za-z]{2})', name)
    return (match[1] + match[2]).upper() if match else ''


def clean(name):
    name = re.sub(r'\(postcode[^)]*\)', '', name, flags=re.I)
    name = re.sub(r'^(?:\s*stembureau\s*)+', '', name, flags=re.I)
    name = re.sub(r'\b\d{1,2}[- ]?maart[- ]?2021\b', '', name, flags=re.I)
    name = re.sub(r'\s*\((hoofdlocatie|beperkte toegang)\)', '', name, flags=re.I)
    return re.sub(r'\s+', ' ', name.replace('"', "'")).strip(" .-'")


def canon(name):
    name = re.sub(r'\([^)]*\)', '', clean(name)).replace('&', 'en')
    name = re.sub(r'\b(pijnacker|nootdorp|delfgauw)\b', '', name, flags=re.I)
    key = re.sub(r'\s+', ' ', name).strip(" .-'").lower().replace('sportzaal', 'sporthal')
    key = re.sub(r'kerk(le|el)ijk', 'kerkelijk', key).replace('consutatie', 'consultatie')
    return {'verzorgingshuis veenhage': 'woonzorgcentrum veenhage',
            'wonzorgcentrum veenhage': 'woonzorgcentrum veenhage',
            'wijkcentrum keijzershof': 'welzijnscentrum keijzershof'}.get(key, key)


def kern_from_postcode(pc):
    if pc[:4] in ('2631', '2632'):
        return 'Nootdorp'
    if pc.startswith('2645'):
        return 'Delfgauw'
    if pc[:4] in ('2641', '2642', '2643'):
        return 'Pijnacker'
    return None


def load_locations():
    locations = json.loads((SOURCE_ROOT / 'config/locaties.json').read_text(encoding='utf-8'))
    ids, postcodes, aliases = set(), set(), set()
    for location in locations:
        sid, pc = location['id'], location.get('postcode')
        if sid in ids or (pc and pc in postcodes):
            raise ValueError(f'Dubbele ID of postcode in locatieregister: {sid}')
        ids.add(sid)
        if pc:
            postcodes.add(pc)
            if location.get('kern') != kern_from_postcode(pc):
                raise ValueError(f'Kern en postcode verschillen voor locatie {sid}')
        for alias in location.get('aliases', []):
            if alias in aliases:
                raise ValueError('Dubbele expliciete locatiealias: ' + alias)
            aliases.add(alias)
    return locations


def location_key(row):
    return postcode(row['naam']) or canon(row['naam'])


def location_index(locations):
    candidates = {}
    for location in locations:
        for key in [location.get('postcode'), canon(location['naam']), *location.get('aliases', [])]:
            if key:
                candidates.setdefault(key, {})[location['id']] = location
    # Een naam kan bij meerdere adressen horen; alleen ondubbelzinnige sleutels gebruiken.
    result = {key: next(iter(matches.values())) for key, matches in candidates.items() if len(matches) == 1}
    for location in locations:
        for alias in location.get('aliases', []):
            result[alias] = location
    return result


def validate_totals(results, references):
    totals = {}
    for row in results:
        key = row['soort'] + str(row['jaar'])
        total = totals.setdefault(key, {'vvd': 0, 'geldig': 0})
        for field in total:
            total[field] += row[field]
    for key, total in totals.items():
        if key in references and total != references[key]:
            raise ValueError(f'Integriteitscheck mislukt voor {key}: {total} != {references[key]}')
    return totals
