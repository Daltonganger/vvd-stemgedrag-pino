#!/usr/bin/env python3
"""Maakt data/stembureaus.js en data/uitslagen.js uit /tmp/all_rows.json.
- canonicaliseert stembureau-namen (dag-splitsingen, genummerde bureaus, varianten -> 1 locatie)
- aggregeert VVD + geldige stemmen per locatie per verkiezing
- geocodeert per postcode via PDOK Locatieserver (gratis, officieel NL)."""
import json, re, collections, urllib.request, urllib.parse, time, sys, os

rows = json.load(open("/tmp/all_rows.json"))

def postcode(naam):
    m = re.search(r'(\d{4})\s*([A-Za-z]{2})', naam)
    return (m.group(1) + m.group(2)).upper() if m else ''

def clean(naam):
    """nette weergavenaam zonder ruis (postcode, 'Stembureau', dagen, dubbele spaties)."""
    s = re.sub(r'\(postcode[^)]*\)', '', naam, flags=re.I)
    s = re.sub(r'^\s*stembureau\s*', '', s, flags=re.I)
    s = re.sub(r'\b\d{1,2}[- ]?maart[- ]?2021\b', '', s, flags=re.I)
    s = re.sub(r'\s*\((hoofdlocatie|beperkte toegang)\)', '', s, flags=re.I)
    s = s.replace('"', "'")
    return re.sub(r'\s+', ' ', s).strip(" .-'")

def canon(naam):
    s = clean(naam)
    s = re.sub(r'\([^)]*\)', '', s)                                  # alle haakjes weg
    s = s.replace('&', 'en')
    s = re.sub(r'\b(pijnacker|nootdorp|delfgauw)\b', '', s, flags=re.I)  # plaatsnaam-suffix weg
    key = re.sub(r'\s+', ' ', s).strip(" .-'").lower()
    key = key.replace('sportzaal', 'sporthal')
    key = re.sub(r'kerk(le|el)ijk', 'kerkelijk', key)
    key = key.replace('consutatie', 'consultatie')
    alias = {
        'verzorgingshuis veenhage': 'woonzorgcentrum veenhage',
        'wonzorgcentrum veenhage': 'woonzorgcentrum veenhage',
        'wijkcentrum keijzershof': 'welzijnscentrum keijzershof',
    }
    return alias.get(key, key)

# mobiele/brief/telstations: geen vaste stemlocatie -> niet op kaart
def is_mobiel(key):
    return any(w in key for w in ('brief', 'mobiel', 'voor de telling'))

# #7: clusteren op POSTCODE (stabieler dan de naam over de jaren); zonder postcode -> op naam.
def key_van(r):
    pc = postcode(r['naam'])
    return pc if pc else canon(r['naam'])

best = {}           # key -> (jaar, geldig) van de gekozen weergavenaam (nieuwste/grootste wint)
display = {}        # key -> nette weergavenaam
pcs = collections.defaultdict(collections.Counter)
agg = collections.defaultdict(lambda: {'vvd': 0, 'geldig': 0, 'uitgebracht': 0, 'kiesg': 0,
                                        'partijen': collections.Counter(), 'vk': collections.Counter()})
for r in rows:
    k = key_van(r)
    pc = postcode(r['naam'])
    if pc:
        pcs[k][pc] += 1
    score = (r['jaar'], r['geldig'])                # nieuwste verkiezing (en daarbinnen grootste) bepaalt de naam
    if k not in best or score > best[k]:
        best[k] = score; display[k] = clean(r['naam'])
    a = agg[(k, r['soort'], r['jaar'])]
    a['vvd'] += r['vvd']; a['geldig'] += r['geldig']
    a['uitgebracht'] += r.get('uitgebracht') or 0
    a['kiesg'] += r.get('kiesg') or 0
    a['partijen'].update(r.get('partijen') or {})
    a['vk'].update(r.get('vk') or {})

locs = sorted({k for (k, _, _) in agg})
print(f"{len(locs)} canonieke locaties", file=sys.stderr)

def geocode(pc, naam):
    base = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=centroide_ll&q="
    for q in ([pc] if pc else []) + [naam + ", Pijnacker-Nootdorp"]:
        try:
            u = base + urllib.parse.quote(q)
            d = json.load(urllib.request.urlopen(u, timeout=30))
            docs = d.get("response", {}).get("docs", [])
            if docs:
                m = re.search(r'POINT\(([\d.]+) ([\d.]+)\)', docs[0]["centroide_ll"])
                if m:
                    return round(float(m.group(2)), 5), round(float(m.group(1)), 5)
        except Exception as e:
            print("  geocode-fout:", q, e, file=sys.stderr)
        time.sleep(0.2)
    return None, None

stembureaus, idmap = [], {}
for i, k in enumerate(locs, 1):
    sid = f"{i:02d}"
    idmap[k] = sid
    pc = pcs[k].most_common(1)[0][0] if pcs[k] else ''
    lat = lon = None
    if not is_mobiel(k):
        lat, lon = geocode(pc, display[k])
    stembureaus.append({"id": sid, "naam": display[k], "postcode": pc,
                        "lat": lat, "lon": lon, "mobiel": is_mobiel(k)})
    print(f"  {sid} {display[k][:40]:40} pc={pc:7} {lat},{lon}", file=sys.stderr)

uitslagen = []
for (k, soort, jaar), a in sorted(agg.items(), key=lambda kv: (idmap[kv[0][0]], kv[0][1], kv[0][2])):
    partijen = sorted(a['partijen'].items(), key=lambda x: -x[1])   # alle partijen, hoog->laag
    vk = sorted(((nr, v) for nr, v in a['vk'].items() if v), key=lambda x: -x[1])  # VVD-kandidaten, hoog->laag
    row = {"sb": idmap[k], "soort": soort, "jaar": jaar,
           "vvd": a['vvd'], "geldig": a['geldig'],
           "uitgebracht": a['uitgebracht'], "kiesg": a['kiesg'],
           "partijen": [[naam, v] for naam, v in partijen]}
    if vk:
        row["vk"] = [[nr, v] for nr, v in vk]          # #12: voorkeurstemmen per VVD-kandidaat
    uitslagen.append(row)

# #12: VVD-kandidaatnamen per verkiezing (kandidaatnummer -> naam)
ROOT = "/Users/rubenbeuker/Documents/Stemgedrag PiNo"
kandidaten = json.load(open("/tmp/kandidaten.json")) if os.path.exists("/tmp/kandidaten.json") else {}

os.makedirs(ROOT + "/data", exist_ok=True)
HEADER = ("/* AUTOMATISCH GEGENEREERD uit officiële Kiesraad EML (data.overheid.nl).\n"
          "   Bron-scripts: scripts/harvest.py + scripts/build_data.py. Niet met de hand bewerken;\n"
          "   draai de scripts opnieuw om bij te werken. Zie README.md. */\n")
with open(ROOT + "/data/stembureaus.js", "w") as f:
    f.write(HEADER + "const STEMBUREAUS = " + json.dumps(stembureaus, ensure_ascii=False, indent=1) + ";\n")
with open(ROOT + "/data/uitslagen.js", "w") as f:
    f.write(HEADER + "const UITSLAGEN = " + json.dumps(uitslagen, ensure_ascii=False) + ";\n")
with open(ROOT + "/data/kandidaten.js", "w") as f:
    f.write(HEADER + "const KANDIDATEN = " + json.dumps(kandidaten, ensure_ascii=False) + ";\n")
print(f"geschreven: {len(stembureaus)} stembureaus, {len(uitslagen)} uitslag-regels, "
      f"kandidaten voor {len(kandidaten)} verkiezingen", file=sys.stderr)

# ---- #10: integriteitscheck tegen de officiële gemeentetotalen (Totaaltelling) ----
import datetime
totalen = json.load(open("/tmp/totalen.json")) if os.path.exists("/tmp/totalen.json") else {}
som = collections.defaultdict(lambda: {"vvd": 0, "geldig": 0})
for u in uitslagen:
    e = u["soort"] + str(u["jaar"])
    som[e]["vvd"] += u["vvd"]; som[e]["geldig"] += u["geldig"]
print("== integriteitscheck (eigen som vs. officieel gemeentetotaal) ==", file=sys.stderr)
fouten = 0
for e in sorted(som):
    ref = totalen.get(e)
    if not ref:
        print(f"  {e}: geen referentie (overgeslagen)", file=sys.stderr); continue
    ok = som[e]["vvd"] == ref["vvd"] and som[e]["geldig"] == ref["geldig"]
    fouten += not ok
    print(f"  {e}: VVD {som[e]['vvd']}/{ref['vvd']} · geldig {som[e]['geldig']}/{ref['geldig']}  {'OK' if ok else '!! AFWIJKING'}",
          file=sys.stderr)

# #22: alleen verkiezingen mét referentie zijn echt geverifieerd; de rest is "overgeslagen"
geverifieerd = sorted(e for e in som if e in totalen)
meta = {"bijgewerkt": datetime.date.today().isoformat(),
        "verkiezingen": sorted(som),
        "geverifieerd": geverifieerd,
        "controle": (f"ok ({len(geverifieerd)}/{len(som)} geverifieerd)" if fouten == 0 and geverifieerd
                     else f"{fouten} afwijking(en)")}
with open(ROOT + "/data/meta.js", "w") as f:
    f.write(HEADER + "const META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
if fouten:
    sys.exit(f"INTEGRITEITSCHECK MISLUKT: {fouten} verkiezing(en) wijken af van het officiële totaal.")
print("integriteitscheck OK · data/meta.js geschreven", file=sys.stderr)
