#!/usr/bin/env python3
"""Haalt officiële Kiesraad EML per verkiezing op (data.overheid.nl),
extraheert de Telling van Pijnacker-Nootdorp en verzamelt VVD + geldige stemmen
per stembureau. Schrijft /tmp/all_rows.json."""
import urllib.request, urllib.parse, json, io, zipfile, re, sys, time
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
    ("verkiezingsuitslag-provinciale-staten-2023", "PS", 2023),
    ("verkiezingsuitslag-europees-parlement-2024", "EP", 2024),
    ("verkiezingsuitslag-europees-parlement-2019", "EP", 2019),  # legacy-host (/OpenDataSets/) — soms 503
    ("verkiezingsuitslagen-gemeenteraad-2014",     "GR", 2014),  # legacy-host (/OpenDataSets/) — soms 503
]

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
    for n in zf.namelist():
        ln = n.lower()
        if "telling" in ln and "totaal" not in ln and ("pijnacker" in ln or "1926" in ln) and n.endswith(".xml"):
            return zf.read(n)
    return None


def totaal_from_zip(zbytes):
    """Officieel gemeentetotaal (VVD + geldig) uit de Totaaltelling — referentie voor de integriteitscheck."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    target = next((n for n in zf.namelist() if "totaaltelling" in n.lower()
                   and ("pijnacker" in n.lower() or "1926" in n.lower()) and n.endswith(".xml")), None)
    if not target:
        return None
    root = ET.fromstring(zf.read(target))
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


def kandidaten_from_zip(zbytes, soort):
    """VVD-kandidaatnamen (nummer -> 'Naam (woonplaats)') uit de Kandidatenlijsten-EML in dezelfde ZIP."""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    target = next((n for n in zf.namelist()
                   if "kandidatenlijst" in n.lower() and n.lower().endswith(".xml")
                   and (soort != "GR" or "pijnacker" in n.lower() or "1926" in n.lower())), None)
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

all_rows = []
kandidaten = {}
totalen = {}
for dsid, soort, jaar in DATASETS:
    try:
        xml = None
        for zurl in candidate_zips(dsid):
            print(f".. {soort}{jaar}: probeer {zurl.split('/')[-1][:50]}", file=sys.stderr)
            zbytes = fetch(zurl)
            xml = telling_xml_from_zip(zbytes)
            if xml:
                break
        if not xml:
            print(f"!! geen Pijnacker Telling in {dsid}", file=sys.stderr); continue
        rows = parse_telling(xml, soort, jaar)
        tv = sum(r["vvd"] for r in rows); tg = sum(r["geldig"] for r in rows)
        kand = kandidaten_from_zip(zbytes, soort)
        kandidaten[soort + str(jaar)] = kand
        ref = totaal_from_zip(zbytes)
        if ref:
            totalen[soort + str(jaar)] = ref
        print(f"   -> {len(rows)} stembureaus, VVD={tv}, geldig={tg}, {100*tv/tg:.1f}% · {len(kand)} VVD-kandidaten", file=sys.stderr)
        all_rows.extend(rows)
    except Exception as e:
        print(f"!! fout {dsid}: {e}", file=sys.stderr)

json.dump(all_rows, open("/tmp/all_rows.json", "w"), ensure_ascii=False)
json.dump(kandidaten, open("/tmp/kandidaten.json", "w"), ensure_ascii=False)
json.dump(totalen, open("/tmp/totalen.json", "w"), ensure_ascii=False)
print(f"TOTAAL: {len(all_rows)} regels -> /tmp/all_rows.json ; kandidaten + officiële totalen weggeschreven", file=sys.stderr)
