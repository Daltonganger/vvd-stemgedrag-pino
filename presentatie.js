"use strict";
/* ---------------- #11: presentatiemodus ---------------- */
const getekend = (value) => (value > 0 ? "+" : "") + value.toFixed(1);
const presVragen = () => {
  const e = ELECTIONS.find((x) => x.id === huidige), g = gemAvg[huidige];
  const lijst = STEMBUREAUS.map((s) => ({ s, p: pctOf(s.id, huidige) })).filter((x) => x.p != null).sort((a, b) => b.p - a.p);
  const top = lijst.slice(0, 3);
  const pr = prevSameSoort(e);
  const dalers = pr ? STEMBUREAUS.filter((s) => !s.mobiel).map((s) => {
    const a = pctOf(s.id, huidige), b = pctOf(s.id, pr);
    return a == null || b == null ? null : { s, d: a - b };
  }).filter((x) => x && x.d < 0).sort((x, y) => x.d - y.d).slice(0, 3) : [];
  const mwLijst = STEMBUREAUS.map((s) => ({ s, m: meerwaarde(s.id) })).filter((x) => x.m != null).sort((a, b) => b.m - a.m);
  const gp = gemPositie[huidige];
  const trend = NIVEAU_ORDER.map((n) => {
    const els = ELECTIONS.filter((x) => x.soort === n).slice(-2);
    return els.length === 2 ? `${NIVEAU[n]} ’${String(els[0].jaar).slice(2)}→’${String(els[1].jaar).slice(2)}: ${gemAvg[els[0].id].pct.toFixed(1)}% → ${gemAvg[els[1].id].pct.toFixed(1)}%` : null;
  }).filter(Boolean);
  return [
    { k: "1 · Waar staan we sterk?", big: `${g.pct.toFixed(1)}%`, sub: `VVD-gemiddelde ${e.label} in Pijnacker-Nootdorp — ${g.vvd.toLocaleString("nl")} van ${g.geldig.toLocaleString("nl")} geldige stemmen (${g.n} stembureaus).`, lijst: top.map((x) => `<li><b>${x.p.toFixed(1)}%</b> — ${x.s.naam}</li>`).join("") },
    { k: "2 · Waar verliezen we?", big: dalers.length ? `${dalers[0].d.toFixed(1)} pp` : "—", sub: `Grootste dalers bij ${e.label} t.o.v. vorige keer (zelfde niveau)${pr ? ` (’${String(ELECTIONS.find((x) => x.id === pr).jaar).slice(2)})` : ""}:`, lijst: dalers.map((x) => `<li><b>${x.d > 0 ? "+" : ""}${x.d.toFixed(1)} pp</b> — ${x.s.naam}</li>`).join("") || "<li>geen dalers</li>" },
    { k: "3 · Lokale meerwaarde", big: mwLijst.length ? `${getekend(mwLijst[0].m)} pp` : "—", sub: `Hoogste verschillen tussen gemeentelijk en landelijk VVD-aandeel; negatieve waarden zijn een achterstand (${LAATSTE_GR.label} vs ${LAATSTE_TK.label}):`, lijst: mwLijst.slice(0, 3).map((x) => `<li><b>${getekend(x.m)} pp</b> — ${x.s.naam}</li>`).join("") },
    { k: "4 · Positie & trend", big: gp ? `${gp.score.toFixed(1)}/10` : "—", sub: `Index van de stemverdeling met vaste CHES 2024-partijposities bij ${e.label} (links 0 ↔ rechts 10, dekking ${gp && gp.dekking != null ? gp.dekking.toFixed(0) + "%" : "onbekend"}). Trend per niveau:`, lijst: trend.map((t) => `<li>${t}</li>`).join("") },
  ];
};
let presIdx = 0, presOpen = false, presFocusTerug = null;
function toonPresSlide() {
  const slides = presVragen();
  presIdx = Math.max(0, Math.min(slides.length - 1, presIdx));
  const s = slides[presIdx];
  document.getElementById("pres-slide").innerHTML =
    `<div class="pres-kicker">${s.k}</div><div class="pres-big">${s.big}</div>` +
    `<div class="pres-sub">${s.sub}</div>` + (s.lijst ? `<ul class="pres-lijst">${s.lijst}</ul>` : "");
  document.getElementById("pres-teller").textContent = `${presIdx + 1} / ${slides.length}`;
  meld(`Scherm ${presIdx + 1} van ${slides.length}: ${s.k}`);
}
function openPres() {
  presOpen = true; presIdx = 0; presFocusTerug = document.activeElement;
  document.getElementById("presentatie").hidden = false;
  document.body.classList.add("pres-open");
  document.querySelectorAll("body > header, body > main, body > section, body > footer").forEach((el) => el.inert = true);
  toonPresSlide();
  document.getElementById("pres-next").focus();
}
function sluitPres() {
  presOpen = false;
  document.getElementById("presentatie").hidden = true;
  document.body.classList.remove("pres-open");
  document.querySelectorAll("[inert]").forEach((el) => el.inert = false);
  if (presFocusTerug) presFocusTerug.focus();
}
