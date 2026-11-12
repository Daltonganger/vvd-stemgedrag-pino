"use strict";
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
  if (metric === "positie") { const p = positie(sb, huidige); return p ? p.score : null; }
  return null;
}
const DIVERGEND = new Set(["afwijking", "meerwaarde", "winst", "vsgrootste", "vspartij"]);
// #18: de positie-metric is sequentieel rond het centrum 5 (links↔rechts), niet divergent t.o.v. 0
const POSITIE_METRIC = "positie";
const isDiverging = () => DIVERGEND.has(metric);
function metricLabel() {
  if (metric === "vspartij") return "VVD t.o.v. " + (vergelijkPartij || "—");
  if (metric === "kandidaat") return "Aandeel " + (kiesKandidaat ? kandidaatNaam(huidige, kiesKandidaat).split(" (")[0] : "—") + " binnen VVD";
  return document.querySelector("#sel-metric").selectedOptions[0].text;
}

function positieKleur(val) {
  if (val == null) return "#bbbbbb";
  const t = Math.max(0, Math.min(1, val / 10));
  return t < 0.5 ? mix("#6a51a3", "#eeeeee", t * 2) : mix("#eeeeee", "#FF6400", (t - 0.5) * 2);
}

function colorFor(val, lo, hi, maxAbs) {
  if (val == null) return "#bbbbbb";
  if (isDiverging()) return div(maxAbs ? val / maxAbs : 0);
  if (metric === POSITIE_METRIC) return positieKleur(val);
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
  const p = positie(s.id, huidige);
  const posRij = p ? `<div class="prow"><span class="pl">Positie (links↔rechts)</span>` +
    `<span class="pp">${p.score.toFixed(1)}</span><span class="pv" title="dekking ${p.dekking.toFixed(0)}% van stemmen heeft een score">${p.dekking.toFixed(0)}%</span></div>` : "";
  // #19: bij openen van een stembureau direct de stemverdeling per partij (top 8, VVD gemarkeerd)
  const u = getU(s.id, huidige);
  const e = ELECTIONS.find((x) => x.id === huidige);
  const partijRijen = u && u.partijen && u.partijen.length
    ? `<div class="pkop" style="margin-top:.45rem"><span class="pl">Partijen — ${e.label}</span><span class="pp">%</span><span class="pv">aant.</span></div>` +
      u.partijen.slice(0, 8).map(([naam, v]) =>
        `<div class="prow${isVVD(naam) ? " vvdrij" : ""}"><span class="pl">${naam}</span>` +
        `<span class="pp">${(100 * v / u.geldig).toFixed(1)}%</span><span class="pv">${v}</span></div>`).join("")
    : "";
  return `<b class="ptitle">${s.naam}</b>` +
    `<div class="pkop"><span class="pl">Verkiezing</span><span class="pp">VVD&nbsp;%</span><span class="pv">aant.</span></div>` +
    rows + posRij + partijRijen + `<div class="popuphint">Klik voor grafiek &amp; alle partijen in het zijpaneel →</div>`;
}

// doel-id van een gebied: in kernen-weergave de kern, anders het stembureau zelf
const celDoel = (c) => weergave === "kernen" ? kernId(kernVan(sbById.get(c.sb))) : c.sb;

function kaartSchaal() {
  const ids = weergave === "stippen"
    ? mapbare.filter((s) => getU(s.id, huidige)).map((s) => s.id)
    : cellen().map(celDoel);
  const vals = ids.map(metricValue).filter((v) => v != null && Number.isFinite(v));
  return { lo: vals.length ? Math.min(...vals) : null, hi: vals.length ? Math.max(...vals) : null,
    maxAbs: Math.max(...vals.map(Math.abs), 0.001) };
}

function tekenKaart() {
  const cells = cellen();
  const actief = mapbare.filter((s) => getU(s.id, huidige));
  const vlakkenView = weergave !== "stippen";
  const { lo, hi, maxAbs } = kaartSchaal();

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
      // #8/#4: patroon bij ELKE teken-ronde opnieuw zetten (markers worden gecachet,
      // dus een class die alleen bij creatie gezet wordt blijft hangen bij metric-wissel)
      zetStipPatroon(m, val);
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
      // #8/#4: patroon bij elke teken-ronde opnieuw zetten
      if (isDiverging() && val != null) {
        L.polygon(latlngs, { stroke: false, fillOpacity: 1, interactive: false,
          className: val >= 0 ? "patroon-pos" : "patroon-neg" }).addTo(gebiedLaag);
      }
    }
  }

  toonLaag(markerLaag, weergave === "stippen");
  toonLaag(gebiedLaag, vlakkenView);
  tekenLegend(lo, hi, maxAbs);
}

function tekenLegend(lo, hi, maxAbs) {
  const el = document.getElementById("legend");
  const titel = metricLabel();
  if (lo == null) { el.innerHTML = `<b>${titel}</b><p>Geen gegevens voor deze keuze.</p>`; return; }
  let grad, links, rechts;
  if (metric === POSITIE_METRIC) {
    grad = `linear-gradient(90deg, ${colorFor(0)}, ${colorFor(5)}, ${colorFor(10)})`;
    links = "0 links"; rechts = "10 rechts";
  } else if (isDiverging()) {
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
  const gp = gemPositie[huidige];
  const positieTxt = gp ? `${gp.score.toFixed(1)} / 10 · dekking ${gp.dekking.toFixed(0)}%` : "—";
  document.getElementById("summary-body").innerHTML = `
    <div class="big">${g.pct.toFixed(1)}%</div>
    <div style="font-size:.8rem;color:var(--grijs);margin:.1rem 0 .5rem">VVD-gemiddelde ${e.label}${vvdRang ? ` · ${vvdRang}e partij` : ""} · ${g.vvd.toLocaleString("nl")} van ${g.geldig.toLocaleString("nl")} geldige stemmen · ${g.n} stembureaus</div>
    <div class="row"><span>Opkomst (gemeente)</span><span>${opkomstTxt}</span></div>
    <div class="row"><span>Grootste partij</span><span>${grootsteTxt}</span></div>
    <div class="row"><span>Index gemeente (vaste partijposities)</span><span>${positieTxt}</span></div>
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
      <div class="ksub">grootste: ${win ? win[0] : "—"} · opkomst ${opkomstPct(kernId(r.k), huidige) != null ? opkomstPct(kernId(r.k), huidige).toFixed(0) + "% (indicatief)" : "onbekend"} · ${r.u.geldig.toLocaleString("nl")} geldige stemmen</div>`;
  }).join("") || "<p class='hint'>geen kerngegevens</p>";
  const ingedeeld = rows.reduce((sum, row) => sum + row.u.geldig, 0);
  const totaal = gemAvg[huidige].geldig;
  document.getElementById("kern-body").innerHTML += `<p class="hint">Ingedeeld: ${ingedeeld.toLocaleString("nl")} van ${totaal.toLocaleString("nl")} stemmen (${(100 * ingedeeld / totaal).toFixed(1)}%). Mobiele en briefstemmen blijven buiten de kernen.</p>`;
  document.querySelectorAll("#kern-body .kernrow").forEach((r) => r.addEventListener("click", () => selecteer(r.dataset.sb)));
}

/* ---------------- #18: politieke positie per verkiezing / niveau / alles ---------------- */
function tekenPositieOverzicht() {
  const body = document.getElementById("positie-body");
  const blok = (titel, ids) => {
    const rows = ids.map((eid) => ({ e: ELECTIONS.find((x) => x.id === eid), g: gemPositie[eid] }))
      .filter((r) => r.g);
    if (!rows.length) return "";
    return `<div class="posblok"><div class="poskop">${titel}</div>` + rows.map((r) => {
      const t = Math.max(0, Math.min(1, r.g.score / 10));
      return `<div class="posrow"><span class="pl">${r.e.label}</span>` +
        `<span class="posmeter"><i style="left:${(t * 100).toFixed(1)}%"></i></span>` +
        `<span class="poswaarde"><b>${r.g.score.toFixed(1)}</b><small>dekking ${r.g.dekking.toFixed(0)}%</small></span></div>`;
    }).join("") + `</div>`;
  };
  const niveau = (soort) => ELECTIONS.filter((e) => e.soort === soort).map((e) => e.id);
  body.innerHTML = blok("Europees", niveau("EP")) + blok("Landelijk", niveau("TK")) +
    blok("Provinciaal", niveau("PS")) + blok("Gemeentelijk", niveau("GR")) +
    `<div class="posas"><span>0 links</span><span>5</span><span>10 rechts</span></div>`;
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
  if (key === "positie") { const p = positie(s.id, huidige); return p ? p.score : null; }
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
    <tr><th rowspan="2" scope="col" tabindex="0" title="Sorteer op naam">Stembureau ${arrow("naam")}</th>${groupCols}<th class="group" rowspan="2" scope="col" tabindex="0" title="Sorteer op lokale meerwaarde">Lokale<br>meerwaarde ${arrow("meerwaarde")}</th><th class="group" rowspan="2" scope="col" tabindex="0" title="Politieke positie van dit stembureau (links 0 ↔ rechts 10) bij de gekozen verkiezing — sorteer">Positie<br>(L↔R) ${arrow("positie")}</th></tr>
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
    const p = positie(s.id, huidige);
    const posCell = p == null ? `<td class="leeg" title="Geen positie te berekenen: geen uitslag of geen enkele partij met bekende links/rechts-score.">–</td>`
      : `<td class="pct" style="background:${positieKleur(p.score)}" title="Gewogen links/rechts-positie (CHES 2024) · dekking ${p.dekking.toFixed(0)}% van de stemmen">${p.score.toFixed(1)}</td>`;
    return `<tr data-sb="${s.id}" tabindex="0" aria-selected="${s.id === geselecteerd}" class="${s.mobiel ? "mobiel" : ""} ${s.id === geselecteerd ? "sel" : ""}">
      <th scope="row">${s.naam}</th>${cells}${mwCell}${posCell}</tr>`;
  }).join("");

  t.innerHTML = head + "<tbody>" + body + "</tbody>";
  t.setAttribute("aria-label", "VVD per stembureau — percentages per verkiezing; Enter selecteert een rij, klik een kolomkop om te sorteren.");
  const sorteer = (th) => {
    const k = th.dataset.k || (th.textContent.startsWith("Stembureau") ? "naam" : th.textContent.startsWith("Lokale") ? "meerwaarde" : th.textContent.startsWith("Positie") ? "positie" : null);
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
  const posData = ELECTIONS.map((e) => { const p = positie(s.id, e.id); return p ? p.score : null; });
  const positieLijnen = NIVEAU_ORDER.map((niveau) => ({
    label: "Index (L↔R)", data: ELECTIONS.map((e, i) => e.soort === niveau ? posData[i] : null),
    type: "line", borderColor: "#6a51a3", backgroundColor: "#6a51a3", borderWidth: 2,
    pointRadius: 3, yAxisID: "y2", spanGaps: true,
  }));
  const cfg = {
    type: "bar",
    data: {
      labels: ELECTIONS.map((e) => e.label.replace("Europees", "EP").replace("Landelijk", "TK").replace("Provincie", "PS").replace("Gemeente", "GR")),
      datasets: [
        { label: "VVD %", data, backgroundColor: ELECTIONS.map((e) => KLEUR_NIVEAU[e.soort]), yAxisID: "y" },
        ...positieLijnen,
      ],
    },
    options: {
      plugins: { legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 10 }, filter: (item) => item.datasetIndex <= 1 } },
        tooltip: { callbacks: { label: (c) => {
          const e = ELECTIONS[c.dataIndex], u = getU(s.id, e.id);
          if (c.datasetIndex > 0) { const p = positie(s.id, e.id); return p ? `${e.label}: positie ${p.score.toFixed(1)}/10 (dekking ${p.dekking.toFixed(0)}%)` : e.label + ": —"; }
          return u ? `${e.label}: ${pct(u).toFixed(1)}% (${u.vvd}/${u.geldig})` : e.label + ": —"; } } } },
      scales: {
        y: { ticks: { callback: (v) => v + "%" }, beginAtZero: true, title: { display: true, text: "VVD %" } },
        y2: { position: "right", min: 0, max: 10, grid: { drawOnChartArea: false }, title: { display: true, text: "links ↔ rechts" } },
      },
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
  const opk = opkomstPct(geselecteerd, huidige) != null ? ` · ${u.uitgebracht} uitgebracht (opkomst ${opkomstPct(geselecteerd, huidige).toFixed(0)}%, indicatief)` : "";
  const rij = u.partijen.map(([naam, v], i) => {
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
    toonKeuzes(); vulKandidaatKeuze(); tekenKaart(); tekenKandidaten(); schrijfHash();
  }));
}

/* ---------------- selectie ---------------- */
function selecteer(sb) {
  geselecteerd = sb;
  schrijfHash();                              // #9: selectie zit in de deelbare link
  document.querySelectorAll("#tabel tbody tr").forEach((tr) => {
    tr.classList.toggle("sel", tr.dataset.sb === sb);
    tr.setAttribute("aria-selected", String(tr.dataset.sb === sb));
  });
  const s = sbById.get(sb);
  if (weergave !== "stippen") { const p = gebiedVanSb.get(sb); if (p) { map.panTo(p.getBounds().getCenter()); p.openPopup(); } }
  else if (s.lat && markers.get(sb)) { map.panTo([s.lat, s.lon]); markers.get(sb).openPopup(); }
  tekenGrafiek();
  tekenPartijen();
  tekenKandidaten();
}

/* ---------------- CSV ---------------- */
const csvCell = (c) => `"${String(c).replace(/"/g, '""')}"`;
const csvBlob = (rows, naam) => {
  const csv = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = naam; a.click();
};
// breed formaat: per stembureau een regel, per verkiezing VVD/geldig/%/uitgebracht/grootste/positie/dekking
function downloadCsv() {
  const els = ELECTIONS;
  const head = ["Stembureau", "Postcode",
    ...els.flatMap((e) => [e.label + " VVD", e.label + " geldig", e.label + " %", e.label + " uitgebracht",
      e.label + " grootste partij", e.label + " positie(L-R)", e.label + " dekking%"]),
    "Lokale meerwaarde (pp)"];
  const rows = STEMBUREAUS.map((s) => {
    const vals = els.flatMap((e) => {
      const u = getU(s.id, e.id);
      if (!u) return ["", "", "", "", "", "", ""];
      const p = positie(s.id, e.id);
      return [u.vvd, u.geldig, pct(u).toFixed(1), u.uitgebracht ?? "", winnaar(s.id, e.id) || "",
        p ? p.score.toFixed(2) : "", p ? p.dekking.toFixed(0) : ""];
    });
    const mw = meerwaarde(s.id);
    return [s.naam, s.postcode, ...vals, mw == null ? "" : mw.toFixed(1)];
  });
  csvBlob([head, ...rows], "vvd-stemgedrag-pijnacker-nootdorp.csv");
}
// lang formaat: per stembureau × verkiezing × partij een regel (handig voor pivots in Excel)
function downloadCsvPartijen() {
  const head = ["Stembureau", "Verkiezing", "Partij", "Stemmen", "% van geldig", "Links-rechts (CHES 0-10)"];
  const rows = [head];
  for (const s of STEMBUREAUS) for (const e of ELECTIONS) {
    const u = getU(s.id, e.id);
    if (!u || !u.partijen) continue;
    for (const [naam, v] of u.partijen) {
      const lr = lrVan(naam);
      rows.push([s.naam, e.label, naam, v, (100 * v / u.geldig).toFixed(2), lr != null ? lr : ""]);
    }
  }
  csvBlob(rows, "vvd-stemgedrag-partijen-lang.csv");
}

/* ---------------- #8: patronen op divergente vlakken (kleur + vorm) ---------------- */
// SVG-patroondeftypes in de kaartcontainer; Leaflet-polygoon krijgt class patroon-pos/neg.
function voegPatronenToe() {
  const mk = (id, dir) => `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(${dir})">
    <rect width="7" height="7" fill="rgba(255,255,255,0)"/><rect width="3" height="7" fill="rgba(255,255,255,.38)"/></pattern>`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", 0); svg.setAttribute("height", 0); svg.style.position = "absolute";
  svg.innerHTML = `<defs>${mk("patroon-pos", 45)}${mk("patroon-neg", -45)}</defs>`;
  document.getElementById("map").appendChild(svg);
}
voegPatronenToe();
// Alleen stippen worden hergebruikt. Hun randpatroon moet bij iedere wijziging mee.
function zetStipPatroon(laag, val) {
  function toepassen() {
    const el = laag.getElement();
    if (!el) return;
    el.classList.remove("patroon-pos-stip", "patroon-neg-stip");
    if (isDiverging() && val != null) el.classList.add(val >= 0 ? "patroon-pos-stip" : "patroon-neg-stip");
  }
  toepassen();
  if (laag._patroonHerkans) laag.off("add", laag._patroonHerkans);
  laag._patroonHerkans = toepassen;
  laag.on("add", toepassen);
}

/* ---------------- #9: permalink (URL-hash) ---------------- */
function leesHash() {
  const vorige = huidige;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("v") && ELECTIONS.some((e) => e.id === h.get("v"))) huidige = h.get("v");
  if (sort.key === vorige) sort.key = huidige;
  if ([...document.querySelectorAll("#sel-metric option")].some((o) => o.value === h.get("m"))) metric = h.get("m");
  if (["gebieden", "kernen", "stippen"].includes(h.get("w"))) weergave = h.get("w");
  geselecteerd = sbById.has(h.get("sb")) ? h.get("sb") : null;
  vergelijkPartij = h.get("partij");
  kiesKandidaat = h.get("kandidaat");
  if (h.has("n")) {
    const niveaus = h.get("n").split(",").filter((n) => NIVEAU_ORDER.includes(n));
    zichtbaar = new Set(niveaus.length ? niveaus : NIVEAU_ORDER);
  }
}
// zet de besturingselementen op de state die leesHash() heeft hersteld
function pasBesturingToe() {
  document.querySelectorAll("#niveau-filter input").forEach((cb) => cb.checked = zichtbaar.has(cb.value));
  const sv = document.getElementById("sel-verkiezing");
  if (sv && sv.querySelector(`option[value="${huidige}"]`)) sv.value = huidige;
  const sm = document.getElementById("sel-metric");
  if (sm && sm.querySelector(`option[value="${metric}"]`)) sm.value = metric;
  document.querySelectorAll("#weergave-toggle button").forEach((x) => x.classList.toggle("actief", x.dataset.w === weergave));
}
function schrijfHash() {
  const h = new URLSearchParams({ v: huidige, m: metric, w: weergave, n: [...zichtbaar].join(",") });
  if (geselecteerd) h.set("sb", geselecteerd);
  if (metric === "vspartij" && vergelijkPartij) h.set("partij", vergelijkPartij);
  if (metric === "kandidaat" && kiesKandidaat) h.set("kandidaat", kiesKandidaat);
  history.replaceState(null, "", "#" + h.toString());
}

function meld(t) { const l = document.getElementById("live"); l.textContent = ""; requestAnimationFrame(() => l.textContent = t); }

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

let herteken = function () { vulPartijKeuze(); vulKandidaatKeuze(); tekenKaart(); tekenSamenvatting(); tekenKernOverzicht(); tekenPositieOverzicht(); tekenMovers(); tekenTabel(); tekenPartijen(); tekenKandidaten(); tekenGrafiek(); schrijfHash(); };

(function init() {
  leesHash();                                   // #9: gedeelde link herstelt weergave
  const sv = document.getElementById("sel-verkiezing");
  sv.innerHTML = ELECTIONS.map((e) => `<option value="${e.id}" ${e.id === huidige ? "selected" : ""}>${e.label}</option>`).join("");
  pasBesturingToe();                            // dropdowns/segment-knoppen op de herstelde state
  toonKeuzes();
  sv.addEventListener("change", () => {
    huidige = sv.value;
    // bij een verkiezing-gebaseerde sorteerkolom: naar de nieuwe verkiezing; naam/meerwaarde/positie blijven
    if (sort.key !== "naam" && sort.key !== "meerwaarde" && sort.key !== "positie") sort.key = huidige;
    herteken();
  });
  // #9: elke weergave-wijziging moet óók in de permalink-hash belanden
  document.getElementById("sel-metric").addEventListener("change", (e) => { metric = e.target.value; toonKeuzes(); tekenKaart(); schrijfHash(); });
  document.getElementById("sel-partij").addEventListener("change", (e) => { vergelijkPartij = e.target.value; tekenKaart(); schrijfHash(); });
  document.getElementById("sel-kandidaat").addEventListener("change", (e) => { kiesKandidaat = e.target.value; tekenKaart(); tekenKandidaten(); schrijfHash(); });
  document.querySelectorAll("#weergave-toggle button").forEach((b) => b.addEventListener("click", () => {
    weergave = b.dataset.w;
    document.querySelectorAll("#weergave-toggle button").forEach((x) => x.classList.toggle("actief", x === b));
    tekenKaart();
    schrijfHash();
  }));
  document.querySelectorAll("#niveau-filter input").forEach((cb) => cb.addEventListener("change", () => {
    zichtbaar = new Set([...document.querySelectorAll("#niveau-filter input:checked")].map((x) => x.value));
    if (zichtbaar.size === 0) { cb.checked = true; zichtbaar.add(cb.value); }
    tekenTabel(); schrijfHash();
  }));
  document.getElementById("btn-csv").addEventListener("click", downloadCsv);
  document.getElementById("btn-csv-partijen").addEventListener("click", downloadCsvPartijen);
  // #9: PNG-export + deelbare link
  document.getElementById("btn-png").addEventListener("click", exporteerPng);
  document.getElementById("btn-link").addEventListener("click", () => {
    schrijfHash();
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      () => meld("Link gekopieerd: " + url),
      () => { prompt("Kopieer de link:", url); });
  });
  // #11: presentatiemodus
  document.getElementById("btn-presentatie").addEventListener("click", openPres);
  document.getElementById("pres-sluit").addEventListener("click", sluitPres);
  document.getElementById("pres-next").addEventListener("click", () => { presIdx++; toonPresSlide(); });
  document.getElementById("pres-prev").addEventListener("click", () => { presIdx--; toonPresSlide(); });
  document.addEventListener("keydown", (e) => {
    if (!presOpen) return;
    if (e.key === "Tab") {
      const buttons = [...document.querySelectorAll("#presentatie button")];
      const at = buttons.indexOf(document.activeElement);
      buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      e.preventDefault();
    } else if (e.key === "Escape") sluitPres();
    else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); presIdx++; toonPresSlide(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); presIdx--; toonPresSlide(); }
  });
  // (herteken schrijft zelf al de hash — zie definitie hierboven)
  const selDetail = document.getElementById("sel-detail");
  if (selDetail) {                                  // #15 — kaartdetail (vol/licht) onthouden
    try { selDetail.value = localStorage.getItem("kaartdetail") || "auto"; } catch (e) { selDetail.value = "auto"; }
    selDetail.addEventListener("change", () => {
      try { localStorage.setItem("kaartdetail", selDetail.value); } catch (e) { meld("Kaartvoorkeur kan niet worden opgeslagen."); return; }
      location.reload();                            // ander basemap-bestand laden
    });
  }
  if (typeof META !== "undefined") {
    const nG = (META.geverifieerd || []).length, nT = (META.verkiezingen || []).length;
    const ok = /^ok/.test(META.controle || "");
    // Eerlijk over de bron: bij de meeste verkiezingen is het referentietotaal afgeleid uit
    // dezelfde gemeentetelling, dus dit vangt parse-fouten — niet of de bron zelf klopt.
    const uitleg = "De som per stembureau is gecontroleerd tegen het gemeentetotaal. " +
      "Een deel van de referentietotalen komt uit dezelfde telling. Dit controleert " +
      "de verwerking; het is geen onafhankelijke herverificatie van alle bronuitslagen.";
    document.getElementById("meta-info").innerHTML =
      ` · Laatst bijgewerkt: ${META.bijgewerkt.slice(0, 10)} · integriteitscheck: <b style="color:${ok ? "#1e8449" : "#c0392b"}" title="${uitleg}">${ok ? `✓ ${nG}/${nT} totalen kloppen` : META.controle}</b>`;
  }
  window.addEventListener("hashchange", () => {
    leesHash(); pasBesturingToe(); toonKeuzes(); herteken();
    if (geselecteerd) selecteer(geselecteerd);
  });
  herteken();
  // #9: kwam de selectie uit de permalink? Dan meteen grafiek + partijen tonen.
  if (geselecteerd) selecteer(geselecteerd);
})();
