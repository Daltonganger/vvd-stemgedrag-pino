# VVD Pijnacker-Nootdorp — stemgedrag per stemlocatie

Statische website met officiële verkiezingsuitslagen per stemlocatie, een kaart,
sorteerbare tabel, partijverdelingen, VVD-kandidaten, CSV/PNG-export en een
presentatiemodus. De browser heeft geen server, account of internet nodig.

## Openen

Dubbelklik `index.html`, of publiceer de bestanden op GitHub Pages. Leaflet,
Chart.js, lettertypen en vector-basiskaarten staan lokaal. Voor lokale ontwikkeling
kan ook `python3 scripts/serve.py` worden gebruikt.

De kaart biedt Vlakken, Kernen en Stippen. Kaartmaten zijn VVD-aandeel, afwijking,
verschil met een andere partij, winst/verlies ten opzichte van dezelfde soort
verkiezing, gemeentelijk versus landelijk aandeel, opkomsttelling, kandidaataandeel
en een index met vaste partijposities. Deelbare links bewaren verkiezing, maat,
weergave, partij of kandidaat, geselecteerde locatie en zichtbare tabelniveaus.
Een lokale `file://`-link werkt alleen op een computer met dezelfde bestanden;
publiceer de site om links met anderen te delen.

| Niveau | Verkiezingen |
| --- | --- |
| Europees | 2009, 2014, 2019, 2024 |
| Tweede Kamer | 2010, 2012, 2017, 2021, 2023, 2025 |
| Provinciale Staten | 2015, 2019, 2023 |
| Gemeenteraad | 2014, 2018, 2022, 2026 |

## Wat de cijfers betekenen

- VVD-percentage = VVD-stemmen / geldige stemmen. Percentages worden berekend,
  niet los opgeslagen. De bestaande gemeentetotalen zijn behouden, waaronder
  GR2026 3.131 VVD-stemmen, TK2025 6.264 en PS2023 4.244.
- De bronnen zijn Kiesraad-EML via data.overheid.nl; TK2017 gebruikt de beschikbare
  CSV. Downloadadressen en verwerking staan in `scripts/harvest.py`.
- De footer onderscheidt gecontroleerde en overgeslagen verkiezingen (momenteel
  16/17). Veel referentietotalen zijn afgeleid uit dezelfde gemeentetelling. Die
  controle bewijst consistente verwerking, geen onafhankelijke bronverificatie.
- De oudere TK2010-broncache bevat niet uitgesplitste reststemmen; die blijven
  herkenbaar als onbekende categorie, zodat de partijsom volledig blijft. Nieuwe
  EML-imports behouden onbenoemde lijsten met hun lijstnummer.
- Historische locaties, aantallen bureaus en hun bezoekers veranderen. Een
  vergelijking tussen dezelfde locaties is geen meting van dezelfde kiezers.
- Voronoi-vlakken zijn geconstrueerde nabijheidsgebieden, geen kiesdistricten of
  woongebieden. Partijverdelingen tonen geen individuele kiezersstromen.
- Kernen volgen de expliciete locatie-indeling in `config/locaties.json`. De UI
  vermeldt de ingedeelde stemmen; mobiele/briefstemmen blijven buiten de kernen.
- Opkomst ontbreekt voor EP2009, TK2010 en TK2012 en verschijnt als **onbekend**.
  Ontbrekende tellingen zijn `null`. Bij EML is het veld `uitgebracht` afkomstig
  uit de telling van toegelaten kiezers; kleine officiële telverschillen met
  geldige stembiljetten kunnen voorkomen. Per locatie/kern is opkomst indicatief:
  kiezers zijn niet aan hun stemlocatie gebonden.
- De links/rechts-index gebruikt **vaste CHES 2024-partijposities**, ook voor oude
  verkiezingen; JA21 komt uit ParlGov 2023. Dekking is het aandeel stemmen waarvan
  een partijscore bekend is. Partijen zonder score worden uitgesloten, waaronder
  lokale partijen. De index meet geen verandering van partijstandpunten door de
  tijd. Verkiezingen worden niet tot één totaalgemiddelde samengevoegd.
- Lokale meerwaarde is het verschil tussen de laatste GR- en TK-verkiezing. Een
  negatief verschil is een achterstand, geen lokale overprestatie.

## Data bijwerken

Python 3.10+ volstaat; de scripts gebruiken alleen de standaardbibliotheek.

1. Voeg een verkiezing toe aan `DATASETS` in `scripts/harvest.py`.
2. Controleer nieuwe stemlocaties en voeg ze met een nieuw blijvend ID toe aan
   `config/locaties.json`. Zie [locatiebeleid](docs/locaties.md).
3. Draai `python3 scripts/update_all.py` en controleer de diff.

De master bouwt in een tijdelijke map: download, locatiekoppeling, totalencontrole,
partijposities, gebieden, basiskaarten, libraries en eindvalidatie. Bij een
ontbrekende verkiezing, onbekende locatie, ongeldige telling of downloadfout
blijven de bestaande bestanden behouden. Pas na alle geslaagde stappen worden
data en vendor vervangen; een schrijffout rolt die vervanging terug. Voer dit uit
vóór publicatie, niet terwijl een webserver de bestanden actief serveert.

Voor losse stappen kunnen `PINO_RAW_DIR` (standaard `/tmp`) en `PINO_OUTPUT_ROOT`
(standaard de projectmap) worden ingesteld. Zo kun je een bestaande volledige
harvest opnieuw bouwen zonder netwerk:

```sh
PINO_OUTPUT_ROOT=/tmp/pino-build python3 scripts/build_data.py
```

Dat vereist `all_rows.json`, `kandidaten.json` en `totalen.json` in de raw-map.
Ook de losse build weigert een onvolledige verkiezingsset. `merge_election.py EP
2024` voegt één verkiezing toe, controleert vóór schrijven en behoudt overige
data. Daarna moeten de gebieden opnieuw worden gebouwd. Gebruik voor volledige
publicatie bij voorkeur de master.

Handmatige geocodecorrecties staan in het locatieregister en blijven behouden.
De geocodescripts zijn onderhoudshulpmiddelen voor dat register; ze hoeven niet
bij iedere build opnieuw online te zoeken. Libraryversies zijn vastgelegd in
`fetch_offline.py`, checksums in `config/vendor-sha256.json`. Via HTTP/HTTPS laadt de browser ze met SHA-384-SRI en `crossorigin="anonymous"`.
Alleen bij `file://` vervallen die attributen om offline dubbelklikken te ondersteunen.
De build en CI controleren zowel de SHA-256-checksums als de SHA-384-SRI-hashes.

## Ontwikkelen en controleren

Node 22+ is alleen nodig voor tests; de website zelf vereist geen npm-installatie.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

De tests controleren berekeningen, kernindeling, ontbrekende waarden, behoud van
uitvoer bij fouten, locatie-ID's, libraries, alle 459 kaartcombinaties, PNG-downloads,
permalinks, presentatieclaims, toetsenbordbediening, mobiel en `file://`.
GitHub Actions draait deze controles bij pushes en pull requests. Browsertraces
van mislukte tests worden als artifact bewaard.

## Opzet

- `model.js`: verkiezingen, indexen en aggregaties.
- `app.js`: kaart, tabel, grafiek, filters, CSV en URL-state.
- `presentatie.js`: presentatievragen en dialogbediening.
- `export.js`: PNG-renderer met dezelfde projectie, schaal, legenda en weergave.
- `config/locaties.json`: blijvende locatie-identiteit, kernen en correcties.
- `data/*.js`: gegenereerde cijfers en offline kaartdata.
- `scripts/`: downloaden, bouwen en valideren.
- `tests/`: reken-, pipeline- en browserregressies.

Kaartdata © OpenStreetMap-bijdragers (ODbL). Gemeentegrens: Kadaster/PDOK.
