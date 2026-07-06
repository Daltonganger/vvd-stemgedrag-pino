#!/usr/bin/env python3
"""Voegt ÉÉN verkiezing additief toe aan de bestaande data/uitslagen.js + data/meta.js,
zonder de rest te herbouwen. Nodig wanneer een volle `build_data.py`-rebuild riskant is
omdat de bron-host (data.overheid.nl) andere datasets tijdelijk niet levert (503) — een
rebuild zou die dan uit de bestanden gooien.

Mapt de stembureaus van de nieuwe verkiezing op de BESTAANDE locaties in stembureaus.js
(via postcode, met canon-naam als fallback). Breekt af als er een stembureau niet te
plaatsen is (dat zou een nieuwe locatie zijn → dan hoort een volle rebuild, niet dit).

Gebruik:  python3 scripts/merge_election.py EP 2024     (leest /tmp/all_rows.json)
"""
import json, re, sys, collections, os, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
soort, jaar = sys.argv[1], int(sys.argv[2])

# --- canonicalisatie: identiek aan build_data.py (postcode-clustering, #7) ---
def postcode(n):
    m = re.search(r'(\d{4})\s*([A-Za-z]{2})', n)
    return (m.group(1) + m.group(2)).upper() if m else ''

def clean(n):
    s = re.sub(r'\(postcode[^)]*\)', '', n, flags=re.I)
    s = re.sub(r'^\s*stembureau\s*', '', s, flags=re.I)
    s = re.sub(r'\s*\((hoofdlocatie|beperkte toegang)\)', '', s, flags=re.I)
    return re.sub(r'\s+', ' ', s.replace('"', "'")).strip(" .-'")

def canon(n):  # identiek aan build_data.py
    s = re.sub(r'\([^)]*\)', '', clean(n)).replace('&', 'en')
    s = re.sub(r'\b(pijnacker|nootdorp|delfgauw)\b', '', s, flags=re.I)
    key = re.sub(r'\s+', ' ', s).strip(" .-'").lower()
    key = key.replace('sportzaal', 'sporthal')
    key = re.sub(r'kerk(le|el)ijk', 'kerkelijk', key)
    key = key.replace('consutatie', 'consultatie')
    alias = {'verzorgingshuis veenhage': 'woonzorgcentrum veenhage',
             'wonzorgcentrum veenhage': 'woonzorgcentrum veenhage',
             'wijkcentrum keijzershof': 'welzijnscentrum keijzershof'}
    return alias.get(key, key)

def jsobj(path, marker):
    s = open(path).read()
    return json.loads(s[s.index(marker) + len(marker):s.rindex(";")].strip())

HEADER = ("/* AUTOMATISCH GEGENEREERD uit officiële Kiesraad EML (data.overheid.nl).\n"
          "   Bron-scripts: scripts/harvest.py + scripts/build_data.py. Niet met de hand bewerken;\n"
          "   draai de scripts opnieuw om bij te werken. Zie README.md. */\n")

def geocode(pc, naam):  # PDOK Locatieserver; weiger gemeente/woonplaats-treffer (= geen echt adres)
    base = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=centroide_ll,type&q="
    for q in ([pc] if pc else []) + [naam + ", Pijnacker-Nootdorp"]:
        try:
            d = json.load(urllib.request.urlopen(base + urllib.parse.quote(q), timeout=30))
            docs = d.get("response", {}).get("docs", [])
            if docs and docs[0].get("type") not in ("gemeente", "woonplaats", "provincie"):
                m = re.search(r'POINT\(([\d.]+) ([\d.]+)\)', docs[0]["centroide_ll"])
                if m:
                    return round(float(m.group(2)), 5), round(float(m.group(1)), 5)
        except Exception as e:
            print("  geocode-fout:", q, e, file=sys.stderr)
        time.sleep(0.2)
    return None, None                              # geen betrouwbare plek -> alleen in tabel, niet op kaart

stembureaus = jsobj(ROOT + "/data/stembureaus.js", "const STEMBUREAUS =")
pc2id = {x["postcode"]: x["id"] for x in stembureaus if x["postcode"]}
name2id = {canon(x["naam"]): x["id"] for x in stembureaus}

rows = [r for r in json.load(open("/tmp/all_rows.json")) if r["soort"] == soort and r["jaar"] == jaar]
if not rows:
    sys.exit(f"geen ruwe regels voor {soort}{jaar} in /tmp/all_rows.json")

agg = collections.defaultdict(lambda: {"vvd": 0, "geldig": 0, "uitgebracht": 0, "kiesg": 0,
                                       "partijen": collections.Counter(), "vk": collections.Counter()})
disp = {}                                      # nieuwe-locatie-key -> weergavenaam
for r in rows:
    pc = postcode(r["naam"])
    sid = pc2id.get(pc) or name2id.get(canon(r["naam"]))
    k = sid or ("NIEUW", pc or canon(r["naam"]))   # geen match -> nieuwe locatie
    if not sid:
        disp.setdefault(k, clean(r["naam"]))
    a = agg[k]
    a["vvd"] += r["vvd"]; a["geldig"] += r["geldig"]
    a["uitgebracht"] += r.get("uitgebracht") or 0; a["kiesg"] += r.get("kiesg") or 0
    a["partijen"].update(r.get("partijen") or {}); a["vk"].update(r.get("vk") or {})

# nieuwe locaties (verdwenen/hernoemde bureaus uit een ouder jaar) aanmaken + geocoden
nieuwe_keys = [k for k in agg if isinstance(k, tuple)]
if nieuwe_keys:
    maxid = max(int(x["id"]) for x in stembureaus)
    for k in sorted(nieuwe_keys, key=lambda x: disp[x]):
        maxid += 1; sid = f"{maxid:02d}"
        naam = disp[k]; pc = k[1] if re.fullmatch(r'\d{4}[A-Z]{2}', k[1]) else ''
        lat, lon = geocode(pc, naam)
        mobiel = any(w in canon(naam) for w in ('brief', 'mobiel', 'voor de telling'))
        stembureaus.append({"id": sid, "naam": naam, "postcode": pc, "lat": lat, "lon": lon, "mobiel": mobiel})
        agg[sid] = agg.pop(k)                   # hersleutel naar echte id
        print(f"  NIEUWE locatie {sid}: {naam}  pc={pc or '-'}  {lat},{lon}", file=sys.stderr)
    with open(ROOT + "/data/stembureaus.js", "w") as f:
        f.write(HEADER + "const STEMBUREAUS = " + json.dumps(stembureaus, ensure_ascii=False, indent=1) + ";\n")

nieuw = []
for sid, a in sorted(agg.items()):
    row = {"sb": sid, "soort": soort, "jaar": jaar, "vvd": a["vvd"], "geldig": a["geldig"],
           "uitgebracht": a["uitgebracht"], "kiesg": a["kiesg"],
           "partijen": [[n, v] for n, v in sorted(a["partijen"].items(), key=lambda x: -x[1])]}
    vk = sorted(((nr, v) for nr, v in a["vk"].items() if v), key=lambda x: -x[1])
    if vk:
        row["vk"] = [[nr, v] for nr, v in vk]
    nieuw.append(row)

# --- in uitslagen.js splicen (bestaande zelfde verkiezing eerst weg = idempotent) ---
uit = jsobj(ROOT + "/data/uitslagen.js", "const UITSLAGEN =")
uit = [u for u in uit if not (u["soort"] == soort and u["jaar"] == jaar)] + nieuw
with open(ROOT + "/data/uitslagen.js", "w") as f:
    f.write(HEADER + "const UITSLAGEN = " + json.dumps(uit, ensure_ascii=False) + ";\n")

# --- meta.js bijwerken: verkiezing toevoegen + integriteitscheck voor deze verkiezing ---
meta = jsobj(ROOT + "/data/meta.js", "const META =")
eid = soort + str(jaar)
meta["verkiezingen"] = sorted(set(meta["verkiezingen"]) | {eid})
totalen = json.load(open("/tmp/totalen.json")) if os.path.exists("/tmp/totalen.json") else {}
ref = totalen.get(eid)
som_v = sum(r["vvd"] for r in nieuw); som_g = sum(r["geldig"] for r in nieuw)
if ref:
    ok = som_v == ref["vvd"] and som_g == ref["geldig"]
    print(f"integriteitscheck {eid}: VVD {som_v}/{ref['vvd']} · geldig {som_g}/{ref['geldig']}  "
          f"{'OK' if ok else '!! AFWIJKING'}", file=sys.stderr)
    if not ok:
        sys.exit("INTEGRITEITSCHECK MISLUKT — niet geschreven.")
else:
    print(f"integriteitscheck {eid}: geen referentie (overgeslagen)", file=sys.stderr)
with open(ROOT + "/data/meta.js", "w") as f:
    f.write(HEADER + "const META = " + json.dumps(meta, ensure_ascii=False) + ";\n")

print(f"{eid} gemerged: {len(nieuw)} locaties, VVD {som_v}/{som_g} ({100*som_v/som_g:.1f}%). "
      f"verkiezingen nu: {meta['verkiezingen']}", file=sys.stderr)
