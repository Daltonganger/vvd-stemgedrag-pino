# Locatieregister

`config/locaties.json` is de bron voor blijvende IDs, coördinaten, kernen en
naamaliassen. Het register is overgenomen van de bestaande 58 locaties; alle
uitslagen behouden hun ID. Een rebuild geocodeert of hernummert bestaande
locaties niet opnieuw. Een onbekende locatie stopt de build: controleer eerst
het adres, voeg een nieuw ongebruikt ID toe en wijs de kern expliciet toe.

Postcodes 2631/2632 horen bij Nootdorp, 2641/2642/2643 bij Pijnacker en 2645 bij
Delfgauw. Voor de historische locaties zonder postcode is de kern expliciet
vastgelegd op basis van de bestaande locatiegegevens:

| IDs | Locaties | Kern |
| --- | --- | --- |
| 41, 42, 47, 48 | Sint Jozef, CulturA, Het Oude Laarsje, Stichting Ipse | Nootdorp |
| 40, 43–46, 49–56, 58 | Overige historische vaste locaties | Pijnacker |

De bestaande geocodecorrecties zijn afkomstig uit `geocode_handmatig.py`
(adreszoektermen en bronnotities staan daar). Niet alle coördinaten zijn exacte
gebouwpunten: bijvoorbeeld Kantine Meersma is een benadering op straatniveau.
De rechthoekcontrole in de geocodescripts is geen bewijs dat een punt binnen de
echte gemeentegrens ligt. Controleer nieuwe locaties altijd tegen het bronadres.
`geocode_retry.py` en `geocode_handmatig.py` schrijven voorstellen in het register;
controleer de diff voordat je `build_data.py` opnieuw draait.

Historische namen zonder postcode kunnen ambigu zijn. De expliciete aliassen
voor De Regenboog (08), Gemeentekantoor (16), Buurt en Zo (18) en Jan Janssen
sporthal (05) behouden de koppelingen van de bestaande dataset. Twee locaties
met dezelfde naam maar verschillende postcodes worden niet op naam samengevoegd.

Mobiele, brief- en telbureaus hebben geen vaste kern. De UI toont hoeveel stemmen
wel en niet in het kernoverzicht zijn ingedeeld. De kernindeling van een locatie
zegt niets over de woonplaats van de mensen die daar gestemd hebben.
