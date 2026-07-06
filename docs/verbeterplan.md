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

### #8. Kleurenblind-veilig + toegankelijkheid
**Impact: middel · Werk: S**
Rood/groen (winst/verlies) is lastig voor ~8% van de mannen. Voeg patronen/cijferlabels toe, maak
de tabel toetsenbord-navigeerbaar en zet ARIA-labels. Lage moeite, breder bruikbaar.

### #9. Export naar PDF/PNG + deelbare link
**Impact: middel · Werk: M**
Knop "exporteer kaart/grafiek als afbeelding" en een print-nette PDF-handout. Plus een permalink
die de gekozen verkiezing/kaartweergave bewaart — handig om vooraf rond te sturen.

### #11. Presentatiemodus / verhaallijn
**Impact: middel · Werk: M**
Een volledig-scherm "verhaalmodus" die het bestuur stap voor stap meeneemt: (1) waar is de VVD sterk,
(2) waar verliezen we, (3) lokale meerwaarde, (4) trend over de jaren. Grote cijfers, één boodschap per
scherm, navigeren met pijltjestoetsen. Maakt van de tool een kant-en-klare pitch.

### #13-rest. EP2019 binnenhalen (wacht op bron-host)
**Impact: hoog · Werk: S** — code is klaar
EP2024 + GR2014 staan erin. Alleen **EP2019** ontbreekt nog: enige schone per-stembureau EML voor
Pijnacker staat op de dode legacy-host `data.overheid.nl/OpenDataSets/verkiezingen/`. Geen alternatief
gevonden (Internet Archive heeft geen snapshot; data.overheid.nl-mirrors bevatten enkel ándere
gemeenten; Kiesraad verkiezingsuitslagen.nl geeft de data achter een XHR die voor Pijnacker leeg/500
teruggeeft). Retry-loop pollt de host; zodra 200: `python3 scripts/harvest.py` +
`python3 scripts/merge_election.py EP 2019`.

### #16. SRI-integrity-hashes op vendor-scripts
**Impact: laag · Werk: S**
Als de map ooit extern gehost wordt (zie #17), voorkomt een `integrity="sha384-…"` + `crossorigin`
op `vendor/leaflet.js`, `chart.umd.min.js` e.d. dat een onopgemerkte wijziging van die bestanden
ongemerkt meedraait. Hashes genereren met `openssl dgst -sha384 -binary <file> | openssl base64 -A`
en in `index.html` zetten. (Lokaal/offline minder kritisch, maar netjes en gratis bij hosting.)

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
**#8 (toegankelijkheid)** als snelle win, **#17 (hosten)** zodra je het wilt delen — met **#16 (SRI)**
erbij. **#13-rest (EP2019 + GR2014)** afmaken zodra de bron-host weer leeft. **#11
(presentatiemodus)** is de mooie afronding als de inhoud staat.
