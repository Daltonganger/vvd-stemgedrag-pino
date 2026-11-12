#!/usr/bin/env python3
"""#21 — Tweede geocode-poging voor locaties zonder coördinaat in data/stembureaus.js.
Probeert extra naamvarianten (zonder 'Basisschool'/'Sportzaal', met kern-naam erachter,
kale kern-naam) via de PDOK Locatieserver. Weigert gemeente/woonplaats-treffers.
Gebruik:  python3 scripts/geocode_retry.py"""
import json, os, re, sys, time, urllib.request, urllib.parse

from common import SOURCE_ROOT, load_locations
from common import ROOT as OUTPUT_ROOT
ROOT = str(OUTPUT_ROOT)
KERNEN = ["Pijnacker", "Nootdorp", "Delfgauw"]

# Ruime zoekrechthoek rond PiNo; dit is geen echte gemeentegrenscontrole.
BBOX = (51.955, 4.155, 52.085, 4.695)   # minlat, minlon, maxlat, maxlon

def geocode(q):
    base = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=5&fl=centroide_ll,type,weergavenaam&q="
    try:
        d = json.load(urllib.request.urlopen(base + urllib.parse.quote(q), timeout=30))
        for doc in d.get("response", {}).get("docs", []):
            if doc.get("type") in ("gemeente", "woonplaats", "provincie"):
                continue
            m = re.search(r"POINT\(([\d.]+) ([\d.]+)\)", doc["centroide_ll"])
            if not m:
                continue
            lat, lon = round(float(m.group(2)), 5), round(float(m.group(1)), 5)
            if BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]:
                return lat, lon
    except Exception as e:
        print("  geocode-fout:", q, e, file=sys.stderr)
    return None

def varianten(naam):
    """Extra zoektermen uit een kale stembureaunaam."""
    n = naam
    out = []
    for kern in KERNEN:
        out.append(f"{n}, {kern}")
        # zonder voorvoegsels als Basisschool/Sportzaal/Wooncentrum
        stripped = re.sub(r"^(Basisschool|OBS|Sportzaal|Sportcomplex|Wooncentrum|CulturA|Kantine|Infocentrum|Hoofdgebouw|Soc\.? ?cult\.? ?centrum|Sociaal Cultureel centrum|Gemeentelijk servicepunt)\s+", "", n, flags=re.I).strip()
        if stripped and stripped != n:
            out.append(f"{stripped}, {kern}")
        out.append(f"{n} {kern}")
    return out

def main():
    path = SOURCE_ROOT / "config/locaties.json"
    sb = load_locations()
    targets = [s for s in sb if not s.get("lat") and not s.get("mobiel")]
    print(f"{len(targets)} locaties zonder coördinaat", file=sys.stderr)
    updated = 0
    for s in targets:
        for q in varianten(s["naam"]):
            ll = geocode(q)
            if ll:
                s["lat"], s["lon"] = ll
                updated += 1
                print(f"  {s['id']} {s['naam'][:35]:35} <- {q}  {ll[0]},{ll[1]}", file=sys.stderr)
                break
            time.sleep(0.15)
        else:
            print(f"  {s['id']} {s['naam'][:35]:35} -> geen adres gevonden (blijft tabel-only)", file=sys.stderr)
    if updated:
        with open(path, "w") as f:
            f.write(json.dumps(sb, ensure_ascii=False, indent=2) + "\n")
    print(f"{updated}/{len(targets)} locaties geüpdatet", file=sys.stderr)

if __name__ == "__main__":
    main()
