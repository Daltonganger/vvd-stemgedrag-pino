# Verbeterplan — VVD Stemgedrag Pijnacker-Nootdorp

Verbeteringen voor de website, gerangschikt op waarde voor de bestuurspresentatie.
Per open punt: **impact**, **werk** (S/M/L) en concreet wat te doen.

---

## ✅ Gedaan

- **Huisstijl** — officiële VVD-brandbook: blauw `#0A2CCA`, oranje `#FF6400`, wit; Arial
  (fallback voor het gelicentieerde Aeonik); titels met punt; "VVD"-wordmark met oranje schaduw.
- **#1 Offline-proof** — Leaflet/Chart.js + een vector-basiskaart lokaal gevendord; geen internet
  meer nodig op een bestuursavond.
- **#2 Andere partijen** — per stembureau de grootste partij + concurrenten ("waar verliezen we
  aan wie?"), uit de bestaande EML's.
- **#3 Opkomst** — gemeente-opkomst% per verkiezing + uitgebrachte stemmen per stembureau,
  gekalibreerd tegen de officiële totalen.
- **#4 Choropleth** — Thiessen/Voronoi-vlakken rond elk stembureau, geknipt op de PDOK-gemeentegrens;
  schakelaar Vlakken / Stippen, dekking 100%.
- **#5 Stijgers & dalers** — ranglijst van de grootste VVD-Δ %-punt t.o.v. de vorige verkiezing,
  klikbaar, in het zijpaneel.
- **#6 Kernen** — stembureaus gegroepeerd naar Pijnacker / Nootdorp / Delfgauw (postcode); aparte
  "Kernen"-weergave + "Per kern"-kaart.
- **#7 Matching over de jaren** — clustering op postcode i.p.v. naam; varianten samengevoegd,
  geen dubbele postcodes meer.
- **#10 Alles bijwerken + integriteitscheck** — `scripts/update_all.py` draait alle build-stappen
  op volgorde; som per verkiezing wordt tegen het gemeentetotaal gecontroleerd; status in de footer.
- **#12 VVD-kandidaten** — voorkeurstemmen per kandidaat per stembureau/kern, met namen uit de
  Kandidatenlijst-EML; kaartweergave "Aandeel VVD-kandidaat".
- **#13 Europees Parlement 2024 toegevoegd** — EP als nieuw niveau ("Europees", eigen kleur) naast
  TK/PS/GR, met EP2024-uitslag per stembureau (18 locaties). Additief gemerged via
  `scripts/merge_election.py` zonder volle rebuild, zodat bestaande verkiezingen niet verloren gaan
  als de bron-host hapert. Harvest heeft nu retries + User-Agent tegen transient 503's.
- **#13 Gemeenteraad 2014 toegevoegd** — dode legacy-host omzeild: EML-telling gered uit het
  Internet Archive (afgekapte zip, lokale zip-headers gescand). 24 stembureaus; 18 mappen op
  bestaande locaties, 6 verdwenen 2014-bureaus (CulturA, Sociaal Cultureel centrum, Infocentrum
  Keijzershof, Kantine Meersma, Basisschool De Schatkaart/Sint Jozef) als eigen locatie aangemaakt
  door `merge_election.py` (geocode weigert nu gemeente/woonplaats-treffers → tabel-only als geen
  echt adres). `build_gebieden.py` opnieuw gedraaid: GR2014 = 18 vlakken. VVD 16,5% (3391/20505).
  Let op: geen aparte Totaaltelling-referentie (uit de telling zelf), dus integriteitscheck
  overgeslagen. (EP2019 wacht nog op de legacy-host — zie #13-rest.)
- **#14 Mobiel/responsive + uitleg bij lege cellen** — vloeiende layout op telefoon (controls vol
  breed, ruimere tapdoelen, horizontaal scrollbare tabel met vaste eerste kolom); lege tabelcellen
  tonen "–" met tooltip "geen uitslag — stembureau bestond toen niet of telde niet mee" + uitleg in
  de voettekst.
- **#15 Basiskaart slim laden + meer detail** — volle `data/basemap.js` (~14 MB) verrijkt met
  groen/parken/bos, spoorlijnen en voet-/fietspaden; plus `basemap.lite.js` (~2 MB, ≈95% minder
  punten via Douglas-Peucker; woonstraten/paden/mini-vlakken weg). Een mini-picker in `index.html`
  kiest vóór het laden: licht op mobiel / databesparing / trage verbinding, vol op de rest;
  handmatige Auto/Vol/Licht-toggle (footer) onthouden in `localStorage`. Cache-buster `?v=<datum>`
  op de basemap-URL zodat browsers na een data-rebuild vers laden. Lite wordt in `update_all.py`
  mee-gebouwd door `scripts/build_basemap_lite.py`.

---

## Open

### #20. CSV-export uitgebreid — GEDAAN
Per verkiezing `positie(L-R)` + `dekking%` in de wide export (122 kolommen) en een nieuwe
long-format export (`downloadCsvPartijen()` → `vvd-stemgedrag-partijen-lang.csv`, 6426 regels:
stembureau × verkiezing × partij). Movers nu RdBu `#2166ac`/`#b2182b` (kleurenblind-veilig,
matcht de divergente kaart).

### #21. Auto cache-buster + kandidaten alle zip-delen — GEDAAN
`index.html` laadt `style.css`/`app.js` met `?v=META.bijgewerkt` (geen handmatige bump).
`harvest.py` scant álle zip-delen op de Kandidatenlijst → `kandidaten.js` nu 701 VVD-namen
over 16/17 verkiezingen (TK2017 CSV-bron heeft geen kandidaatkolommen).

### #22. Eerlijke integriteitscheck — GEDAAN
Referentie-totaal wordt uit de gemeente-telling zelf afgeleid (`totaal_from_telling`)
voor zips zonder aparte Totaaltelling → **16/17 verkiezingen geverifieerd**; footer toont
`✓ 16/17 verified tegen officiële totalen`.

### #23. Alle stemlocaties handmatig gelokaliseerd — GEDAAN
`scripts/geocode_handmatig.py`: 13 locaties met handmatig geverifieerde adressen
(officiële PV-PDFs, gemeente-site, SBI-register, AD) → **58/58 locaties op de kaart,
0 zonder coördinaat, 0 buiten de gemeentegrens**.

### #19. Oudere verkiezingen + stemverdeling in popup — GEDAAN
**17 verkiezingen** nu in de data: EP2009/2014/2019/2024, TK2010/2012/2017/2021/2023/2025,
PS2015/2019/2023, GR2014/2018/2022/2026. `harvest.py` heeft directe ZIP-URLs
(`DIRECT_ZIPS`) voor de oudere jaren; **TK2017** had géén per-stembureau EML voor
Pijnacker-Nootdorp — die parse je uit de CSV in `Gemeente_overige_uitslagen/`
(`parse_tk2017_csv`, lijstnr→partij via Kandidatenlijsten kieskring Leiden; de
'Totaal'-regel wordt overgeslagen; geldige stemmen = som partij-kolommen). Gemerged
via `merge_election.py`, `build_gebieden.py` opnieuw gedraaid (17 verkiezings-gebieden).
**Popup**: bij openen van een stembureau direct top-8 partijen van de gekozen
verkiezing (VVD gemarkeerd) + VVD-% per verkiezing + positie. Standaard zie je alleen
VVD; de rest zit in de popup/het zijpaneel.

### #18. Politieke positie per stembureau (links↔rechts) — GEDAAN
**CHES 2024** `lrgen` (0=links, 10=rechts) per Nederlandse partij → `scripts/fetch_partijen_lr.py`
→ `data/partijen_lr.js` (26 namen incl. fusies; JA21 via ParlGov 8.8). In app.js:
gewogen positie per stembureau per verkiezing (`positie()`), gemeente-gemiddelde per
verkiezing, nieuwe kaartmaat "Politieke positie" (paars↔grijs↔oranje rond 5), sorteerbare
tabelkolom, popup-regel met dekking, samenvattingsrij, lijn in de grafiek (tweede as 0–10)
en zijpaneel met per-niveau- en alles-samen-overzicht. Lokale partijen zonder score
tellen niet mee; dekking (% stemmen mét score) wordt overal getoond
(bv. GR2026 ≈ 65%, TK/EP ≈ 98%).

### #8. Kleurenblind-veilig + toegankelijkheid — GEDAAN
Divergente kaartvlakken/stippen krijgen een SVG-patroon (stijgende vs. dalende strepen) bovenop
de RdBu-kleur — kleur én vorm geven de richting aan, ook in grijswaarden/print. Tabel al
toetsenbord-navigeerbaar (Enter/Space op koppen en rijen), ARIA-labels op kaart/tabel,
`aria-live`-regio voor schermlezer-meldingen, focus-terugkeer bij presentatiemodus.

### #9. PNG-export + deelbare link — GEDAAN
`exporteerPng()` tekent de kaart zelf op een canvas (basemap + verkiezingsvlakken incl. patronen
+ titelbalk met verkiezing/metric/datum) → download als `vvd-kaart-<verkiezing>-<metric>.png`.
Permalink: URL-hash `#v=..&m=..&w=..&sb=..` wordt bij elke wijziging meege wrote (`schrijfHash`)
en bij laden hersteld (`leesHash`); knop 🔗 kopieert de link naar het klembord.

### #11. Presentatiemodus — GEDAAN
Volledig-scherm overlay (knop ▶ Presentatie) met 4 schermen: (1) waar sterk (gemiddelde + top-3),
(2) waar verliezen we (grootste dalers t.o.v. vorige keer), (3) lokale meerwaarde (top-3), (4) positie
& trend per niveau. Pijltjestoetsen/PgUp/PgDn/Esc, focus-terugkeer, aria-live melding per scherm.

### #13-rest. EP2019 binnenhalen — GEDAAN (#19)
EP2019 stond wél gewoon op data.overheid.nl, alleen niet op de dode legacy-host
(`/OpenDataSets/`) waar harvest.py naar keek; directe ZIP-URL in `DIRECT_ZIPS` lost het op.

### #16. SRI-integrity-hashes op vendor-scripts — GEDAAN
`index.html` heeft `integrity="sha384-…"` + `crossorigin="anonymous"` op `vendor/leaflet.css`,
`vendor/leaflet.js` en `vendor/chart.umd.min.js`.

### #17. Online hosten via GitHub Pages
**Impact: middel · Werk: S**
Dit is een volledig **statische site** (`index.html` + `app.js` + `style.css` + `data/*.js` +
`vendor/`), dus hij kan zónder server gratis op **GitHub Pages**. Stappenplan:
1. Repo nog niet onder git → `git init`, `.gitignore` (laat `data/` en `vendor/` er wél in — de site
   heeft ze nodig), `git add .`, eerste commit.
2. Repo op GitHub aanmaken en pushen (`gh repo create` of via de site).
3. Settings → Pages → bron = `main` / root. Site staat dan op
   `https://<gebruiker>.github.io/<repo>/`.
Aandachtspunten: `basemap.js` is ~8 MB — ruim binnen de Pages-limieten (100 MB/bestand, 1 GB repo),
maar #15 (verkleinen) maakt het laden sneller. Alle paden zijn al relatief, dus werkt meteen onder
een subpad. Eventueel later een eigen (sub)domein koppelen.

---

## Aanbevolen volgorde
Alleen **#17 (GitHub Pages)** staat nog open: zodra PR #1 gemerged is, Settings → Pages →
`main` / root aanzetten; de site is dan live op `https://<gebruiker>.github.io/<repo>/`.
