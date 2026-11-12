#!/usr/bin/env python3
"""#23 — Handmatig opgezochte adressen voor de stemlocaties zonder (betrouwbaar) coördinaat.
Adressen handmatig geverifieerd via officiele bronnen (gemeente Pijnacker-Nootdorp
processen-verbaal PDFs, cultuuraenzo.nl, ipsedebruggen.nl, opendi.nl, delftopzondag.nl,
telstar-online.nl, AD.nl). Coördinaten via PDOK op het exacte adres; alles binnen de
gemeentegrens-bbox gevalideerd.
Gebruik:  python3 scripts/geocode_handmatig.py"""
import json, os, re, sys, time, urllib.request, urllib.parse

from common import SOURCE_ROOT, load_locations
from common import ROOT as OUTPUT_ROOT
ROOT = str(OUTPUT_ROOT)
BBOX = (51.955, 4.155, 52.085, 4.695)   # zelfde als geocode_retry.py / app.js maxBounds

# id in data/stembureaus.js -> (adres-zoekterm, bron-opmerking)
HANDMATIG = {
    "42": ("Dorpstraat 7, 2631 CR Nootdorp", "CulturA & Zo, Dorpstraat 7 Nootdorp (culturaenzo.nl)"),
    "43": ("Hoefbladplein 1, 2643 KD Pijnacker", "Infocentrum Keijzershof = Winkelcentrum Keijzershof, Hoefbladplein (SBI-register: ondernemersver. Hoefbladplein 13; OSM/cartogiraffe)"),
    "45": ("Raadhuisplein, Pijnacker", "Sociaal Cultureel Centrum = voormalig Rabobank-kantoor Raadhuisplein Pijnacker (AD/gemeente)"),
    "48": ("Meesterstraat 3, Pijnacker", "Stichting Ipse de Bruggen, Meesterstraat 3 (SBI-register gemeente)"),
    "49": ("Gantellaan 1, 2642 JK Pijnacker", "Infocentrum Tolhek = Wijkcentrum Tolhek, Gantellaan 1 (PV stembureau 10 WS2023)"),
    "51": ("Raadhuisplein, Pijnacker", "Soc cult centrum = zelfde SCC Raadhuisplein (alias van #45)"),
    "52": ("Gantellaan 1, 2642 JK Pijnacker", "Sportzaal = gymzaal Wijkcentrum Tolhek, Gantellaan 1 (gtv-fleks.nl)"),
    "55": ("Oranjelaan 2, 2641 JK Pijnacker", "Wooncentrum 't Hofland, Oranjelaan 2 (opendi.nl)"),
    "56": ("Meidoornlaan, Pijnacker", "'t Prinsesje = kerkplein Meidoornlaan Pijnacker, SKOP (telstar-online 2019)"),
    "58": ("Noordweg / Sportlaan, Pijnacker", "Sportcomplex De Viergang, hoek Noordweg-Sportlaan (delftopzondag.nl)"),
    # controle/correctie van generieke PDOK-treffers:
    "44": ("Klapwijkseweg, Pijnacker", "Kantine Meersma aan de Klapwijkseweg (AD 2023) — exacte huisnr. onbekend"),
    "46": ("Raadhuisplein, Pijnacker", "Gemeentelijk servicepunt = gemeentehuis Raadhuisplein"),
    "54": ("Oranjelaan 2, 2641 JK Pijnacker", "Wooncentrum = 't Hofland Oranjelaan 2 (zelfde als #55)"),
}

def geocode_adres(q):
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
                return lat, lon, doc.get("weergavenaam", "")
    except Exception as e:
        print("  geocode-fout:", q, e, file=sys.stderr)
    return None

def main():
    path = SOURCE_ROOT / "config/locaties.json"
    sb = load_locations()
    updated = 0
    for srow in sb:
        sid = srow["id"]
        if sid not in HANDMATIG:
            continue
        q, bron = HANDMATIG[sid]
        res = geocode_adres(q)
        if res:
            lat, lon, weer = res
            srow["lat"], srow["lon"] = lat, lon
            srow["bron"] = bron
            updated += 1
            print(f"  {sid} {srow['naam'][:32]:32} <- {q}  {lat},{lon}  ({weer[:40]})  [{bron[:50]}]", file=sys.stderr)
        else:
            print(f"  {sid} {srow['naam'][:32]:32} -> GEEN adres binnen grens voor '{q}' (blijft tabel-only)  [{bron[:50]}]", file=sys.stderr)
        time.sleep(0.15)
    if updated:
        with open(path, "w") as f:
            f.write(json.dumps(sb, ensure_ascii=False, indent=2) + "\n")
    print(f"{updated} locaties handmatig gelokaliseerd", file=sys.stderr)

if __name__ == "__main__":
    main()
