# Review en vervolg — PR #1

De reviewpunten zijn verwerkt in de branch. De concrete controles staan in
`tests/` en draaien via GitHub Actions. Zie README voor uitvoeren en beperkingen.

## Verwerkt

- PNG-export: correcte gebiedsstructuur, Leaflet-projectie, vlakken/kernen/stippen,
  gelijke schaal, legenda, bronvermelding en foutloze download.
- Patroon-overlay behoudt de metricafhankelijke kleur; stippen houden hun randvorm.
- Historische locaties krijgen een expliciete kern; volledigheid staat in de UI.
- Ontbrekende opkomst wordt niet als nul gepresenteerd.
- Presentatie selecteert alleen echte dalers en beschrijft negatieve lokale
  verschillen als achterstand; de dialoog houdt toetsenbordfocus vast.
- Permalinks bewaren partij, kandidaat en niveaufilter; hashwijzigingen herstellen
  de besturing. Ongeldige metricwaarden worden veilig genegeerd.
- Positiekolom heeft een vaste kleurenschaal; dekking staat ook bij gemeente-indexen.
- Het gemiddelde over alle verkiezingen is verwijderd. Lijnen verbinden alleen
  hetzelfde verkiezingsniveau. Uitleg onderscheidt vaste partijposities van een
  historische ideologiemeting en partijverdeling van kiezersstromen.
- `file://` werkt met lokale libraries; librarychecksums worden in build/CI bewaakt.
- Bouwpad is projectrelatief; tijdelijke build, volledigheidscontrole en rollback
  beschermen bestaande uitvoer. De losse merge controleert vóór schrijven.
- Locatie-ID's en handmatige correcties staan in een blijvend register.
- Berekeningen, presentatie en export zijn afgesplitst van de applicatiebesturing.

## Grenzen en mogelijk vervolg

- De volledige internetdownload blijft afhankelijk van beschikbare officiële
  bronarchieven. Een fout stopt publicatie; een geslaagde interne totalencontrole
  is geen onafhankelijke verificatie van alle oorspronkelijke uitslagen.
- Historische locatiecoördinaten bevatten benaderingen; zie `docs/locaties.md`.
- Postcode/naamkoppelingen beschrijven gebouwen, geen vaste groepen kiezers.
- GitHub Pages kan na merge worden geactiveerd als publicatie gewenst is. Dit is
  een beheeractie; de PR zelf verandert de hostinginstellingen niet.
