#!/usr/bin/env python3
"""Controleer de publiceerbare dataset en lokale libraries zonder netwerk."""
import base64
import hashlib
import json
from common import ROOT, SOURCE_ROOT, read_js, validate_totals
from harvest import DATASETS


def validate(root=ROOT):
    stations = read_js(root / 'data/stembureaus.js', 'STEMBUREAUS')
    results = read_js(root / 'data/uitslagen.js', 'UITSLAGEN')
    meta = read_js(root / 'data/meta.js', 'META')
    areas = read_js(root / 'data/gebieden.js', 'GEBIEDEN')
    positions = read_js(root / 'data/partijen_lr.js', 'PARTIJEN_LR')
    by_id = {s['id']: s for s in stations}
    assert len(by_id) == len(stations), 'Dubbele locatie-ID'
    keys = [(r['sb'], r['soort'], r['jaar']) for r in results]
    assert len(set(keys)) == len(keys), 'Dubbele uitslag'
    for station in stations:
        if not station['mobiel']:
            assert station.get('kern') in ('Nootdorp', 'Pijnacker', 'Delfgauw'), f'Kern ontbreekt: {station}'
    for row in results:
        assert row['sb'] in by_id, 'Onbekende locatie'
        assert 0 <= row['vvd'] <= row['geldig'] and row['geldig'] > 0, 'Ongeldige telling'
        assert all(isinstance(v, int) and v >= 0 for _, v in row['partijen']), 'Ongeldige partijstemmen'
        assert len({name for name, _ in row['partijen']}) == len(row['partijen']), 'Dubbele partij'
        assert sum(v for _, v in row['partijen']) == row['geldig'], f'Partijsom: {row["sb"]}'
        assert sum(v for name, v in row['partijen'] if name.upper().startswith('VVD')) == row['vvd'], 'VVD-som'
        if 'vk' in row:
            assert sum(v for _, v in row['vk']) == row['vvd'], f'Kandidaatsom: {row["sb"]}'
        # EML-toegelaten kiezers kunnen door officiële telverschillen iets afwijken van stembiljetten.
        assert row['uitgebracht'] is None or row['uitgebracht'] >= 0, 'Negatieve opkomsttelling'
    elections = set(validate_totals(results, {}))
    assert elections == {kind + str(year) for _, kind, year in DATASETS}, 'Onvolledige verkiezingsset'
    assert elections == set(meta['verkiezingen']) == set(areas), 'Metadata/gebieden wijken af'
    assert set(meta['geverifieerd']) <= elections, 'Onbekende geverifieerde verkiezing'
    expected_control = f'ok ({len(meta["geverifieerd"])}/{len(elections)} totalen kloppen)'
    assert meta['controle'] == expected_control, 'Controletekst overschat bronverificatie'
    assert positions and all(0 <= value <= 10 for value in positions.values()), 'Ongeldige partijposities'
    for election, cells in areas.items():
        active = {r['sb'] for r in results if r['soort'] + str(r['jaar']) == election}
        for cell in cells:
            assert cell['sb'] in active, 'Gebied zonder actieve uitslag'
            assert cell['polys'] and all(len(ring) >= 3 for ring in cell['polys']), 'Lege geometrie'
    hashes = json.loads((SOURCE_ROOT / 'config/vendor-sha256.json').read_text())
    html = (SOURCE_ROOT / 'index.html').read_text()
    for file, expected in hashes.items():
        content = (root / file).read_bytes()
        assert hashlib.sha256(content).hexdigest() == expected, f'Library-hash: {file}'
        sri = 'sha384-' + base64.b64encode(hashlib.sha384(content).digest()).decode()
        assert sri in html, f'SRI-hash ontbreekt of wijkt af: {file}'
    return len(stations), len(results), len(elections)


if __name__ == '__main__':
    stations, results, elections = validate()
    print(f'OK: {stations} locaties, {results} uitslagen, {elections} verkiezingen; libraries intact.')
