# VVD Pijnacker-Nootdorp — stemgedrag per stembureau

Een statische website die per stembureau de VVD-uitslag vergelijkt over drie niveaus
(landelijk / provincie / gemeente) en meerdere jaren, met een interactieve kaart,
sorteerbare tabel, grafiek per stembureau en CSV-export. Bedoeld voor presentatie aan
het bestuur.

## Openen
- **Lokaal:** dubbelklik `index.html`. Werkt direct, geen server nodig.
- **Online:** zet de map op GitHub Pages (of een willekeurige webhost).
- ✅ **Volledig offline / presentatie-proof.** Geen internet nodig: Leaflet en Chart.js
  staan lokaal in `vendor/`, het lettertype in `font/`, en de kaart is een **offline
  vector-basiskaart** (`data/basemap.js`) uit OpenStreetMap-data — geen kaartserver.
  Getest: de pagina doet bij laden **nul externe requests**.

## Wat zie je
- **Kaart** — schakelbaar tussen **Vlakken** (per stembureau), **Kernen** (Pijnacker /
  Nootdorp / Delfgauw apart ingekleurd) en **Stippen**. Kleur = gekozen maatstaf ("Kaart toont"):
  - VVD-% van de gekozen verkiezing
  - Afwijking t.o.v. het VVD-gemeentegemiddelde (rood onder / groen boven)
  - Lokale meerwaarde: laatste gemeente-% minus laatste landelijk-%
  - Winst/verlies t.o.v. de vorige verkiezing van hetzelfde niveau
  - VVD t.o.v. de grootste partij (voorsprong/achterstand)
- **Tabel** — VVD-% (met aantallen) per verkiezing, gegroepeerd per niveau, sorteerbaar;
  klik een rij om de grafiek, partijen en kaart te focussen. Kolom **Lokale meerwaarde** =
  hoeveel beter (of slechter) de VVD lokaal scoort dan landelijk.
- **Samenvatting** — per verkiezing: VVD-gemeentegemiddelde, **opkomst (gemeente)**,
  **grootste partij** en de rang van de VVD.
- **Per kern** — VVD-%, opkomst en grootste partij per kern (Pijnacker / Nootdorp / Delfgauw).
- **Stijgers & dalers** — grootste VVD-winst/-verlies per stembureau t.o.v. de vorige keer.
- **VVD-kandidaten** — voorkeurstemmen per kandidaat per stembureau/kern (met namen, gemeenteraad);
  kaartweergave "Aandeel VVD-kandidaat" laat zien waar een kandidaat sterk is.
- **Grafiek** — VVD-% van het gekozen stembureau over alle verkiezingen.
- **Partijen** — bij een gekozen stembureau de volledige ranglijst van partijen (VVD
  gemarkeerd): zie meteen *waar de VVD aan wie verliest*.
- **Download CSV** — alle cijfers (aantallen, %, uitgebrachte stemmen, grootste partij).

## Databron — dit zijn ECHTE, officiële cijfers
De cijfers komen uit de **officiële EML-uitslagbestanden van de Kiesraad** op
[data.overheid.nl](https://data.overheid.nl), per stembureau. Verwerkte verkiezingen:

| Niveau | Verkiezingen |
|--------|--------------|
| Landelijk (Tweede Kamer) | 2021, 2023, 2025 |
| Provincie (Provinciale Staten) | 2023 |
| Gemeente (Gemeenteraad) | 2018, 2022, 2026 |

Gecontroleerd: de som per verkiezing klopt met de gepubliceerde gemeentetotalen
(bv. Gemeenteraad 2026 = 3.131 VVD-stemmen, Tweede Kamer 2025 = 6.264, Prov. Staten 2023 = 4.244).

`percentage = VVD-stemmen ÷ geldige stemmen` (in de code berekend, nooit los opgeslagen).

### Kanttekeningen bij de data (eerlijk te vermelden bij de presentatie)
- **Stembureaus wisselen per verkiezing.** Genummerde bureaus en corona-dagsplitsingen
  (2021) zijn per gebouw samengevoegd; 2018 gebruikte deels andere locaties (scholen).
  Daardoor heeft niet elk stembureau een waarde in elk jaar (lege cel = `·`).
- **Mobiele, brief- en telstembureaus** hebben geen vaste stemlocatie; ze staan wél in
  de tabel/totalen maar **niet op de kaart**.
- **Opkomst** wordt op **gemeente-niveau** als percentage getoond (gekalibreerd tegen de
  officiële totalen, bv. Gemeenteraad 2026 = 59,3%). Per stembureau tonen we alleen het
  **aantal uitgebrachte stemmen** (een echte telling) en bewust géén opkomst-%: kiezers
  zijn niet aan hun stembureau gebonden, dus een per-bureau-% is misleidend (een centraal
  bureau lijkt dan >90%).

## Data bijwerken (bij een volgende verkiezing)
De databestanden zijn **automatisch gegenereerd** — niet met de hand bewerken. Bijwerken:

1. Voeg de nieuwe verkiezing toe aan de lijst `DATASETS` in `scripts/harvest.py`
   (dataset-naam van data.overheid.nl + soort `TK`/`PS`/`GR` + jaartal).
2. Draai het master-script (doet alles in de juiste volgorde + integriteitscheck):
   ```bash
   python3 scripts/update_all.py
   ```
   Het stopt zichtbaar als de som per verkiezing niet klopt met het officiële gemeentetotaal.
3. Herlaad `index.html` (harde refresh).

De afzonderlijke stappen (`harvest.py`, `build_data.py`, `build_gebieden.py`, `fetch_basemap.py`,
`fetch_offline.py`) kun je ook los draaien; `update_all.py` ketent ze aan elkaar.

## Bestanden
```
index.html            pagina
style.css             VVD-huisstijl (Aeonik, royaal blauw #0A2CCA / oranje #FF6400)
app.js                kaart, tabel, grafiek, filters, CSV
assets/vvd-logo.png   officieel VVD-logo (brandbook)
font/Aeonik-*.ttf     officieel VVD-lettertype (lokaal ingeladen via @font-face)
vendor/               Leaflet + Chart.js lokaal (offline)
data/stembureaus.js   locaties (naam, postcode, lat/lon)  — gegenereerd
data/uitslagen.js     VVD + geldige stemmen per stembureau per verkiezing — gegenereerd
data/basemap.js       offline vector-basiskaart (water/wegen/kernen) uit OSM — gegenereerd
data/gebieden.js      stembureau-gebieden (Voronoi op de gemeentegrens) — gegenereerd
data/kandidaten.js    VVD-kandidaatnamen per verkiezing — gegenereerd
data/meta.js          laatst-bijgewerkt-datum + integriteitsstatus — gegenereerd
scripts/update_all.py MASTER: werkt alles in één keer bij (alle stappen hieronder)
scripts/harvest.py    download + parse officiële Kiesraad-EML (+ kandidaten + controle-totalen)
scripts/build_data.py clusteren (op postcode) + geocoderen + integriteitscheck -> data/*.js
scripts/fetch_offline.py  vendor Leaflet + Chart.js naar vendor/
scripts/fetch_basemap.py  genereer data/basemap.js uit OpenStreetMap (Overpass)
scripts/build_gebieden.py genereer data/gebieden.js (Thiessen/Voronoi, grens via PDOK)
docs/verbeterplan.md  top-11 verbeterplan
```

## Offline (al ingebouwd)
De site is volledig offline. De onderdelen zijn ooit eenmalig opgehaald met:
```bash
python3 scripts/fetch_offline.py   # Leaflet + Chart.js -> vendor/
python3 scripts/fetch_basemap.py   # vector-basiskaart -> data/basemap.js
```
Opnieuw draaien hoeft alleen als je de libs of de kaart wilt verversen.
Kaartdata © OpenStreetMap-bijdragers (ODbL).
