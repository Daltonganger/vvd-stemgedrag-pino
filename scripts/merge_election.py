#!/usr/bin/env python3
"""Voeg één volledig gecontroleerde verkiezing toe, met dezelfde locatie-ID's als de rebuild.

Gebruik: python3 scripts/merge_election.py EP 2024
Leest PINO_RAW_DIR (standaard /tmp); schrijft naar PINO_OUTPUT_ROOT of dit project.
"""
import datetime
import json
import sys
from build_data import build
from common import ROOT, RAW_DIR, load_locations, read_js, write_js, validate_totals


def main():
    kind, year = sys.argv[1], int(sys.argv[2])
    election = kind + str(year)
    rows = [r for r in json.loads((RAW_DIR / 'all_rows.json').read_text())
            if r['soort'] == kind and r['jaar'] == year]
    references = json.loads((RAW_DIR / 'totalen.json').read_text())
    candidates = json.loads((RAW_DIR / 'kandidaten.json').read_text())
    stations, new, _, _ = build(rows, load_locations(), candidates, references, {election})
    old = read_js(ROOT / 'data/uitslagen.js', 'UITSLAGEN')
    results = [r for r in old if r['soort'] + str(r['jaar']) != election] + new
    validate_totals(results, references)
    existing_stations = {s['id']: s for s in read_js(ROOT / 'data/stembureaus.js', 'STEMBUREAUS')}
    existing_stations.update({s['id']: s for s in stations})
    existing_candidates = read_js(ROOT / 'data/kandidaten.js', 'KANDIDATEN')
    existing_candidates[election] = candidates.get(election, {})
    meta = read_js(ROOT / 'data/meta.js', 'META')
    meta['verkiezingen'] = sorted(set(meta['verkiezingen']) | {election})
    verified = set(meta.get('geverifieerd', [])) - {election}
    if election in references:
        verified.add(election)
    meta.update(bijgewerkt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                geverifieerd=sorted(verified),
                controle=f'ok ({len(verified)}/{len(meta["verkiezingen"])} totalen kloppen)')
    # Alle controles zijn afgerond voordat het eerste bestand wordt vervangen.
    for name, variable, value in [('stembureaus', 'STEMBUREAUS', list(existing_stations.values())),
                                  ('uitslagen', 'UITSLAGEN', results),
                                  ('kandidaten', 'KANDIDATEN', existing_candidates), ('meta', 'META', meta)]:
        write_js(ROOT / 'data' / (name + '.js'), variable, value)
    print(f'{election}: {len(new)} locaties gecontroleerd toegevoegd')


if __name__ == '__main__':
    main()
