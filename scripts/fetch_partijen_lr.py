#!/usr/bin/env python3
"""#18 — Haalt de CHES 2024 (Chapel Hill Expert Survey) op en schrijft data/partijen_lr.js:
partijnaam (zoals in de Kiesraad-EML) -> lrgen score (0 = extreem links, 10 = extreem rechts).
Alleen Nederlandse partijen (CHES country=10). Lokale partijen zonder CHES-score ontbreken
expres; de site toont dan de dekking (% stemmen met bekende score).

JA21 zit niet in de CHES-2024-wave; daarvoor de ParlGov left_right 2023 (8.8).
Gebruik:  python3 scripts/fetch_partijen_lr.py"""
import csv, io, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHES_URL = "https://github.com/chesdata/chesdata.github.io/releases/download/ches-europe/CHES_2024_final_v2.csv"
UA = {"User-Agent": "VVD-PijnackerNootdorp-partijposities/1.0"}

# CHES-afkorting -> party-veld in de CHES-csv (country 10 = Nederland)
CHES_KEY = {"VVD": "VVD", "CDA": "CDA", "D66": "D66", "PVV": "PVV", "PVD A": "PvdA",
            "GL": "GL", "SP": "SP", "PVDD": "PvdD", "CU": "CU", "SGP": "SGP",
            "DENK": "DENK", "VOLT": "Volt", "NSC": "NSC", "BBB": "BBB", "FVD": "FvD"}
# EML-partijnaam (genormaliseerd) -> CHES-afkorting(en); lijst = gemiddelde (fusielijsten)
ALIAS = {
    "VVD": ["VVD"],
    "CDA": ["CDA"], "CDA - EUROPESE VOLKSPARTIJ": ["CDA"],
    "D66": ["D66"], "DEMOCRATEN 66 (D66)": ["D66"],
    "PVV (PARTIJ VOOR DE VRIJHEID)": ["PVV"],
    "PARTIJ VAN DE ARBEID (P.V.D.A.)": ["PVD A"],
    "GROENLINKS": ["GL"],
    "GROENLINKS / PARTIJ VAN DE ARBEID (PVDA)": ["GL", "PVD A"],
    "PROGRESSIEF PN/P.V.D.A/GROENLINKS": ["GL", "PVD A"],
    "PROGRESSIEF PN / P.V.D.A. / GROENLINKS": ["GL", "PVD A"],
    "PROGRESSIEF PN / GROENLINKS / P.V.D.A.": ["GL", "PVD A"],
    "SP (SOCIALISTISCHE PARTIJ)": ["SP"],
    "PARTIJ VOOR DE DIEREN": ["PVDD"],
    "CHRISTENUNIE": ["CU"], "CHRISTENUNIE-SGP": ["CU", "SGP"],
    "STAATKUNDIG GEREFORMEERDE PARTIJ (SGP)": ["SGP"],
    "DENK": ["DENK"],
    "VOLT": ["VOLT"], "VOLT NEDERLAND": ["VOLT"],
    "NSC": ["NSC"], "NIEUW SOCIAAL CONTRACT": ["NSC"], "NIEUW SOCIAAL CONTRACT (NSC)": ["NSC"],
    "BBB": ["BBB"],
    "FORUM VOOR DEMOCRATIE": ["FVD"],
    "JA21": ["JA21"],
}
EXTRA = {"JA21": 8.8}   # ParlGov left_right 2023 (niet in CHES 2024)

def norm(s):
    return re.sub(r"\s+", " ", s.upper()).strip()

def main():
    raw = urllib.request.urlopen(urllib.request.Request(CHES_URL, headers=UA), timeout=120).read()
    ches = {}
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8"))):
        if row.get("country") == "10" and row.get("lrgen"):
            ches[row["party"]] = float(row["lrgen"])
    out = {}
    for naam, abbrevs in ALIAS.items():
        scores = []
        for a in abbrevs:
            key = CHES_KEY.get(a, a)
            if key in ches:
                scores.append(ches[key])
            elif a in EXTRA:
                scores.append(EXTRA[a])
            else:
                print(f"  ! geen CHES-score voor {a} ({naam})", file=sys.stderr)
        if scores:
            out[norm(naam)] = round(sum(scores) / len(scores), 2)
    header = ("/* Partij-posities links/rechts (lrgen, 0=links t/m 10=rechts) — CHES 2024 (country NL),\n"
              "   gegenereerd door scripts/fetch_partijen_lr.py. JA21 via ParlGov 2023. Lokale partijen\n"
              "   zonder score ontbreken expres; app.js toont dan de dekking. Niet handmatig bewerken. */\n")
    dest = os.path.join(ROOT, "data", "partijen_lr.js")
    with open(dest, "w") as f:
        f.write(header + "const PARTIJEN_LR = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    print(f"geschreven {dest}: {len(out)} partijen", file=sys.stderr)
    for k in sorted(out, key=lambda k: out[k]):
        print(f"  {out[k]:5.2f}  {k}", file=sys.stderr)

if __name__ == "__main__":
    main()
