#!/usr/bin/env python3
"""Maakt de site volledig offline-bruikbaar (presentatie-proof):
- vendor Leaflet + Chart.js naar /vendor
De kaart zelf is een offline VECTOR-basiskaart (data/basemap.js via scripts/fetch_basemap.py)
i.p.v. rastertegels — OSM-tegels mogen niet in bulk gedownload worden.
Eenmalig draaien; daarna werkt de site zonder internet."""
import os, urllib.request, sys, json, hashlib
from common import SOURCE_ROOT

from common import ROOT as OUTPUT_ROOT
ROOT = str(OUTPUT_ROOT)
UA = "VVD-PijnackerNootdorp-offline-map/1.0 (interne presentatie)"

def fetch(url, dest, binary=True):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return False
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=60).read()
    open(dest, "wb" if binary else "w").write(data if binary else data.decode())
    return True

# ---- libraries ----
LIBS = {
    "vendor/leaflet.js":  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "vendor/leaflet.css": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "vendor/chart.umd.min.js": "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
}
hashes = json.loads((SOURCE_ROOT / "config/vendor-sha256.json").read_text())
print("== libraries ==")
for dest, url in LIBS.items():
    got = fetch(url, os.path.join(ROOT, dest))
    actual = hashlib.sha256(open(os.path.join(ROOT, dest), "rb").read()).hexdigest()
    if actual != hashes[dest]:
        sys.exit("Library wijkt af van de vastgelegde hash: " + dest)
    print(("  gedownload " if got else "  bestaat al ") + dest)

print()
print("Libraries gevendord. Voor de offline KAART: draai scripts/fetch_basemap.py")
