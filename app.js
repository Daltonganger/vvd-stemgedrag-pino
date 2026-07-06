"use strict";
/* VVD Pijnacker-Nootdorp — stemgedrag per stembureau.
   Alle afgeleide cijfers (%, gemiddelden, afwijkingen) komen uit UITSLAGEN/STEMBUREAUS. */

const NIVEAU = { EP: "Europees", TK: "Landelijk", PS: "Provincie", GR: "Gemeente" };
const NIVEAU_ORDER = ["EP", "TK", "PS", "GR"];
const KLEUR_NIVEAU = { EP: "#2E7BD6", TK: "#0A2CCA", PS: "#5b6470", GR: "#FF6400" };  // Europees lichtblauw / VVD blauw / grijs / oranje

const eid = (u) => u.soort + u.jaar;
const sbById = new Map(STEMBUREAUS.map((s) => [s.id, s]));

// index: "sb|TK2023" -> {vvd, geldig}
const idx = new Map();
for (const u of UITSLAGEN) idx.set(u.sb + "|" + eid(u), u);
const getU = (sb, e) => idx.get(sb + "|" + e) || null;
const pct = (u) => (u && u.geldig ? (100 * u.vvd) / u.geldig : null);
const pctOf = (sb, e) => pct(getU(sb, e));

// verkiezingen, gesorteerd op niveau-volgorde dan jaar
const ELECTIONS = [...new Set(UITSLAGEN.map(eid))]
  .map((e) => ({ id: e, soort: e.slice(0, 2), jaar: +e.slice(2), label: NIVEAU[e.slice(0, 2)] + " " + e.slice(2) }))
  .sort((a, b) => NIVEAU_ORDER.indexOf(a.soort) - NIVEAU_ORDER.indexOf(b.soort) || a.jaar - b.jaar);

const latestOf = (soort) => ELECTIONS.filter((e) => e.soort === soort).slice(-1)[0];
const prevSameSoort = (e) => {
  const same = ELECTIONS.filter((x) => x.soort === e.soort && x.jaar < e.jaar);
  return same.length ? same[same.length - 1].id : null;
};
const LAATSTE_GR = latestOf("GR"), LAATSTE_TK = latestOf("TK");

// gemeente-totalen per verkiezing: VVD%, opkomst en partij-aggregaat
const gemAvg = {};
for (const e of ELECTIONS) {
  let v = 0, g = 0, ub = 0, kg = 0, n = 0;
  const partijen = new Map();
  for (const s of STEMBUREAUS) {
    const u = getU(s.id, e.id);
    if (!u) continue;
    n++; v += u.vvd; g += u.geldig; ub += u.uitgebracht || 0; kg += u.kiesg || 0;
    for (const [naam, votes] of u.partijen || []) partijen.set(naam, (partijen.get(naam) || 0) + votes);
  }
  const top = [...partijen.entries()].sort((a, b) => b[1] - a[1]);
  gemAvg[e.id] = { vvd: v, geldig: g, pct: g ? (100 * v) / g : null, n,
    opkomst: kg ? (100 * ub) / kg : null, uitgebracht: ub, kiesg: kg, top };
}

// ---- #6: aggregatie naar kern (Pijnacker / Nootdorp / Delfgauw) o.b.v. postcode ----
const KERN_PC = { "2631": "Nootdorp", "2632": "Nootdorp", "2645": "Delfgauw" };
function kernVan(s) {
  if (!s || !s.postcode) return null;
  const p4 = s.postcode.slice(0, 4);
  return KERN_PC[p4] || (/^264[123]$/.test(p4) ? "Pijnacker" : null);
}
const KERNEN = ["Pijnacker", "Nootdorp", "Delfgauw"];
const kernId = (k) => "K:" + k;
const kernCentroid = {};
// kern-pseudostembureaus in idx + sbById zetten -> alle bestaande functies werken ook voor kernen
for (const k of KERNEN) {
  const leden = STEMBUREAUS.filter((s) => !s.mobiel && s.lat && kernVan(s) === k);
  const lat = leden.reduce((a, s) => a + s.lat, 0) / (leden.length || 1);
  const lon = leden.reduce((a, s) => a + s.lon, 0) / (leden.length || 1);
  kernCentroid[k] = [lat, lon];
  sbById.set(kernId(k), { id: kernId(k), naam: k + " (hele kern)", lat, lon, mobiel: false, kern: true });
  for (const e of ELECTIONS) {
    let v = 0, g = 0, ub = 0, kg = 0, heeft = false;
    const partijen = new Map(), vk = new Map();
    for (const s of leden) {
      const u = getU(s.id, e.id); if (!u) continue;
      heeft = true; v += u.vvd; g += u.geldig; ub += u.uitgebracht || 0; kg += u.kiesg || 0;
      for (const [naam, votes] of u.partijen || []) partijen.set(naam, (partijen.get(naam) || 0) + votes);
      for (const [nr, votes] of u.vk || []) vk.set(nr, (vk.get(nr) || 0) + votes);
    }
    if (heeft) idx.set(kernId(k) + "|" + e.id, {
      sb: kernId(k), soort: e.soort, jaar: e.jaar, vvd: v, geldig: g, uitgebracht: ub, kiesg: kg,
      partijen: [...partijen.entries()].sort((a, b) => b[1] - a[1]),
      vk: [...vk.entries()].sort((a, b) => b[1] - a[1]),
    });
  }
}

// is deze partijnaam de VVD?
const isVVD = (naam) => naam.trim().toUpperCase().startsWith("VVD");

// VVD-marge t.o.v. grootste partij: + = VVD is grootste (voorsprong op nr.2), − = achterstand op nr.1
function vvdMarge(sb, e) {
  const u = getU(sb, e);
  if (!u || !u.geldig || !u.partijen.length) return null;
  const p = u.partijen; // al gesorteerd hoog->laag
  const ref = isVVD(p[0][0]) ? (p[1] ? p[1][1] : 0) : p[0][1];
  return (100 * (u.vvd - ref)) / u.geldig;
}
// grootste partij (naam) bij een stembureau-verkiezing
const winnaar = (sb, e) => { const u = getU(sb, e); return u && u.partijen.length ? u.partijen[0][0] : null; };
// stemmen van een specifieke partij bij een stembureau-verkiezing
const partyVotes = (u, naam) => { const f = (u.partijen || []).find((p) => p[0] === naam); return f ? f[1] : 0; };
// opkomst-% per stembureau (indicatief: kiezers zijn niet aan hun bureau gebonden)
function opkomstPct(sb, e) { const u = getU(sb, e); return u && u.kiesg ? (100 * u.uitgebracht) / u.kiesg : null; }

// ---- #12: VVD-kandidaten (voorkeurstemmen) ----
const kandidaatNaam = (e, nr) => (typeof KANDIDATEN !== "undefined" && KANDIDATEN[e] && KANDIDATEN[e][nr]) || ("kandidaat " + nr);
const heeftKandidaten = (e) => typeof KANDIDATEN !== "undefined" && KANDIDATEN[e] && Object.keys(KANDIDATEN[e]).length > 0;
const vkVotes = (u, nr) => { const f = (u && u.vk || []).find((x) => x[0] === nr); return f ? f[1] : 0; };
// aandeel van een kandidaat binnen de VVD-stemmen op deze plek (waar is de kandidaat sterk?)
function kandidaatAandeel(sb, e, nr) { const u = getU(sb, e); return u && u.vvd ? (100 * vkVotes(u, nr)) / u.vvd : null; }

// lokale meerwaarde = laatste gemeente% − laatste landelijk%
const meerwaarde = (sb) => {
  const a = pctOf(sb, LAATSTE_GR.id), b = pctOf(sb, LAATSTE_TK.id);
  return a == null || b == null ? null : a - b;
};

/* ---------------- state ---------------- */
let huidige = (latestOf("GR") || ELECTIONS[ELECTIONS.length - 1]).id;
let metric = "perc";
let weergave = "gebieden";    // 'gebieden' (vlakken) of 'stippen'
let vergelijkPartij = null;   // gekozen partij voor de 'VVD t.o.v. partij'-weergave
let kiesKandidaat = null;     // gekozen VVD-kandidaat (nummer) voor de kandidaat-weergave
let zichtbaar = new Set(["EP", "TK", "PS", "GR"]);
let sort = { key: huidige, dir: -1 };
let geselecteerd = null;

/* ---------------- kleuren ---------------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
const seq = (t) => mix("#ffe9d3", "#FF6400", Math.max(0, Math.min(1, t)));            // laag→hoog (warme VVD-ramp)
const div = (t) => t < 0 ? mix("#f7f7f7", "#b2182b", Math.min(1, -t)) : mix("#f7f7f7", "#2166ac", Math.min(1, t)); // −rood/+blauw (ColorBrewer RdBu, kleurenblind-veilig i.p.v. rood/groen)

// metric-waarde per stembureau (kan null zijn)
function metricValue(sb) {
  if (metric === "perc") return pctOf(sb, huidige);
  if (metric === "afwijking") { const p = pctOf(sb, huidige); return p == null ? null : p - gemAvg[huidige].pct; }
  if (metric === "meerwaarde") return meerwaarde(sb);
  if (metric === "winst") { const pr = prevSameSoort(ELECTIONS.find((e) => e.id === huidige)); if (!pr) return null; const a = pctOf(sb, huidige), b = pctOf(sb, pr); return a == null || b == null ? null : a - b; }
  if (metric === "vsgrootste") return vvdMarge(sb, huidige);
  if (metric === "vspartij") { const u = getU(sb, huidige); if (!u || !u.geldig || !vergelijkPartij) return null; return (100 * (u.vvd - partyVotes(u, vergelijkPartij))) / u.geldig; }
  if (metric === "opkomst") return opkomstPct(sb, huidige);
  if (metric === "kandidaat") return kiesKandidaat ? kandidaatAandeel(sb, huidige, kiesKandidaat) : null;
  return null;
}
const DIVERGEND = new Set(["afwijking", "meerwaarde", "winst", "vsgrootste", "vspartij"]);
const isDiverging = () => DIVERGEND.has(metric);
function metricLabel() {
  if (metric === "vspartij") return "VVD t.o.v. " + (vergelijkPartij || "—");
  if (metric === "kandidaat") return "Aandeel " + (kiesKandidaat ? kandidaatNaam(huidige, kiesKandidaat).split(" (")[0] : "—") + " binnen VVD";
  return document.querySelector("#sel-metric").selectedOptions[0].text;
}

function colorFor(val, lo, hi, maxAbs) {
  if (val == null) return "#bbbbbb";
  if (isDiverging()) return div(maxAbs ? val / maxAbs : 0);
  return seq(hi > lo ? (val - lo) / (hi - lo) : 0.5);
}

/* ---------------- kaart ---------------- */
const map = L.map("map", { scrollWheelZoom: true, minZoom: 12, maxZoom: 17,
  attributionControl: true });
map.setMaxBounds(L.latLngBounds([[51.955, 4.155], [52.085, 4.695]]));
map.attributionControl.addAttribution("© OpenStreetMap-bijdragers (offline vectorkaart)");
document.getElementById("map").setAttribute("aria-label", "Kaart van Pijnacker-Nootdorp: VVD-uitslag per stembureau. Cijfers ook in de tabel eronder.");

// Offline VECTOR-basiskaart uit OSM (data/basemap.js) — geen kaartserver nodig.
function tekenBasiskaart() {
  const laag = (data, style) => data && L.geoJSON(data, { style, interactive: false }).addTo(map);
  laag(BASEMAP.green, { fillColor: "#dbe8cf", fillOpacity: 1, stroke: false });      // onderlaag
  laag(BASEMAP.water, { fillColor: "#c4dde6", fillOpacity: 1, stroke: false });
  laag(BASEMAP.waterlines, { color: "#c4dde6", weight: 1.6 });
  laag(BASEMAP.paths, { color: "#e3d9c6", weight: 0.7, dashArray: "2 3" });
  laag(BASEMAP.roads_minor, { color: "#ffffff", weight: 1.1 });
  laag(BASEMAP.rail, { color: "#9aa3b2", weight: 1.2, dashArray: "5 4" });
  laag(BASEMAP.roads_major, { color: "#d7dbe2", weight: 2.4 });
  for (const p of BASEMAP.places.features) {
    if (!["town", "village"].includes(p.properties.place)) continue;
    const [lon, lat] = p.geometry.coordinates;
    L.tooltip({ permanent: true, direction: "center", className: "plaatslabel", interactive: false })
      .setLatLng([lat, lon]).setContent(p.properties.name).addTo(map);
  }
}
tekenBasiskaart();
const mapbare = STEMBUREAUS.filter((s) => s.lat && s.lon);
map.fitBounds(mapbare.map((s) => [s.lat, s.lon]), { padding: [30, 30] });
const markers = new Map();
const markerLaag = L.layerGroup();
const gebiedLaag = L.layerGroup();
const gebiedVanSb = new Map();   // sb-id (of kern-id) -> polygoon (voor popup bij selectie)
const toonLaag = (laag, aan) => { if (aan) { if (!map.hasLayer(laag)) map.addLayer(laag); } else if (map.hasLayer(laag)) map.removeLayer(laag); };

// gebieden van de gekozen verkiezing (per verkiezing herverdeeld; verdwenen bureaus = geen vlak)
const cellen = () => GEBIEDEN[huidige] || [];

function popupHtml(s) {
  const rows = ELECTIONS.map((e) => {
    const u = getU(s.id, e.id); if (!u) return "";
    return `<div class="prow"><span class="pl">${e.label}</span>` +
      `<span class="pp">${pct(u).toFixed(1)}%</span><span class="pv">${u.vvd}</span></div>`;
  }).join("");
  return `<b class="ptitle">${s.naam}</b>` +
    `<div class="pkop"><span class="pl">Verkiezing</span><span class="pp">VVD&nbsp;%</span><span class="pv">aant.</span></div>` +
    rows + `<div class="popuphint">Klik voor alle partijen →</div>`;
}

// doel-id van een gebied: in kernen-weergave de kern, anders het stembureau zelf
const celDoel = (c) => weergave === "kernen" ? kernId(kernVan(sbById.get(c.sb))) : c.sb;

function tekenKaart() {
  const cells = cellen();
  const actief = mapbare.filter((s) => getU(s.id, huidige));   // alleen bureaus die in deze verkiezing bestonden
  const vlakkenView = weergave === "gebieden" || weergave === "kernen";
  // schaal bepalen op basis van de actieve weergave
  const waarden = vlakkenView ? cells.map((c) => metricValue(celDoel(c))) : actief.map((s) => metricValue(s.id));
  const vals = waarden.filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 0.001);

  // ----- stippen (alleen actieve bureaus van deze verkiezing) -----
  markerLaag.clearLayers();
  if (weergave === "stippen") {
    for (const s of actief) {
      const val = metricValue(s.id), u = getU(s.id, huidige);
      const r = 7 + Math.min(8, Math.sqrt(u.geldig) / 8);
      let m = markers.get(s.id);
      const opts = { radius: r, weight: 1, color: "#fff", fillColor: colorFor(val, lo, hi, maxAbs), fillOpacity: val == null ? 0.4 : 0.92 };
      if (!m) {
        m = L.circleMarker([s.lat, s.lon], opts);
        m.bindPopup(() => popupHtml(s), { maxWidth: 300 });
        m.on("click", () => selecteer(s.id));
        markers.set(s.id, m);
      } else m.setStyle(opts).setRadius(r);
      m.addTo(markerLaag);
    }
  }

  // ----- vlakken (per stembureau) of kernen (per kern, zelfde geometrie, ingekleurd per kern) -----
  gebiedLaag.clearLayers(); gebiedVanSb.clear();
  if (vlakkenView) {
    for (const c of cells) {
      const doel = celDoel(c), val = metricValue(doel);
      const style = { color: "#fff", weight: weergave === "kernen" ? 0.5 : 1, fillColor: colorFor(val, lo, hi, maxAbs), fillOpacity: val == null ? 0.5 : 0.78 };
      const latlngs = c.polys.map((poly) => poly.map(([lon, lat]) => [lat, lon]));
      const pol = L.polygon(latlngs, style);
      const popupDoel = sbById.get(doel) ? doel : c.sb;
      pol.bindPopup(() => popupHtml(sbById.get(popupDoel)), { maxWidth: 300 });
      pol.on("click", () => selecteer(popupDoel));
      gebiedVanSb.set(popupDoel, pol);
      pol.addTo(gebiedLaag);
    }
  }

  toonLaag(markerLaag, weergave === "stippen");
  toonLaag(gebiedLaag, vlakkenView);
  tekenLegend(lo, hi, maxAbs);
}

function tekenLegend(lo, hi, maxAbs) {
  const el = document.getElementById("legend");
  const titel = metricLabel();
  let grad, links, rechts;
  if (isDiverging()) {
    grad = `linear-gradient(90deg, ${div(-1)}, ${div(0)}, ${div(1)})`;
    links = "−" + maxAbs.toFixed(1) + " pp"; rechts = "+" + maxAbs.toFixed(1) + " pp";
  } else {
    grad = `linear-gradient(90deg, ${seq(0)}, ${seq(1)})`;
    links = lo.toFixed(1) + "%"; rechts = hi.toFixed(1) + "%";
  }
  el.innerHTML = `<b>${titel}</b><div class="bar" style="background:${grad}"></div>
    <div class="ends"><span>${links}</span><span>${rechts}</span></div>`;
}

/* ---------------- samenvatting ---------------- */
function tekenSamenvatting() {
  const e = ELECTIONS.find((x) => x.id === huidige), g = gemAvg[huidige];
  const lijst = STEMBUREAUS.map((s) => ({ s, p: pctOf(s.id, huidige) })).filter((x) => x.p != null).sort((a, b) => b.p - a.p);
  const hoog = lijst[0], laag = lijst[lijst.length - 1];
  // grootste partij in de gemeente + rang van de VVD
  const top = g.top || [];
  const grootste = top[0];
  const vvdRang = top.findIndex(([naam]) => isVVD(naam)) + 1;
  const grootsteTxt = grootste
    ? `${grootste[0]} · ${(100 * grootste[1] / g.geldig).toFixed(1)}%${isVVD(grootste[0]) ? " (VVD!)" : ""}`
    : "—";
  const opkomstTxt = g.opkomst != null ? g.opkomst.toFixed(1) + "%" : "onbekend";
  document.getElementById("summary-body").innerHTML = `
    <div class="big">${g.pct.toFixed(1)}%</div>
    <div style="font-size:.8rem;color:var(--grijs);margin:.1rem 0 .5rem">VVD-gemiddelde ${e.label}${vvdRang ? ` · ${vvdRang}e partij` : ""} · ${g.vvd.toLocaleString("nl")} van ${g.geldig.toLocaleString("nl")} geldige stemmen · ${g.n} stembureaus</div>
    <div class="row"><span>Opkomst (gemeente)</span><span>${opkomstTxt}</span></div>
    <div class="row"><span>Grootste partij</span><span>${grootsteTxt}</span></div>
    <div class="row"><span>VVD hoogste</span><span>${hoog.s.naam} · ${hoog.p.toFixed(1)}%</span></div>
    <div class="row"><span>VVD laagste</span><span>${laag.s.naam} · ${laag.p.toFixed(1)}%</span></div>`;
}

/* ---------------- #6: VVD per kern (Pijnacker / Nootdorp / Delfgauw) ---------------- */
function tekenKernOverzicht() {
  const e = ELECTIONS.find((x) => x.id === huidige);
  document.getElementById("kern-title").textContent = `Per kern — ${e.label}`;
  const rows = KERNEN.map((k) => { const u = getU(kernId(k), huidige); return u ? { k, p: pct(u), u } : null; })
    .filter(Boolean).sort((a, b) => b.p - a.p);
  const maxP = Math.max(...rows.map((r) => r.p), 1);
  document.getElementById("kern-body").innerHTML = rows.map((r) => {
    const win = r.u.partijen[0];
    return `<div class="kernrow" data-sb="${kernId(r.k)}">
        <span class="kn">${r.k}</span>
        <span class="kmeter"><i style="width:${(100 * r.p / maxP).toFixed(0)}%"></i></span>
        <span class="kp">${r.p.toFixed(1)}%</span></div>
      <div class="ksub">grootste: ${win ? win[0] : "—"} · opkomst ${r.u.kiesg ? (100 * r.u.uitgebracht / r.u.kiesg).toFixed(0) + "%" : "?"} · ${r.u.geldig.toLocaleString("nl")} geldige stemmen</div>`;
  }).join("") || "<p class='hint'>geen kerngegevens</p>";
  document.querySelectorAll("#kern-body .kernrow").forEach((r) => r.addEventListener("click", () => selecteer(r.dataset.sb)));
}

/* ---------------- #5: grootste stijgers & dalers (t.o.v. vorige keer, zelfde niveau) ---------------- */
function tekenMovers() {
  const card = document.getElementById("movers-card");
  const pr = prevSameSoort(ELECTIONS.find((x) => x.id === huidige));
  if (!pr) { card.hidden = true; return; }
  card.hidden = false;
  const e = ELECTIONS.find((x) => x.id === huidige), pe = ELECTIONS.find((x) => x.id === pr);
  const delta = STEMBUREAUS.filter((s) => !s.mobiel).map((s) => {
    const a = pctOf(s.id, huidige), b = pctOf(s.id, pr);
    return a == null || b == null ? null : { s, d: a - b };
  }).filter(Boolean).sort((x, y) => y.d - x.d);
  const rij = (o) => `<div class="moverrow" data-sb="${o.s.id}"><span>${o.s.naam}</span>` +
    `<b class="${o.d >= 0 ? "up" : "down"}">${o.d > 0 ? "+" : ""}${o.d.toFixed(1)}</b></div>`;
  const stijgers = delta.filter((o) => o.d > 0).slice(0, 4);
  const dalers = delta.filter((o) => o.d < 0).slice(-4).reverse();
  document.getElementById("movers-title").textContent = `Stijgers & dalers — ${e.label} t.o.v. ’${String(pe.jaar).slice(2)}`;
  document.getElementById("movers-body").innerHTML =
    `<div class="moverkop up">▲ Grootste stijgers (%-punt)</div>${stijgers.map(rij).join("") || "<p class='hint'>geen</p>"}` +
    `<div class="moverkop down">▼ Grootste dalers</div>${dalers.map(rij).join("") || "<p class='hint'>geen</p>"}`;
  document.querySelectorAll("#movers-body .moverrow").forEach((r) => r.addEventListener("click", () => selecteer(r.dataset.sb)));
}

/* ---------------- tabel ---------------- */
const zichtbareElections = () => ELECTIONS.filter((e) => zichtbaar.has(e.soort));

function sortWaarde(s, key) {
  if (key === "naam") return s.naam.toLowerCase();
  if (key === "meerwaarde") return meerwaarde(s.id);
  return pctOf(s.id, key);
}

function tekenTabel() {
  const els = zichtbareElections();
  const t = document.getElementById("tabel");
  // groepskoppen
  let groupCols = NIVEAU_ORDER.filter((n) => zichtbaar.has(n))
    .map((n) => `<th class="group" scope="colgroup" colspan="${els.filter((e) => e.soort === n).length}">${NIVEAU[n]}</th>`).join("");
  const arrow = (k) => sort.key === k ? `<span class="arrow">${sort.dir < 0 ? "▼" : "▲"}</span>` : "";
  let head = `<thead>
    <tr><th rowspan="2" scope="col" tabindex="0" title="Sorteer op naam">Stembureau ${arrow("naam")}</th>${groupCols}<th class="group" rowspan="2" scope="col" tabindex="0" title="Sorteer op lokale meerwaarde">Lokale<br>meerwaarde ${arrow("meerwaarde")}</th></tr>
    <tr>${els.map((e) => `<th data-k="${e.id}" scope="col" tabindex="0" title="${e.label} — sorteer">'${String(e.jaar).slice(2)} ${arrow(e.id)}</th>`).join("")}</tr></thead>`;

  const rijen = [...STEMBUREAUS].sort((a, b) => {
    const va = sortWaarde(a, sort.key), vb = sortWaarde(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;
    return va < vb ? -sort.dir : va > vb ? sort.dir : 0;
  });

  let body = rijen.map((s) => {
    const cells = els.map((e) => {
      const u = getU(s.id, e.id);
      if (!u) return `<td class="leeg" title="Geen uitslag voor deze locatie bij ${e.label} — dit stembureau bestond toen niet of telde niet mee.">–</td>`;
      const p = pct(u);
      return `<td class="pct" style="background:${seq((p - 5) / 30)}" title="${u.vvd} van ${u.geldig}">${p.toFixed(1)}%<span class="n">${u.vvd}</span></td>`;
    }).join("");
    const mw = meerwaarde(s.id);
    const mwCell = mw == null ? `<td class="leeg" title="Lokale meerwaarde niet te berekenen: geen gemeente- én landelijke uitslag voor deze locatie.">–</td>` : `<td class="pct" style="background:${div(mw / 12)}">${mw > 0 ? "+" : ""}${mw.toFixed(1)}</td>`;
    return `<tr data-sb="${s.id}" tabindex="0" aria-selected="${s.id === geselecteerd}" class="${s.mobiel ? "mobiel" : ""} ${s.id === geselecteerd ? "sel" : ""}">
      <th scope="row">${s.naam}</th>${cells}${mwCell}</tr>`;
  }).join("");

  t.innerHTML = head + "<tbody>" + body + "</tbody>";
  t.setAttribute("aria-label", "VVD per stembureau — percentages per verkiezing; Enter selecteert een rij, klik een kolomkop om te sorteren.");
  const sorteer = (th) => {
    const k = th.dataset.k || (th.textContent.startsWith("Stembureau") ? "naam" : th.textContent.startsWith("Lokale") ? "meerwaarde" : null);
    if (!k) return;
    sort = { key: k, dir: sort.key === k ? -sort.dir : -1 };
    tekenTabel();
  };
  t.querySelectorAll("thead th").forEach((th) => {
    th.addEventListener("click", () => sorteer(th));
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sorteer(th); } });
  });
  t.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => selecteer(tr.dataset.sb));
    tr.addEventListener("keydown", (e) => {                 // #8: toetsenbord-selectie
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selecteer(tr.dataset.sb); }
    });
  });
}

/* ---------------- grafiek (geselecteerd stembureau) ---------------- */
let chart;
function tekenGrafiek() {
  const ctx = document.getElementById("chart");
  const titelEl = document.getElementById("chart-title");
  if (!geselecteerd) { if (chart) { chart.destroy(); chart = null; } titelEl.textContent = "Klik een stembureau"; return; }
  const s = sbById.get(geselecteerd);
  titelEl.textContent = s.naam;
  const data = ELECTIONS.map((e) => pctOf(s.id, e.id));
  const cfg = {
    type: "bar",
    data: {
      labels: ELECTIONS.map((e) => e.label.replace("Europees", "EP").replace("Landelijk", "TK").replace("Provincie", "PS").replace("Gemeente", "GR")),
      datasets: [{ label: "VVD %", data, backgroundColor: ELECTIONS.map((e) => KLEUR_NIVEAU[e.soort]) }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => {
        const e = ELECTIONS[c.dataIndex], u = getU(s.id, e.id);
        return u ? `${e.label}: ${pct(u).toFixed(1)}% (${u.vvd}/${u.geldig})` : e.label + ": —"; } } } },
      scales: { y: { ticks: { callback: (v) => v + "%" }, beginAtZero: true } },
    },
  };
  if (chart) { chart.data = cfg.data; chart.update(); } else chart = new Chart(ctx, cfg);
}

/* ---------- partijen bij geselecteerd stembureau (gekozen verkiezing) ---------- */
function tekenPartijen() {
  const card = document.getElementById("partijen-card");
  const e = ELECTIONS.find((x) => x.id === huidige);
  const u = geselecteerd ? getU(geselecteerd, huidige) : null;
  if (!u || !u.partijen.length) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById("partijen-title").textContent =
    `Partijen — ${sbById.get(geselecteerd).naam} (${e.label})`;
  const maxV = u.partijen[0][1];
  const opk = u.kiesg ? ` · ${u.uitgebracht} uitgebracht (opkomst ${opkomstPct(geselecteerd, huidige).toFixed(0)}%, indicatief)` : "";
  const rij = u.partijen.slice(0, 8).map(([naam, v], i) => {
    const vvd = isVVD(naam);
    return `<div class="pbar ${vvd ? "vvd" : ""}">
      <span class="prang">${i + 1}</span>
      <span class="pnaam">${naam}</span>
      <span class="pmeter"><i style="width:${(100 * v / maxV).toFixed(0)}%"></i></span>
      <span class="ppct">${(100 * v / u.geldig).toFixed(1)}%</span>
      <span class="pn">${v}</span></div>`;
  }).join("");
  document.getElementById("partijen-body").innerHTML = rij +
    `<p class="hint">${u.geldig} geldige stemmen${opk}.</p>`;
}

/* ---------- #12: VVD-kandidaten (voorkeurstemmen) bij geselecteerd stembureau/kern ---------- */
function tekenKandidaten() {
  const card = document.getElementById("kandidaat-card");
  const e = ELECTIONS.find((x) => x.id === huidige);
  const u = geselecteerd ? getU(geselecteerd, huidige) : null;
  if (!u || !u.vk || !u.vk.length || !heeftKandidaten(huidige)) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById("kandidaat-title").textContent =
    `VVD-kandidaten — ${sbById.get(geselecteerd).naam} (${e.label})`;
  const maxV = u.vk[0][1];
  const rij = u.vk.slice(0, 8).map(([nr, v]) =>
    `<div class="pbar kbar ${kiesKandidaat === nr ? "sel" : ""}" data-nr="${nr}">
      <span class="prang">${nr}</span>
      <span class="pnaam">${kandidaatNaam(huidige, nr).split(" (")[0]}</span>
      <span class="pmeter"><i style="width:${(100 * v / maxV).toFixed(0)}%"></i></span>
      <span class="ppct">${(100 * v / u.vvd).toFixed(0)}%</span>
      <span class="pn">${v}</span></div>`).join("");
  document.getElementById("kandidaat-body").innerHTML = rij +
    `<p class="hint">% = aandeel binnen de ${u.vvd} VVD-stemmen hier · klik een kandidaat om de kaart erop te kleuren.</p>`;
  document.querySelectorAll("#kandidaat-body .kbar").forEach((r) => r.addEventListener("click", () => {
    kiesKandidaat = r.dataset.nr; metric = "kandidaat";
    document.getElementById("sel-metric").value = "kandidaat";
    toonKeuzes(); vulKandidaatKeuze(); tekenKaart(); tekenKandidaten();
  }));
}

/* ---------------- selectie ---------------- */
function selecteer(sb) {
  geselecteerd = sb;
  document.querySelectorAll("#tabel tbody tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.sb === sb));
  const s = sbById.get(sb);
  if (weergave === "gebieden") { const p = gebiedVanSb.get(sb); if (p) { map.panTo(p.getBounds().getCenter()); p.openPopup(); } }
  else if (s.lat && markers.get(sb)) { map.panTo([s.lat, s.lon]); markers.get(sb).openPopup(); }
  tekenGrafiek();
  tekenPartijen();
  tekenKandidaten();
}

/* ---------------- CSV ---------------- */
function downloadCsv() {
  const els = ELECTIONS;
  const head = ["Stembureau", "Postcode",
    ...els.flatMap((e) => [e.label + " VVD", e.label + " geldig", e.label + " %", e.label + " uitgebracht", e.label + " grootste partij"]),
    "Lokale meerwaarde (pp)"];
  const rows = STEMBUREAUS.map((s) => {
    const vals = els.flatMap((e) => {
      const u = getU(s.id, e.id);
      return u ? [u.vvd, u.geldig, pct(u).toFixed(1), u.uitgebracht || "", winnaar(s.id, e.id) || ""] : ["", "", "", "", ""];
    });
    const mw = meerwaarde(s.id);
    return [s.naam, s.postcode, ...vals, mw == null ? "" : mw.toFixed(1)];
  });
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "vvd-stemgedrag-pijnacker-nootdorp.csv"; a.click();
}

/* ---------------- init ---------------- */
// vul de partij-dropdown met de partijen van de gekozen verkiezing (zonder VVD)
function vulPartijKeuze() {
  const sel = document.getElementById("sel-partij");
  const opties = (gemAvg[huidige].top || []).filter(([n]) => !isVVD(n)).map(([n]) => n);
  if (!opties.includes(vergelijkPartij)) vergelijkPartij = opties[0] || null;
  sel.innerHTML = opties.map((n) => `<option ${n === vergelijkPartij ? "selected" : ""}>${n}</option>`).join("");
}
// vul de kandidaat-dropdown met de VVD-kandidaten van de gekozen verkiezing (alleen waar namen bekend zijn)
function vulKandidaatKeuze() {
  const sel = document.getElementById("sel-kandidaat");
  if (!heeftKandidaten(huidige)) { kiesKandidaat = null; sel.innerHTML = ""; return; }
  const nums = Object.keys(KANDIDATEN[huidige]).sort((a, b) => +a - +b);
  if (!nums.includes(kiesKandidaat)) kiesKandidaat = nums[0];
  sel.innerHTML = nums.map((nr) => `<option value="${nr}" ${nr === kiesKandidaat ? "selected" : ""}>${nr}. ${kandidaatNaam(huidige, nr).split(" (")[0]}</option>`).join("");
}
const toonKeuzes = () => {
  document.getElementById("lbl-partij").hidden = metric !== "vspartij";
  document.getElementById("lbl-kandidaat").hidden = metric !== "kandidaat";
};

function herteken() { vulPartijKeuze(); vulKandidaatKeuze(); tekenKaart(); tekenSamenvatting(); tekenKernOverzicht(); tekenMovers(); tekenTabel(); tekenPartijen(); tekenKandidaten(); }

(function init() {
  const sv = document.getElementById("sel-verkiezing");
  sv.innerHTML = ELECTIONS.map((e) => `<option value="${e.id}" ${e.id === huidige ? "selected" : ""}>${e.label}</option>`).join("");
  sv.addEventListener("change", () => { huidige = sv.value; if (metric === "perc" || metric === "afwijking" || metric === "winst") sort.key = sort.key in NIVEAU ? sort.key : huidige; herteken(); });
  document.getElementById("sel-metric").addEventListener("change", (e) => { metric = e.target.value; toonKeuzes(); tekenKaart(); });
  document.getElementById("sel-partij").addEventListener("change", (e) => { vergelijkPartij = e.target.value; tekenKaart(); });
  document.getElementById("sel-kandidaat").addEventListener("change", (e) => { kiesKandidaat = e.target.value; tekenKaart(); tekenKandidaten(); });
  document.querySelectorAll("#weergave-toggle button").forEach((b) => b.addEventListener("click", () => {
    weergave = b.dataset.w;
    document.querySelectorAll("#weergave-toggle button").forEach((x) => x.classList.toggle("actief", x === b));
    tekenKaart();
  }));
  document.querySelectorAll("#niveau-filter input").forEach((cb) => cb.addEventListener("change", () => {
    zichtbaar = new Set([...document.querySelectorAll("#niveau-filter input:checked")].map((x) => x.value));
    if (zichtbaar.size === 0) { cb.checked = true; zichtbaar.add(cb.value); }
    tekenTabel();
  }));
  document.getElementById("btn-csv").addEventListener("click", downloadCsv);
  const selDetail = document.getElementById("sel-detail");
  if (selDetail) {                                  // #15 — kaartdetail (vol/licht) onthouden
    selDetail.value = localStorage.getItem("kaartdetail") || "auto";
    selDetail.addEventListener("change", () => {
      localStorage.setItem("kaartdetail", selDetail.value);
      location.reload();                            // ander basemap-bestand laden
    });
  }
  if (typeof META !== "undefined") {
    const ok = META.controle === "ok";
    document.getElementById("meta-info").innerHTML =
      ` · Laatst bijgewerkt: ${META.bijgewerkt} · integriteitscheck: <b style="color:${ok ? "#1e8449" : "#c0392b"}">${ok ? "✓ klopt met officiële totalen" : META.controle}</b>`;
  }
  herteken();
})();
