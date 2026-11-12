#!/usr/bin/env python3
"""#10 — Werkt ALLE gegenereerde data + libraries in één keer bij (bv. na een nieuwe verkiezing).
Draait de build-stappen in de juiste volgorde en stopt meteen bij de eerste fout
(o.a. als de integriteitscheck in build_data.py afwijkt van het officiële gemeentetotaal).

Gebruik:  python3 scripts/update_all.py
Daarna:   herlaad index.html (harde refresh)."""
import subprocess, sys, os, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAPPEN = [
    ("Uitslagen ophalen (officiële Kiesraad-EML)",                 "harvest.py"),
    ("Stembureaus + uitslagen + kandidaten bouwen (+ check)",      "build_data.py"),
    ("Partij-posities links/rechts ophalen (CHES 2024)",           "fetch_partijen_lr.py"),
    ("Stembureau-gebieden (Voronoi op de gemeentegrens)",          "build_gebieden.py"),
    ("Vector-basiskaart ophalen (OpenStreetMap)",                  "fetch_basemap.py"),
    ("Lichte basiskaart bouwen (mobiel/trage verbinding)",         "build_basemap_lite.py"),
    ("Libraries vendoren (Leaflet, Chart.js)",                     "fetch_offline.py"),
]

start = time.time()
for i, (titel, script) in enumerate(STAPPEN, 1):
    print(f"\n=== [{i}/{len(STAPPEN)}] {titel} ===", flush=True)
    t = time.time()
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", script)])
    if r.returncode != 0:
        sys.exit(f"\nGESTOPT bij stap {i} ({script}) — returncode {r.returncode}. "
                 f"Data NIET volledig bijgewerkt.")
    print(f"  klaar in {time.time() - t:.0f}s", flush=True)

print(f"\nAlles bijgewerkt in {time.time() - start:.0f}s. Herlaad index.html (harde refresh: Cmd+Shift+R).")
