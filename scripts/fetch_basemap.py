#!/usr/bin/env python3
"""Haalt een lichte VECTOR-basiskaart op uit OpenStreetMap via Overpass (toegestaan,
i.t.t. bulk-download van rastertegels) en schrijft data/basemap.js.
Bevat: water (vlakken + lijnen), wegen (hoofd + overig) en de kernen (labels).
Volledig offline bruikbaar daarna — geen kaartserver meer nodig."""
import os, json, urllib.request, urllib.parse, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Liggende rechthoek (breed, niet hoog) — volgt de vorm van de kaart-panel.
WIJD = "51.950,4.140,52.090,4.710"   # BREED: hoofd-arteries + plaatsnamen -> vult links/rechts
MID  = "51.960,4.270,52.080,4.580"   # ruim: overige wegen + water
KERN = "51.975,4.365,52.070,4.485"   # gemeente zelf: woonstraten + sloten (detail)
UA = "VVD-PijnackerNootdorp-basemap/1.0 (interne presentatie)"

# Detail loopt van binnen (gemeente) naar buiten (rand) steeds grover -> rustig, vol én compact.
QUERY = f"""
[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"]({WIJD});
  way["highway"~"^(tertiary|unclassified)$"]({MID});
  way["natural"="water"]({MID});
  way["waterway"~"^(river|canal)$"]({MID});
  way["waterway"~"^(stream|ditch)$"]({KERN});
  way["highway"~"^(residential|living_street)$"]({KERN});
  way["railway"="rail"]({WIJD});
  way["leisure"~"^(park|recreation_ground|garden|pitch)$"]({MID});
  way["landuse"~"^(forest|recreation_ground|cemetery|allotments|village_green)$"]({MID});
  way["natural"="wood"]({MID});
  way["highway"~"^(footway|cycleway|path|pedestrian|steps)$"]({KERN});
);
out geom;
node["place"~"^(town|village)$"]({WIJD});
out;
"""

MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary"}
PATHS = {"footway", "cycleway", "path", "pedestrian", "steps"}

def overpass():
    for host in ("https://overpass-api.de/api/interpreter",
                 "https://overpass.kumi.systems/api/interpreter",
                 "https://overpass.openstreetmap.ru/cgi/interpreter",
                 "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
        try:
            req = urllib.request.Request(host, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                         headers={"User-Agent": UA})
            print("  Overpass:", host, file=sys.stderr)
            return json.load(urllib.request.urlopen(req, timeout=200))
        except Exception as e:
            print("  mislukt:", e, file=sys.stderr)
    raise SystemExit("Overpass niet bereikbaar")

def rnd(v): return round(v, 4)   # ~11 m precisie; houdt het bestand klein bij groter gebied

def feature(geom_type, coords, props):
    return {"type": "Feature", "properties": props, "geometry": {"type": geom_type, "coordinates": coords}}

data = overpass()
roads_major, roads_minor, water, waterlines, places = [], [], [], [], []
rail, paths, green = [], [], []

for el in data["elements"]:
    if el["type"] == "node" and el.get("tags", {}).get("place"):
        nm = el["tags"].get("name")
        if nm:
            places.append(feature("Point", [rnd(el["lon"]), rnd(el["lat"])], {"name": nm, "place": el["tags"]["place"]}))
        continue
    if el["type"] != "way" or "geometry" not in el:
        continue
    tags = el.get("tags", {})
    line = [[rnd(p["lon"]), rnd(p["lat"])] for p in el["geometry"]]
    if len(line) < 2:
        continue
    hw = tags.get("highway")
    gesloten = line[0] == line[-1] and len(line) >= 4
    if hw in PATHS:
        paths.append(feature("LineString", line, {"klasse": hw}))
    elif hw:
        f = feature("LineString", line, {"klasse": hw})
        (roads_major if hw in MAJOR else roads_minor).append(f)
    elif tags.get("railway") == "rail":
        rail.append(feature("LineString", line, {}))
    elif tags.get("natural") == "water":
        if gesloten:
            water.append(feature("Polygon", [line], {}))
        else:
            waterlines.append(feature("LineString", line, {}))
    elif tags.get("waterway"):
        waterlines.append(feature("LineString", line, {}))
    elif (tags.get("leisure") or tags.get("landuse") or tags.get("natural") == "wood") and gesloten:
        green.append(feature("Polygon", [line], {}))

def fc(feats): return {"type": "FeatureCollection", "features": feats}
out = {"green": fc(green), "water": fc(water), "waterlines": fc(waterlines),
       "rail": fc(rail), "paths": fc(paths),
       "roads_major": fc(roads_major), "roads_minor": fc(roads_minor), "places": fc(places)}

dest = os.path.join(ROOT, "data", "basemap.js")
with open(dest, "w") as f:
    f.write("/* VECTOR-basiskaart uit OpenStreetMap (Overpass). Gegenereerd door scripts/fetch_basemap.py.\n"
            "   © OpenStreetMap-bijdragers, ODbL. */\n")
    f.write("const BASEMAP = " + json.dumps(out, separators=(",", ":")) + ";\n")
kb = os.path.getsize(dest) / 1024
print(f"geschreven data/basemap.js ({kb:.0f} kB) — groen:{len(green)} water:{len(water)} "
      f"waterlijnen:{len(waterlines)} spoor:{len(rail)} paden:{len(paths)} "
      f"hoofdwegen:{len(roads_major)} overige:{len(roads_minor)} kernen:{len(places)}", file=sys.stderr)
