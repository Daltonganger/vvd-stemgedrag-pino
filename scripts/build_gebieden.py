#!/usr/bin/env python3
"""Berekent 'stembureau-gebieden' (Thiessen/Voronoi) PER VERKIEZING, geknipt op de
échte gemeentegrens van Pijnacker-Nootdorp (PDOK). Pure Python (Sutherland-Hodgman).

Per verkiezing tellen alleen de stembureaus mee die in DIE verkiezing bestonden.
Verdwenen bureaus krijgen dus geen vlak; hun gebied wordt automatisch herverdeeld
onder de bureaus die er wél waren. Schrijft data/gebieden.js:
   const GEBIEDEN = { "GR2026": [{sb, polys}], "TK2025": [...], ... };

ponytail: gaten/enclaves in de grens worden genegeerd (PiNo heeft die niet noemenswaardig)."""
import os, re, json, urllib.request, sys

from common import ROOT as OUTPUT_ROOT
ROOT = str(OUTPUT_ROOT)

def laad(var):
    t = open(os.path.join(ROOT, "data", var + ".js")).read()
    return json.loads(re.search(r"const \w+\s*=\s*(\[.*\]);", t, re.S).group(1))

# ---------- gemeentegrens (PDOK, bbox rond PiNo) ----------
def haal_grens():
    base = "https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0"
    q = ("?request=GetFeature&service=WFS&version=2.0.0"
         "&typeName=bestuurlijkegebieden:Gemeentegebied&outputFormat=application/json"
         "&srsName=EPSG:4326&bbox=51.97,4.36,52.07,4.49,urn:ogc:def:crs:EPSG::4326")
    d = json.load(urllib.request.urlopen(base + q, timeout=120))
    feat = next(f for f in d["features"] if f["properties"].get("naam") == "Pijnacker-Nootdorp")
    g = feat["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = []
    for poly in polys:
        ring = poly[0]
        if abs(ring[0][0]) > 10:                       # [lat,lon] -> [lon,lat]
            ring = [[p[1], p[0]] for p in ring]
        rings.append([(p[0], p[1]) for p in ring])
    return rings

# ---------- Sutherland-Hodgman half-vlak-clip ----------
def clip_halfplane(poly, G, O):
    mx, my = (G[0] + O[0]) / 2, (G[1] + O[1]) / 2
    nx, ny = O[0] - G[0], O[1] - G[1]
    side = lambda p: (p[0] - mx) * nx + (p[1] - my) * ny    # <=0 = dichter bij G
    out, n = [], len(poly)
    for i in range(n):
        S, E = poly[i], poly[(i + 1) % n]
        ds, de = side(S), side(E)
        if ds <= 0:
            out.append(S)
        if (ds <= 0) != (de <= 0):
            t = ds / (ds - de)
            out.append((S[0] + t * (E[0] - S[0]), S[1] + t * (E[1] - S[1])))
    return out

def voronoi_cel(G, anderen, basisringen):
    stukken = []
    for ring in basisringen:
        poly = ring[:-1] if ring[0] == ring[-1] else ring[:]
        for O in anderen:
            if not poly:
                break
            poly = clip_halfplane(poly, G, O)
        if len(poly) >= 3:
            stukken.append([[round(x, 5), round(y, 5)] for x, y in poly])
    return stukken

def main():
    print("grens ophalen (PDOK)...", file=sys.stderr)
    basisringen = haal_grens()
    SB = {s["id"]: s for s in laad("stembureaus")}
    U = laad("uitslagen")

    elections = sorted({u["soort"] + str(u["jaar"]) for u in U})
    out = {}
    for e in elections:
        # actieve, mapbare bureaus in deze verkiezing; per coördinaat het bureau met de meeste geldige stemmen
        per_coord = {}
        for u in U:
            if u["soort"] + str(u["jaar"]) != e:
                continue
            s = SB[u["sb"]]
            if s.get("mobiel") or s["lat"] is None:
                continue
            key = (round(s["lat"], 5), round(s["lon"], 5))
            cur = per_coord.get(key)
            if cur is None or u["geldig"] > cur[1]:
                per_coord[key] = (u["sb"], u["geldig"])
        punten = [((lon, lat), sbid) for (lat, lon), (sbid, _) in per_coord.items()]
        cellen = []
        for i, (G, sbid) in enumerate(punten):
            anderen = [P for j, (P, _) in enumerate(punten) if j != i]
            polys = voronoi_cel(G, anderen, basisringen)
            if polys:
                cellen.append({"sb": sbid, "polys": polys})
        out[e] = cellen
        print(f"  {e}: {len(punten)} bureaus -> {len(cellen)} gebieden", file=sys.stderr)

    dest = os.path.join(ROOT, "data", "gebieden.js")
    with open(dest, "w") as f:
        f.write("/* Stembureau-gebieden per verkiezing (Thiessen/Voronoi, geknipt op de gemeentegrens).\n"
                "   Gegenereerd door scripts/build_gebieden.py. Grens © Kadaster/PDOK. */\n")
        f.write("const GEBIEDEN = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(f"geschreven data/gebieden.js ({os.path.getsize(dest)//1024} kB)", file=sys.stderr)

if __name__ == "__main__":
    main()
