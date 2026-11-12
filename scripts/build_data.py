#!/usr/bin/env python3
"""Bouw uitslagen met blijvende locatie-ID's; valideer alles vóór uitvoer.

Locaties en handmatige correcties staan in config/locaties.json. Een onbekende
locatie moet daar eerst worden gecontroleerd en toegevoegd; er wordt nooit
stilzwijgend opnieuw genummerd of op een generieke geocode-treffer vertrouwd.
"""
import collections
import datetime
import json
from common import (ROOT, RAW_DIR, location_index, location_key,
                    load_locations, validate_totals, write_js, read_js)


def build(rows, locations, candidates, references, expected):
    lookup = location_index(locations)
    aggregates = {}
    for row in rows:
        key = location_key(row)
        if key not in lookup:
            raise ValueError(f'Onbekende locatie: {row["naam"]}. Voeg toe aan config/locaties.json.')
        sid = lookup[key]['id']
        key = (sid, row['soort'], row['jaar'])
        a = aggregates.setdefault(key, {'vvd': 0, 'geldig': 0, 'uitgebracht': 0, 'kiesg': 0,
                                       'partijen': collections.Counter(), 'vk': collections.Counter()})
        for field in ('vvd', 'geldig'):
            a[field] += row[field]
        for field in ('uitgebracht', 'kiesg'):
            value = row.get(field)
            if field == 'uitgebracht' and value == 0 and row['geldig'] > 0:
                value = None
            if value is None or a[field] is None:
                a[field] = None
            else:
                a[field] += value
        parties = dict(row.get('partijen') or {})
        missing = row['geldig'] - sum(parties.values())
        if missing < 0:
            raise ValueError(f'Partijsom groter dan geldig: {sid}')
        if missing:
            if (row['soort'], row['jaar']) != ('TK', 2010):
                raise ValueError(f'Partijsom kleiner dan geldig: {sid}')
            # De oude TK2010-cache liet onbenoemde lijsten weg. Houd deze rest expliciet onbekend.
            parties['Niet uitgesplitst in broncache'] = missing
        a['partijen'].update(parties)
        a['vk'].update(row.get('vk') or {})
    results = []
    for (sid, kind, year), aggregate in sorted(aggregates.items()):
        row = {'sb': sid, 'soort': kind, 'jaar': year, **aggregate}
        row['partijen'] = sorted(aggregate['partijen'].items(), key=lambda p: -p[1])
        row['vk'] = sorted(aggregate['vk'].items(), key=lambda p: -p[1])
        if not row['vk']:
            del row['vk']
        results.append(row)
    totals = validate_totals(results, references)
    if set(totals) != set(expected):
        raise ValueError(f'Onvolledige verkiezingsset: {sorted(totals)}; verwacht {sorted(expected)}')
    verified = sorted(set(totals) & references.keys())
    meta = {'bijgewerkt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'verkiezingen': sorted(totals), 'geverifieerd': verified,
            'controle': f'ok ({len(verified)}/{len(totals)} totalen kloppen)'}
    used = {row['sb'] for row in results}
    stations = [{k: v for k, v in location.items() if k not in ('aliases', 'bron')}
                for location in locations if location['id'] in used]
    return stations, results, candidates, meta


def main():
    rows = json.loads((RAW_DIR / 'all_rows.json').read_text())
    candidates = json.loads((RAW_DIR / 'kandidaten.json').read_text())
    references = json.loads((RAW_DIR / 'totalen.json').read_text())
    # Geen ontbrekende verkiezing stilzwijgend laten verdwijnen, ook bij een losse build.
    from harvest import DATASETS
    expected = {kind + str(year) for _, kind, year in DATASETS}
    if (ROOT / 'data/meta.js').exists():
        expected.update(read_js(ROOT / 'data/meta.js', 'META')['verkiezingen'])
    output = build(rows, load_locations(), candidates, references, expected)
    for name, variable, value in zip(('stembureaus', 'uitslagen', 'kandidaten', 'meta'),
                                     ('STEMBUREAUS', 'UITSLAGEN', 'KANDIDATEN', 'META'), output):
        write_js(ROOT / 'data' / (name + '.js'), variable, value)
    print(f'{len(output[1])} uitslagen gecontroleerd en geschreven naar {ROOT / "data"}')


if __name__ == '__main__':
    main()
