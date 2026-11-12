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
  let v = 0, g = 0, ub = 0, kg = 0, n = 0, completeTurnout = true;
  const partijen = new Map();
  for (const s of STEMBUREAUS) {
    const u = getU(s.id, e.id);
    if (!u) continue;
    if (u.uitgebracht == null || u.kiesg == null) completeTurnout = false;
    n++; v += u.vvd; g += u.geldig; ub += u.uitgebracht || 0; kg += u.kiesg || 0;
    for (const [naam, votes] of u.partijen || []) partijen.set(naam, (partijen.get(naam) || 0) + votes);
  }
  const top = [...partijen.entries()].sort((a, b) => b[1] - a[1]);
  gemAvg[e.id] = { vvd: v, geldig: g, pct: g ? (100 * v) / g : null, n,
    opkomst: completeTurnout && kg ? (100 * ub) / kg : null, uitgebracht: ub, kiesg: kg, top };
}

// ---- #6: aggregatie naar kern (Pijnacker / Nootdorp / Delfgauw) o.b.v. postcode ----
const KERN_PC = { "2631": "Nootdorp", "2632": "Nootdorp", "2645": "Delfgauw" };
function kernVan(s) {
  if (!s) return null;
  if (s.kern) return s.kern;
  if (!s.postcode) return null;
  const p4 = s.postcode.slice(0, 4);
  return KERN_PC[p4] || (/^264[123]$/.test(p4) ? "Pijnacker" : null);
}
const KERNEN = ["Pijnacker", "Nootdorp", "Delfgauw"];
const kernId = (k) => "K:" + k;
const kernCentroid = {};
// kern-pseudostembureaus in idx + sbById zetten -> alle bestaande functies werken ook voor kernen
for (const k of KERNEN) {
  const leden = STEMBUREAUS.filter((s) => !s.mobiel && kernVan(s) === k);
  const plekken = leden.filter((s) => s.lat && s.lon);
  const lat = plekken.reduce((a, s) => a + s.lat, 0) / (plekken.length || 1);
  const lon = plekken.reduce((a, s) => a + s.lon, 0) / (plekken.length || 1);
  kernCentroid[k] = [lat, lon];
  sbById.set(kernId(k), { id: kernId(k), naam: k + " (hele kern)", lat, lon, mobiel: false, kern: true });
  for (const e of ELECTIONS) {
    let v = 0, g = 0, ub = 0, kg = 0, heeft = false, completeTurnout = true;
    const partijen = new Map(), vk = new Map();
    for (const s of leden) {
      const u = getU(s.id, e.id); if (!u) continue;
      if (u.uitgebracht == null || u.kiesg == null) completeTurnout = false;
      heeft = true; v += u.vvd; g += u.geldig; ub += u.uitgebracht || 0; kg += u.kiesg || 0;
      for (const [naam, votes] of u.partijen || []) partijen.set(naam, (partijen.get(naam) || 0) + votes);
      for (const [nr, votes] of u.vk || []) vk.set(nr, (vk.get(nr) || 0) + votes);
    }
    if (heeft) idx.set(kernId(k) + "|" + e.id, {
      sb: kernId(k), soort: e.soort, jaar: e.jaar, vvd: v, geldig: g, uitgebracht: completeTurnout ? ub : null, kiesg: completeTurnout ? kg : null,
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
function opkomstPct(sb, e) { const u = getU(sb, e); return u && u.kiesg && u.uitgebracht != null ? (100 * u.uitgebracht) / u.kiesg : null; }

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

// ---- #18: links/rechts-positie per stembureau (CHES 2024 lrgen, 0=links t/m 10=rechts) ----
const LR = typeof PARTIJEN_LR !== "undefined" ? PARTIJEN_LR : {};
const lrVan = (naam) => LR[naam.toUpperCase().replace(/\s+/g, " ").trim()];
// gewogen gemiddelde lrgen over partijen met bekende score; dekking = aandeel stemmen met score
function positie(sb, e) {
  const u = getU(sb, e);
  if (!u || !u.geldig) return null;
  let som = 0, gedekt = 0;
  for (const [naam, v] of u.partijen || []) {
    const lr = lrVan(naam);
    if (lr != null) { som += v * lr; gedekt += v; }
  }
  if (!gedekt) return null;
  return { score: som / gedekt, dekking: (100 * gedekt) / u.geldig };
}
// gemeente-gemiddelde positie per verkiezing (gewogen over geldige stemmen met score)
const gemPositie = {};
for (const e of ELECTIONS) {
  let som = 0, gedekt = 0;
  for (const s of STEMBUREAUS) {
    const u = getU(s.id, e.id);
    if (!u || !u.geldig) continue;
    for (const [naam, v] of u.partijen || []) {
      const lr = lrVan(naam);
      if (lr != null) { som += v * lr; gedekt += v; }
    }
  }
  // dekking = aandeel van alle geldige stemmen in de gemeente dat een score heeft
  let totaalGeldig = 0;
  for (const s of STEMBUREAUS) { const u = getU(s.id, e.id); if (u && u.geldig) totaalGeldig += u.geldig; }
  gemPositie[e.id] = gedekt ? { score: som / gedekt, dekking: totaalGeldig ? (100 * gedekt) / totaalGeldig : 0 } : null;
}
