"use strict";

// Zelfde Leaflet-projectie, schaal en actieve weergave als de kaart op het scherm.
function maakKaartPng() {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1100;
  const ctx = canvas.getContext("2d");
  const pad = 40, top = 100, bottom = 150;
  const size = map.getSize();
  const scale = Math.min((canvas.width - 2 * pad) / size.x, (canvas.height - top - bottom) / size.y);
  const left = (canvas.width - size.x * scale) / 2;
  const point = ([lon, lat]) => {
    const p = map.latLngToContainerPoint([lat, lon]);
    return [left + p.x * scale, top + p.y * scale];
  };
  function ringPath(ring) {
    ring.forEach((coordinate, i) => {
      const [x, y] = point(coordinate);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  function polygons(data, color) {
    ctx.fillStyle = color;
    for (const feature of data?.features || []) {
      const g = feature.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      ctx.beginPath();
      for (const poly of polys) for (const ring of poly) ringPath(ring);
      ctx.fill("evenodd");
    }
  }
  function lines(data, color, width, dash = []) {
    ctx.strokeStyle = color; ctx.lineWidth = width * scale; ctx.setLineDash(dash.map((d) => d * scale));
    for (const feature of data?.features || []) {
      const g = feature.geometry;
      const paths = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
      for (const line of paths) {
        ctx.beginPath();
        line.forEach((coordinate, i) => {
          const [x, y] = point(coordinate);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
  function hatch(value) {
    const tile = document.createElement("canvas"); tile.width = tile.height = 7;
    const pc = tile.getContext("2d");
    pc.strokeStyle = "rgba(255,255,255,.38)"; pc.lineWidth = 3;
    pc.beginPath();
    if (value >= 0) { pc.moveTo(-2, 9); pc.lineTo(9, -2); }
    else { pc.moveTo(-2, -2); pc.lineTo(9, 9); }
    pc.stroke();
    return ctx.createPattern(tile, "repeat");
  }
  const { lo, hi, maxAbs } = kaartSchaal();
  ctx.fillStyle = "#f4f3ee"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, size.x * scale, size.y * scale); ctx.clip();
  polygons(BASEMAP.green, "#dbe8cf"); polygons(BASEMAP.water, "#c4dde6");
  lines(BASEMAP.waterlines, "#c4dde6", 1.6);
  lines(BASEMAP.paths, "#e3d9c6", 0.7, [2, 3]);
  lines(BASEMAP.roads_minor, "#ffffff", 1.1);
  lines(BASEMAP.rail, "#9aa3b2", 1.2, [5, 4]);
  lines(BASEMAP.roads_major, "#d7dbe2", 2.4);
  if (weergave === "stippen") {
    for (const station of mapbare.filter((s) => getU(s.id, huidige))) {
      const value = metricValue(station.id);
      const [x, y] = point([station.lon, station.lat]);
      const radius = (7 + Math.min(8, Math.sqrt(getU(station.id, huidige).geldig) / 8)) * scale;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = colorFor(value, lo, hi, maxAbs); ctx.globalAlpha = value == null ? 0.4 : 0.92;
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = scale;
      if (isDiverging() && value != null) {
        ctx.strokeStyle = "#152033"; ctx.lineWidth = 2 * scale;
        ctx.setLineDash((value >= 0 ? [2, 3] : [6, 3]).map((d) => d * scale));
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
  } else {
    for (const cell of cellen()) {
      const value = metricValue(celDoel(cell));
      ctx.beginPath();
      for (const ring of cell.polys) ringPath(ring);
      ctx.fillStyle = colorFor(value, lo, hi, maxAbs); ctx.globalAlpha = value == null ? 0.5 : 0.78;
      ctx.fill(); ctx.globalAlpha = 1;
      if (isDiverging() && value != null) { ctx.fillStyle = hatch(value); ctx.fill(); }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = scale; ctx.stroke();
    }
  }
  ctx.font = "700 20px Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#0A2CCA";
  for (const feature of BASEMAP.places.features) {
    if (!["town", "village"].includes(feature.properties.place)) continue;
    const [x, y] = point(feature.geometry.coordinates);
    ctx.fillText(feature.properties.name, x, y);
  }
  ctx.restore();
  const election = ELECTIONS.find((e) => e.id === huidige);
  ctx.fillStyle = "#0A2CCA"; ctx.fillRect(0, 0, canvas.width, 80);
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.font = "700 26px Arial";
  ctx.fillText(`VVD Pijnacker-Nootdorp · ${election.label} · ${weergave}`, pad, 33);
  ctx.font = "20px Arial"; ctx.fillText(metricLabel(), pad, 62, canvas.width - 2 * pad);
  const legendY = canvas.height - 125;
  if (lo != null) {
    const gradient = ctx.createLinearGradient(pad, 0, 440, 0);
    for (let i = 0; i <= 20; i++) {
      let value = lo + (hi - lo) * i / 20;
      if (metric === POSITIE_METRIC) value = i / 2;
      else if (isDiverging()) value = -maxAbs + 2 * maxAbs * i / 20;
      gradient.addColorStop(i / 20, colorFor(value, lo, hi, maxAbs));
    }
    ctx.fillStyle = gradient; ctx.fillRect(pad, legendY, 400, 16);
  }
  ctx.fillStyle = "#152033"; ctx.font = "16px Arial";
  ctx.fillText(document.querySelector("#legend .ends")?.innerText.replace(/\n/g, "     →     ") || "Geen gegevens", pad, legendY + 40);
  ctx.fillText("Vlakken zijn nabijheidsgebieden rond stemlocaties, geen woongebieden van kiezers.", pad, canvas.height - 50);
  ctx.fillText("Kaart © OpenStreetMap-bijdragers (ODbL) · Grens © Kadaster/PDOK · Bron: Kiesraad", pad, canvas.height - 27);
  ctx.textAlign = "right";
  ctx.fillText(`Bijgewerkt: ${META.bijgewerkt.slice(0, 10)}`, canvas.width - pad, legendY + 40);
  return canvas;
}

function exporteerPng() {
  const a = document.createElement("a");
  a.download = `vvd-kaart-${huidige}-${metric}-${weergave}.png`;
  a.href = maakKaartPng().toDataURL("image/png"); a.click();
  meld(`Kaart geëxporteerd als ${a.download}`);
}
