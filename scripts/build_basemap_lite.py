#!/usr/bin/env python3
"""#15 — Maakt data/basemap.lite.js: een lichtere variant van data/basemap.js voor mobiel /
trage verbindingen. Vereenvoudigt de lijnen/vlakken met Douglas-Peucker en laat de woonstraten
(roads_minor) weg. Zelfde `const BASEMAP = {…}`-vorm, dus app.js tekent hem ongewijzigd.

Werkt op de al gegenereerde basemap.js (geen Overpass nodig). Draait mee in update_all.py.
Knop om aan te draaien: EPS (graden; ~0.0001° ≈ 11 m)."""
import os, json, sys

from common import ROOT as OUTPUT_ROOT
ROOT = str(OUTPUT_ROOT)
EPS = float(sys.argv[1]) if len(sys.argv) > 1 else 0.002  # ponytail: tolerantie in graden (~0.0001°≈11m) -> lite ≈1.98 MB (<2 MB). Hoger = kleiner+grover.
DROP = {"roads_minor", "paths"}  # fijn detail dat in lite helemaal wegvalt


def _perp(p, a, b):
    """Loodrechte afstand van p tot de lijn a–b (planair; prima op deze schaal)."""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    return abs(dx * (ay - py) - (ax - px) * dy) / (dx * dx + dy * dy) ** 0.5


def dp(points):
    """Douglas-Peucker, iteratief (geen recursielimiet-risico op lange kustlijnen)."""
    n = len(points)
    if n < 3:
        return points[:]
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        s, e = stack.pop()
        a, b = points[s], points[e]
        dmax, idx = 0.0, -1
        for i in range(s + 1, e):
            d = _perp(points[i], a, b)
            if d > dmax:
                dmax, idx = d, i
        if idx != -1 and dmax > EPS:
            keep[idx] = True
            stack.append((s, idx)); stack.append((idx, e))
    return [points[i] for i in range(n) if keep[i]]


def simplify_feature(f):
    """Vereenvoudigt een feature in-place. Geeft None terug als het te klein wordt om te
    tonen (mini-watertje / piepkleine lijn) — die laten we op de lichte kaart vallen."""
    g = f["geometry"]; t = g["type"]
    if t == "LineString":
        g["coordinates"] = dp(g["coordinates"])
        return f if len(g["coordinates"]) >= 2 else None
    if t == "Polygon":
        rings = []
        for i, ring in enumerate(g["coordinates"]):
            s = dp(ring)
            if len(s) >= 4:                 # geldige ring
                rings.append(s)
            elif i == 0:                    # buitenring verdwenen -> vlak weg
                return None
            # binnenring (gat) verdwenen -> gewoon weglaten
        g["coordinates"] = rings
        return f
    return f                               # Point


def count_pts(fc):
    n = 0
    for f in fc["features"]:
        c = f["geometry"]["coordinates"]
        n += sum(len(r) for r in c) if f["geometry"]["type"] == "Polygon" else (
            len(c) if isinstance(c[0], list) else 1)
    return n


def main():
    src = os.path.join(ROOT, "data", "basemap.js")
    raw = open(src).read()
    j = raw[raw.index("{"):raw.rstrip().rstrip(";").rindex("}") + 1]
    data = json.loads(j)

    before = sum(count_pts(v) for v in data.values())
    out = {}
    for layer, fc in data.items():
        if layer in DROP:
            out[layer] = {"type": "FeatureCollection", "features": []}
            continue
        feats = [g for f in fc["features"] if (g := simplify_feature(f)) is not None]
        out[layer] = {"type": "FeatureCollection", "features": feats}
    after = sum(count_pts(v) for v in out.values())

    dest = os.path.join(ROOT, "data", "basemap.lite.js")
    with open(dest, "w") as f:
        f.write("/* LICHTE vector-basiskaart — Douglas-Peucker (build_basemap_lite.py), zonder woonstraten.\n"
                "   Auto-geladen op mobiel/trage verbinding. © OpenStreetMap-bijdragers, ODbL. */\n")
        f.write("const BASEMAP = " + json.dumps(out, separators=(",", ":")) + ";\n")

    kb_src, kb = os.path.getsize(src) / 1024, os.path.getsize(dest) / 1024
    print(f"geschreven data/basemap.lite.js ({kb:.0f} kB, was {kb_src:.0f} kB) — "
          f"punten {before} -> {after} ({100 - after * 100 // before}% minder)", file=sys.stderr)


if __name__ == "__main__":
    main()
