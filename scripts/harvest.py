#!/usr/bin/env python3
"""Haalt officiële Kiesraad EML per verkiezing op (data.overheid.nl),
extraheert de Telling van Pijnacker-Nootdorp en verzamelt VVD + geldige stemmen
per stembureau. Schrijft /tmp/all_rows.json."""
import urllib.request, urllib.parse, json, io, zipfile, re, sys, time
from common import RAW_DIR

def fetch_url(url, timeout=300, tries_per_url=4):
    """Encodeer het pad één keer; probeer iedere unieke URL maximaal tries_per_url keer."""
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(parts.path), safe="/")
    enc = urllib.parse.urlunsplit(parts._replace(path=path))
    last = None
    for candidate in dict.fromkeys((enc, url)):
        for i in range(tries_per_url):
            try:
                return urllib.request.urlopen(urllib.request.Request(candidate, headers=UA), timeout=timeout).read()
            except Exception as e:
                last = e
                print(f"   retry {i+1}/{tries_per_url} ({e})", file=sys.stderr)
                time.sleep(2 * (i + 1))
    raise last
import xml.etree.ElementTree as ET

UA = {"User-Agent": "Mozilla/5.0 (VVD-PijnackerNootdorp-harvest)"}

def fetch(url, timeout=300, tries=4):
    """Robuust ophalen: data.overheid.nl geeft regelmatig transient 503's. Een paar
    retries met backoff voorkomt dat een hap'rende server bestaande data uit de build gooit."""
    last = None
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as e:
            last = e
            print(f"   retry {i+1}/{tries} ({e})", file=sys.stderr)
            time.sleep(2 * (i + 1))
    raise last

DATASETS = [
    ("verkiezingsuitslagen-gemeenteraad-2026", "GR", 2026),
    ("verkiezingsuitslagen-gemeenteraad-2022", "GR", 2022),
    ("verkiezingsuitslagen-gemeenteraad-2018", "GR", 2018),
    ("verkiezingsuitslag-tweede-kamer-2025",   "TK", 2025),
    ("verkiezingsuitslag-tweede-kamer-2023",   "TK", 2023),
    ("verkiezingsuitslag-tweede-kamer-2021",   "TK", 2021),
    ("verkiezingsuitslag-tweede-kamer-2017",   "TK", 2017),
    ("verkiezingsuitslag-tweede-kamer-2012",   "TK", 2012),
    ("verkiezingsuitslag-tweede-kamer-2010",   "TK", 2010),
    ("verkiezingsuitslag-provinciale-staten-2023", "PS", 2023),
    ("verkiezingsuitslag-provinciale-staten-2019", "PS", 2019),
    ("verkiezingsuitslag-provinciale-staten-2015", "PS", 2015),
    ("verkiezingsuitslag-europees-parlement-2024", "EP", 2024),
    ("verkiezingsuitslag-europees-parlement-2019", "EP", 2019),
    ("verkiezingsuitslag-van-het-europees-parlement-2014", "EP", 2014),
    ("verkiezingsuitslagen-europees-parlement-2009",       "EP", 2009),
    ("verkiezingsuitslagen-gemeenteraad-2014",     "GR", 2014),
]

# #19: directe ZIP-URLs voor oudere verkiezingen (data.overheid.nl CKAN). candidate_zips()
# vinden deze via package_show al, maar de legacy-host (/OpenDataSets/) gaf 503's;
# deze expliciete lijst is stabieler en slaat de API-lookup over.
DIRECT_ZIPS = {
    # TK2017 heeft géén per-stembureau EML voor Pijnacker-Nootdorp (staat in Gemeente_overige);
    # die parse je via parse_tk2017_csv() hieronder.
    ("TK", 2017): "https://data.overheid.nl/sites/default/files/dataset/5f636036-1634-4c7b-8ac9-8c0b4995ff4d/resources/Dataset_TK2017.zip",
    ("TK", 2012): "https://data.overheid.nl/sites/default/files/dataset/31362154-3866-407d-97fd-96c9dc2639bc/resources/EML_bestanden_TK2012.zip",
    ("TK", 2010): "https://data.overheid.nl/sites/default/files/dataset/fbf2c39e-b3c8-40c1-b52a-ba5c6b26cf1a/resources/EML_bestanden_TK2010.zip",
    ("PS", 2019): "https://data.overheid.nl/sites/default/files/dataset/8e85a43e-1d53-4e3a-a315-2c8b4b8cc333/resources/EMLbestandenPS2019.zip",
    ("PS", 2015): "https://data.overheid.nl/sites/default/files/dataset/5a1087ee-c3b8-4a6c-b40e-b24973d94d4e/resources/EML_bestanden_PS2015.zip",
    ("EP", 2019): "https://data.overheid.nl/sites/default/files/dataset/2648b2ac-c254-4e63-9fe3-a3868acd919c/resources/EMLbestandenEP2019.zip",
    ("EP", 2014): "https://data.overheid.nl/sites/default/files/dataset/58f9ad84-ee16-467e-ac89-4ca0747f5747/resources/EML_bestanden_EP2014.zip",
    ("EP", 2009): "https://data.overheid.nl/sites/default/files/dataset/199da59f-ffb6-4ef0-9f21-0373cbc0df2e/resources/EML_bestanden_EP2009.zip",
    # Meerdere zips per verkiezing: de eerste met de Pijnacker-Telling wordt voor de telling
    # gebruikt; ALLE zips worden gescand op een Kandidatenlijst (zit vaak in een ander deel).
    ("TK", 2021): [
        "https://data.overheid.nl/sites/default/files/dataset/39e9bad4-4667-453f-ba6a-4733a956f6f8/resources/EML_bestanden_TK2021_deel_1.zip",
        "https://data.overheid.nl/sites/default/files/dataset/39e9bad4-4667-453f-ba6a-4733a956f6f8/resources/EML_bestanden_TK2021_deel_2.zip",
        "https://data.overheid.nl/sites/default/files/dataset/39e9bad4-4667-453f-ba6a-4733a956f6f8/resources/EML_bestanden_TK2021_deel_3.zip",
    ],
    ("PS", 2023): [
        "https://data.overheid.nl/sites/default/files/dataset/be8b7869-4a12-4446-abab-5cd0a436dc4f/resources/EML_bestanden_PS2023_deel_1.zip",
        "https://data.overheid.nl/sites/default/files/dataset/be8b7869-4a12-4446-abab-5cd0a436dc4f/resources/EML_bestanden_PS2023_deel_2.zip",
        "https://data.overheid.nl/sites/default/files/dataset/be8b7869-4a12-4446-abab-5cd0a436dc4f/resources/EML_bestanden_PS2023_deel_3.zip",
    ],
    ("EP", 2024): [
        "https://data.overheid.nl/sites/default/files/dataset/050597d1-bee3-46e8-bca0-a4a8d0589a2e/resources/Verkiezingsuitslag%20Europees%20Parlement%202024%20%28Deel%201%29.zip",
        "https://data.overheid.nl/sites/default/files/dataset/050597d1-bee3-46e8-bca0-a4a8d0589a2e/resources/Verkiezingsuitslag%20Europees%20Parlement%202024%20%28Deel%202%29.zip",
        "https://data.overheid.nl/sites/default/files/dataset/050597d1-bee3-46e8-bca0-a4a8d0589a2e/resources/Verkiezingsuitslag%20Europees%20Parlement%202024%20%28Deel%203%29.zip",
    ],
}

def local(t): return t.rsplit('}', 1)[-1]

def get_json(url):
    return json.loads(fetch(url, timeout=60))

def candidate_zips(dsid):
    r = get_json("https://data.overheid.nl/data/api/3/action/package_show?id=" + dsid)
    res = r["result"]["resources"]
    cands = []
    for x in res:
        url = x.get("url", "")
        name = (x.get("name") or "")
        low = (name + " " + url).lower()
        if not url.lower().endswith(".zip"):
            continue
        if any(s in low for s in ("csv", "kandidaten", "definitie")):
            continue
        cands.append(url)
    return cands

def telling_xml_from_zip(zbytes):
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    namen = zf.namelist()
    # 1) expliciete Pijnacker-Nootdorp (werkt voor 2009-2026)
    for n in namen:
        ln = n.lower()
        if "telling" in ln and "totaal" not in ln and ("pijnacker" in ln or "1926" in ln) and n.endswith(".xml"):
            return zf.read(n)
    # 2) TK2017-stijl: 'Telling_TK2017_gemeente_<Naam>.eml.xml' zonder gemeentecode in de naam
    for n in namen:
        if re.search(r"telling_\w+_gemeente_pijnacker.?nootdorp\.eml\.xml$", n.lower()):
            return zf.read(n)
    return None


def totaal_from_zip(zbytes):
    """Officieel gemeentetotaal (VVD + geldig) uit de Totaaltelling — referentie voor de integriteitscheck."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    namen = zf.namelist()
    target = next((n for n in namen if "totaaltelling" in n.lower()
                   and ("pijnacker" in n.lower() or "nootdorp" in n.lower() or "1926" in n.lower())
                   and n.endswith(".xml")), None)
    if not target:  # TK2017-stijl: 'Totaaltelling_TK2017_gemeente_Pijnacker-Nootdorp.eml.xml'
        target = next((n for n in namen
                       if re.search(r"totaaltelling_\w+_gemeente_pijnacker.?nootdorp\.eml\.xml$", n.lower())), None)
    if not target:
        return None
    root = ET.fromstring(zf.read(target))   # gooit bij ongeldige XML; geeft nooit None
    tv = next((r for r in root.iter() if local(r.tag) == "TotalVotes"), None)
    if tv is None:
        return None
    vvd = geldig = 0
    for sel in tv:
        if local(sel.tag) != "Selection":
            continue
        aff = next((x for x in sel if local(x.tag) == "AffiliationIdentifier"), None)
        if aff is None:
            continue
        vv = next((int(x.text) for x in sel if local(x.tag) == "ValidVotes"), 0)
        geldig += vv
        rn = next((y for y in aff.iter() if local(y.tag) == "RegisteredName"), None)
        if rn is not None and (rn.text or "").upper().startswith("VVD"):
            vvd = vv
    return {"vvd": vvd, "geldig": geldig}

def totaal_from_telling(zbytes):
    """#22 — Referentie-totaal afgeleid UIT de gemeente-telling zelf (som over alle
    ReportingUnitVotes), voor zips zonder aparte Totaaltelling. Geeft None als er geen
    Pijnacker-telling in zit."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    n = next((n for n in zf.namelist() if "telling" in n.lower() and "totaal" not in n.lower()
              and ("pijnacker" in n.lower() or "nootdorp" in n.lower() or "1926" in n.lower())
              and n.endswith(".xml")), None)
    if not n:
        return None
    root = ET.fromstring(zf.read(n))
    vvd = geldig = 0
    # #22: som per-stembureau = som over alle ReportingUnitVotes ZONDER geneste RU-kinderen.
    # De gemeente-telling heeft platte RU's (22 stuks, elk ~1031 Selection-regels: partijen
    # + kandidaten). Candidate-Selection-regels (zonder AffiliationIdentifier) tellen niet
    # mee in 'geldig'; alleen partij-regels doen dat.
    for ru in root.iter():
        if local(ru.tag) != "ReportingUnitVotes":
            continue
        if any(local(a.tag) == "ReportingUnitVotes" for a in ru):
            continue  # gemeente-totaal-laag (als die al aanwezig is) — tel de bladeren
        for sel in ru:
            if local(sel.tag) != "Selection":
                continue
            aff = next((x for x in sel if local(x.tag) == "AffiliationIdentifier"), None)
            vv = next((int(x.text) for x in sel if local(x.tag) == "ValidVotes"), 0)
            if aff is not None:
                geldig += vv
                rn = next((y for y in aff.iter() if local(y.tag) == "RegisteredName"), None)
                if rn is not None and (rn.text or "").upper().startswith("VVD"):
                    vvd += vv   # += : er kunnen meerdere VVD-lijst-regels zijn (fusies)
    return {"vvd": vvd, "geldig": geldig} if geldig else None


def parse_telling(xml_bytes, soort, jaar):
    root = ET.fromstring(xml_bytes)
    rows = []
    for ru in root.iter():
        if local(ru.tag) != "ReportingUnitVotes":
            continue
        naam = None
        uitgebracht = kiesg = None
        for c in ru:
            t = local(c.tag)
            if t == "ReportingUnitIdentifier":
                naam = (c.text or "").strip()
            elif t == "Cast":                      # = aantal kiesgerechtigden (gemeente-niveau klopt)
                kiesg = int((c.text or "0").strip() or 0)
            elif t == "UncountedVotes" and "toegelaten" in c.attrib.get("ReasonCode", "").lower():
                uitgebracht = int((c.text or "0").strip() or 0)   # opkomst = uitgebrachte stemmen
        vvd, geldig, partijen, vk = 0, 0, {}, {}
        in_vvd = False
        for sel in ru:
            if local(sel.tag) != "Selection":
                continue
            aff = next((x for x in sel if local(x.tag) == "AffiliationIdentifier"), None)
            vv = next((int(x.text) for x in sel if local(x.tag) == "ValidVotes"), 0)
            if aff is not None:                       # partij-regel
                geldig += vv
                rn = next((y for y in aff.iter() if local(y.tag) == "RegisteredName"), None)
                regname = (rn.text or "").strip() if rn is not None else ""
                if not regname:
                    regname = "Lijst zonder geregistreerde naam (" + aff.attrib.get("Id", "?") + ")"
                if regname:
                    partijen[regname] = partijen.get(regname, 0) + vv
                in_vvd = regname.upper().startswith("VVD")
                if in_vvd:
                    vvd = vv
            elif in_vvd and vv > 0:                   # kandidaat-regel binnen de VVD (voorkeurstemmen)
                ci = next((x for x in sel.iter() if local(x.tag) == "CandidateIdentifier"), None)
                nr = ci.attrib.get("Id") if ci is not None else None
                if nr:
                    vk[nr] = vk.get(nr, 0) + vv
        if naam:
            rows.append({"naam": naam, "soort": soort, "jaar": jaar, "vvd": vvd, "geldig": geldig,
                         "uitgebracht": uitgebracht, "kiesg": kiesg, "partijen": partijen, "vk": vk})
    return rows


def parse_tk2017_csv(zbytes):
    """TK2017: Pijnacker-Nootdorp leverde géén EML per stembureau, maar een CSV
    ('Gemeente_overige_uitslagen/Pijnacker-Nootdorp Totaaluitslag__Stemmen.csv') met
    per stembureau een kolom per lijstnummer. Lijstnr->partijnaam komt uit de
    Kandidatenlijsten van kieskring Leiden (lijstnr 1 = VVD in TK2017)."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    kl = next(n for n in zf.namelist() if n.endswith("Kandidatenlijsten_TK2017_Leiden.eml.xml"))
    root = ET.fromstring(zf.read(kl))
    lijst = {}
    for aff in root.iter():
        if local(aff.tag) != "Affiliation":
            continue
        rn = next((y.text for y in aff.iter() if local(y.tag) == "RegisteredName"), "")
        ai = next((y for y in aff.iter() if local(y.tag) == "AffiliationIdentifier"), None)
        nr = ai.attrib.get("Id") if ai is not None else None
        if nr and rn:
            lijst[nr] = rn.strip()
    csvname = next(n for n in zf.namelist() if "totaaluitslag__stemmen.csv" in n.lower() and "pijnacker" in n.lower())
    import csv as _csv
    rows = list(_csv.reader(io.StringIO(zf.read(csvname).decode("utf-8-sig"))))
    hdr = [h.strip() for h in rows[0]]
    liijsten = {h.split()[-1]: h for h in hdr if h.lower().startswith("lijstnr")}
    i_uitgebr = hdr.index("Uitgebrachte stemmen")
    i_kiesg = hdr.index("Aantal kiezers")
    out = []
    for r in rows[1:]:
        if not r or not r[1].strip() or r[1].strip().lower() in ("totaal", "totaaluitslag"):
            continue  # de CSV heeft een afsluitende 'Totaal'-regel — die telt dubbel mee
        partijen = {}
        for nr, col in liijsten.items():
            v = int(r[hdr.index(col)] or 0)
            if v and nr in lijst:
                partijen[lijst[nr]] = v
        vvd = partijen.get("VVD", 0)
        # ponytail: CSV-kolom "Geldige stemmen" telt ook blanco/ongeldig mee die niet
        # aan een lijst hangen; de echte geldige-stemmen-som = som van de partij-kolommen.
        geldig = sum(partijen.values())
        out.append({"naam": r[1].strip(), "soort": "TK", "jaar": 2017, "vvd": vvd, "geldig": geldig,
                    "uitgebracht": int(r[i_uitgebr] or 0), "kiesg": int(r[i_kiesg] or 0),
                    "partijen": partijen, "vk": {}})
    return out, lijst


def kandidaten_from_zip(zbytes, soort):
    """VVD-kandidaatnamen (nummer -> 'Naam (woonplaats)') uit de Kandidatenlijsten-EML in dezelfde ZIP.
    Bij PS/TK zit de lijst van Zuid-Holland (Pijnacker-Nootdorp) in een genestelde map; bij GR/EP
    volstaat elke Kandidatenlijst met Pijnacker in de naam (EP2024 heeft één landelijke lijst)."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    namen = zf.namelist()
    if soort == "PS":
        target = next((n for n in namen if "kandidatenlijst" in n.lower() and "zuidholland" in n.lower()
                       and "leiden" in n.lower() and n.lower().endswith(".xml")), None) \
            or next((n for n in namen if "kandidatenlijst" in n.lower() and "zuidholland" in n.lower()
                     and n.lower().endswith(".xml")), None)
    elif soort == "TK":
        target = next((n for n in namen if "kandidatenlijst" in n.lower() and "leiden" in n.lower()
                       and n.lower().endswith(".xml")), None) \
            or next((n for n in namen if "kandidatenlijst" in n.lower() and n.lower().endswith(".xml")), None)
    elif soort == "EP":
        target = next((n for n in namen if "kandidatenlijst" in n.lower() and n.lower().endswith(".xml")), None)
    else:  # GR: gemeente-specifieke lijst
        target = next((n for n in namen if "kandidatenlijst" in n.lower() and n.lower().endswith(".xml")
                       and ("pijnacker" in n.lower() or "1926" in n.lower())), None)
    if not target:
        return {}
    root = ET.fromstring(zf.read(target))
    namen = {}
    for aff in root.iter():
        if local(aff.tag) != "Affiliation":
            continue
        rn = next((y.text for y in aff.iter() if local(y.tag) == "RegisteredName"), "")
        if not (rn or "").upper().startswith("VVD"):
            continue
        for cand in aff.iter():
            if local(cand.tag) != "Candidate":
                continue
            ci = next((x for x in cand.iter() if local(x.tag) == "CandidateIdentifier"), None)
            nr = ci.attrib.get("Id") if ci is not None else None
            if not nr or nr in namen:
                continue
            d = {local(x.tag): (x.text or "") for x in cand.iter()
                 if local(x.tag) in ("FirstName", "NamePrefix", "LastName", "LocalityName")}
            naam = " ".join(p for p in (d.get("FirstName", ""), d.get("NamePrefix", ""), d.get("LastName", "")) if p).strip()
            wp = d.get("LocalityName", "").strip()
            namen[nr] = (naam or ("kandidaat " + nr)) + (f" ({wp})" if wp else "")
        break                                          # eerste VVD-lijst volstaat
    return namen

def main():
    failures = []
    all_rows = []
    kandidaten = {}
    totalen = {}
    for dsid, soort, jaar in DATASETS:
        try:
            zurls = DIRECT_ZIPS[(soort, jaar)] if (soort, jaar) in DIRECT_ZIPS else candidate_zips(dsid)
            if isinstance(zurls, str):
                zurls = [zurls]
            zbytes_list = []          # alle zips bewaren: telling uit de eerste met hit, kandidatenlijst uit álle
            xml = None
            for zurl in zurls:
                print(f".. {soort}{jaar}: probeer {zurl.split('/')[-1][:50]}", file=sys.stderr)
                zb = fetch_url(zurl)
                zbytes_list.append(zb)
                if xml is None:
                    xml = telling_xml_from_zip(zb)
            zbytes = zbytes_list[0]
            if xml is None and (soort, jaar) == ("TK", 2017):
                rows, lijst = parse_tk2017_csv(zbytes)
                tv = sum(r["vvd"] for r in rows); tg = sum(r["geldig"] for r in rows)
                kandidaten[soort + str(jaar)] = {}
                print(f"   -> {len(rows)} stembureaus (CSV), VVD={tv}, geldig={tg}, {100*tv/tg:.1f}%", file=sys.stderr)
                all_rows.extend(rows)
                continue
            if not xml:
                raise ValueError(f"geen Pijnacker Telling in {dsid}")
            rows = parse_telling(xml, soort, jaar)
            tv = sum(r["vvd"] for r in rows); tg = sum(r["geldig"] for r in rows)
            # kandidatenlijst kan in een ANDER zip-deel zitten dan de telling -> scan alle zips
            kand = {}
            for zb in zbytes_list:
                kand = kandidaten_from_zip(zb, soort)
                if kand:
                    break
            kandidaten[soort + str(jaar)] = kand
            ref = None
            for zb in zbytes_list:
                ref = totaal_from_zip(zb)
                if ref:
                    break
            if not ref:  # #22: geen aparte Totaaltelling -> som uit de gemeente-telling zelf
                for zb in zbytes_list:
                    ref = totaal_from_telling(zb)
                    if ref:
                        print(f"   ({soort}{jaar}: referentie = som uit gemeente-telling, geen Totaaltelling)", file=sys.stderr)
                        break
            if ref:
                totalen[soort + str(jaar)] = ref
            print(f"   -> {len(rows)} stembureaus, VVD={tv}, geldig={tg}, {100*tv/tg:.1f}% · {len(kand)} VVD-kandidaten", file=sys.stderr)
            all_rows.extend(rows)
        except Exception as e:
            failures.append(f"{dsid}: {e}")
            print(f"!! fout {dsid}: {e}", file=sys.stderr)

    if failures:
        sys.exit("Ophalen mislukt; bestaande uitvoer behouden:\n" + "\n".join(failures))
    expected = {kind + str(year) for _, kind, year in DATASETS}
    actual = {row['soort'] + str(row['jaar']) for row in all_rows}
    if actual != expected:
        sys.exit(f"Onvolledige harvest: {sorted(actual)} != {sorted(expected)}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, value in [('all_rows', all_rows), ('kandidaten', kandidaten), ('totalen', totalen)]:
        (RAW_DIR / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    print(f"TOTAAL: {len(all_rows)} regels -> {RAW_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
