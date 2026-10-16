# NivTec Planungstool — Erklärung für eine übergeordnete Stadthallen-Planungssoftware

## Kurzüberblick

NivTec Planungstool baut Bühnen/Podeste und Theken aus dem **NivTec-Systempodest-Katalog** — modulare Aluminiumrahmen-Platten mit Nut-Feder-Verbindung und Steckfüßen. Jedes gebaute Stück ist am Ende nur ein **Rechteck (oder ein rechtwinkliges Dreieck) mit realer Größe in Metern**, frei auf einem 2D-Plan platziert. Füße, Materialliste und Aufbauregeln (Geländer, Verstrebung) ergeben sich automatisch aus der Geometrie — man platziert nur Platten, nichts davon wird separat verwaltet.

Für eine große Stadthallen-Planung heißt das: NivTec liefert den **Katalog der einfügbaren Bauteile** (welche Größen es gibt, wie sie sich zu echten Artikeln zusammenzählen) und ein **Koordinatensystem in Metern**, das sich 1:1 in einen größeren Hallenplan übernehmen lässt — kein Umrechnen nötig.

## Der Baukasten: das Plattenraster

Eine Bühne, Theke, Tisch oder Tribüne (alle vier Aufbautypen existieren im Code, aktuell sind in der App nur **Bühne** und **Tresen/Theke** als Tabs aktiv) besteht aus **denselben Platten** — nur Höhe und Zubehör unterscheiden sich:

| Größe (B×T) | Rolle | Artikelnummer |
|---|---|---|
| 2×1 m | Hauptplatte (Modulraster) | 111 01 0 |
| 1,5×1 m | Sondermaß-Randstück | 111 03 0 |
| 1×1 m | Sondermaß-Randstück | 111 05 0 |
| 0,5×1 m | Sondermaß-Randstück | 111 06 0 |
| 0,5×2 m | Sondermaß für die feste 2-m-Achse | – |
| 1×1 m, rechtwinkliges Dreieck | Diagonale Ecken/Spitzen | 112 05 0 |

Jede Platte ist **frei drehbar** (2×1 oder gedreht 1×2 ist derselbe Artikel) und liegt auf einem 0,5-m-Raster. Das Dreieckpodest füllt nur die halbe Bounding-Box (1×1, oder 2×1/1×2 beim großen Dreieck): `corner` ist die Ecke MIT dem rechten Winkel, die diagonal gegenüberliegende Ecke ist die "Phantom"-Ecke ohne Material. Die Hypotenuse verbindet die beiden Nachbarecken. Es gibt keine separate Rotationsangabe — Drehen = `corner` weiterschalten (tl→tr→br→bl) und bei 2×1 `w`/`d` tauschen. Beim Viertelkreis (`shape: 'viertelkreis'`) liegt der Kreismittelpunkt an `corner`, der Bogen läuft Richtung Phantom-Ecke.

## Wie ein Stück im Raum liegt

Das ist das zentrale Datenmodell, `Piece2D` (in `src/domain/customShape.ts`):

```ts
interface Piece2D {
  id: string;
  x: number;        // Meter, Ursprung oben-links
  y: number;
  w: number;         // Breite in Metern
  d: number;         // Tiefe in Metern
  corner?: 'tl' | 'tr' | 'bl' | 'br';  // nur bei Dreieck/Viertelkreis: Ecke der Bounding-Box MIT dem rechten Winkel
  shape?: 'viertelkreis';               // nur beim Viertelkreis (R 1 m, w=d=1); corner = Kreismittelpunkt
}
```

Ein "NivTec-Tisch" ist also nichts anderes als **eines dieser Objekte** — eine reale Fläche mit realer Position, in Metern. Genau dieses Format wäre der natürliche Interop-Punkt: Wenn die Stadthallen-Software ihr eigenes Koordinatensystem ebenfalls in Metern führt, lässt sich ein NivTec-Stück direkt an der gewünschten Stelle einfügen, ohne Skalierung.

## Was automatisch mitkommt

- **Füße**: werden NICHT einzeln platziert, sondern aus den Plattenecken abgeleitet (`countFeet`/`footPositions` in `feet.ts`) — Platten, die sich eine echte Kante teilen, teilen sich auch einen Fuß (reales Nut-Feder-Prinzip). Eine übergeordnete Software muss Füße also nicht selbst modellieren, wenn sie die Plattenpositionen übernimmt.
- **Höhen/Regeln** (`STRUCTURE_RULES`): Bühne/Tresen/Tribüne 20–200 cm in 20-cm-Schritten (Alu-Lastenverteilerfuß), Tisch fix 74/90 cm. Ab 80 cm Diagonalverstrebung, ab >140 cm zusätzlich Horizontalverstrebung, ab 100 cm Geländerpflicht (DGUV) — alles regelbasiert aus der Höhe, nicht manuell gesetzt.
- **Materialliste**: aggregierte Stückliste (Pos/Gruppe/Artikel/Art.-Nr./Menge/Einheit) aus der Plattenzahl — reine Zählung, keine Positionsdaten.

## Was man heute exportieren kann

| Export | Enthält Positionsdaten? | Eignung für "Import in andere Software" |
|---|---|---|
| **CSV** (Materialliste) | ❌ nur Stückzahlen | Gut für Bestelllisten, nicht für räumliches Einfügen |
| **PPTX** | ✅ echte Shapes (Rechteck/Dreieck/Kreis) an realen, skalierten Positionen | Technisch vorhanden, aber nur als PowerPoint-DrawingML-XML — aufwändig zu parsen |
| **PNG** | ❌ nur ein 3D-Snapshot-Bild | Rein visuell, keine Daten |
| **Gespeicherte Konfigurationen** (`localStorage`, Key `nivtec:saved:<namespace>`) | ✅ exakt die `Piece2D[]`-Liste plus Höhe(n) | **Das ist strukturell schon das richtige Format** — aber aktuell nur im Browser gespeichert, nicht als Datei exportierbar |

Die gespeicherten Konfigurationen sehen so aus:
```json
{ "id": "...", "name": "Tresen Fleetdesk", "savedAt": "...",
  "data": { "heightCm": 100, "pieces": [ { "id": "piece-1", "x": 0, "y": 0, "w": 2, "d": 1 }, ... ] } }
```

## Empfehlung für "NivTec-Tische auswählen und reinschieben"

Am saubersten wäre ein kleiner, gemeinsamer JSON-Austausch, der genau `Piece2D` (plus Höhe) verwendet — kein neues Format erfinden, sondern das nehmen, was NivTec intern ohnehin schon als "ein platziertes Stück" versteht. Konkret bräuchte NivTec dafür zwei kleine, additive Features, die es **heute noch nicht gibt**:

1. Einen echten **"Als JSON exportieren"**-Button neben CSV/PPTX/PNG, der genau die oben gezeigte Struktur als Datei herunterlädt (statt nur im `localStorage` zu bleiben).
2. Einen **Import**, der eine solche Datei einliest und die Stücke ins Canvas lädt (technisch fast identisch zum bestehenden "Laden"-Knopf der gespeicherten Konfigurationen, nur aus einer Datei statt aus `localStorage`).

Die Stadthallen-Software könnte dann spiegelbildlich: ihre eigene Palette um "NivTec-Katalogstücke" (die Tabelle oben) erweitern, ein ausgewähltes Stück als `{x, y, w, d, corner?}` in ihren eigenen Metern-Plan einfügen, und umgekehrt eine solche NivTec-JSON-Datei importieren, um einen kompletten NivTec-Aufbau (Bühne oder Theke) als Gruppe von Stücken in die Gesamtplanung zu übernehmen.

## Dateiformat: Version und Typ

Neue Plan-Dateien (Bühne und Tresen) enthalten zusätzlich:

- `schemaVersion`: die Version des Dateiformats (aktuell `1`).
- `kind`: der Plan-Typ, `'kastenbuehne'` oder `'tresen'`.

Beide Felder sind optional. Leser dürfen sie ignorieren; alle anderen Felder bleiben unverändert. Dateien ohne `schemaVersion` gelten als Version 0 und laden unverändert.

## Forex-Blenden (Kastenbühne)

Die Kastenbühnen-Datei (`nivtec-kastenbuehne.json`) kann optional Forex-Blenden enthalten — bedruckte 5-mm-PVC-Hartschaumplatten vor freien Außenkanten. Ältere Dateien ohne das Feld laden unverändert.

```ts
interface KastenbuehneSavedState {
  heightCm?: number
  pieces: Piece2D[]
  forexPanels?: ForexPanel[]
}
interface ForexPanel {
  id: string                 // stabil, z. B. "fx-1"
  pieceId: string            // Piece2D.id des Podests
  side: 'top' | 'right' | 'bottom' | 'left' | 'hyp'  // Kante im Plan (y nach unten); 'hyp' = Schräge bei Dreiecken
  thicknessMm?: number       // Standard 5
  printGroup?: string        // gleiche Gruppe = ein Druck läuft über diese Platten
}
```

- Beim Import werden ungültige Einträge verworfen: unbekannte `pieceId`, ungültige `side`, `'hyp'` bei Nicht-Dreiecken (auch Viertelkreis), eine Kante, die das Podest nicht hat (z. B. `'bottom'` bei Dreieck `corner: 'tl'`), doppelte `id` oder eine zweite Blende an derselben Kante.
- Exportiert werden nur Blenden an Kanten, die im aktuellen Plan frei sind (kein Nachbarpodest liegt an). Druckbilder sind nie Teil der Datei.
- Drucke lassen sich im NivTec-Tool wie in der Stadthallenplanung hochladen: je Platte oder je `printGroup` (ein Bild wird von außen gesehen links → rechts über die Platten verteilt, gleiche Schnitt- und Sortierlogik). Sie liegen nur lokal im Browser (IndexedDB, je `ForexPanel.id`) und dienen der 3D-Vorschau. „Alle Vorderkanten“ setzt `printGroup: 'vorne'`.
- Zuschnitt in der Materialliste: Kantenlänge × (Bauhöhe − 10 mm), z. B. „Forex 2000 × 590 mm, 5 mm“ bei 60 cm.

## Raumkontur (optionales Feld `room`)

Bühne und Tresen können optional eine Raumkontur mit Hindernissen speichern. Der Raum dient nur der Planung im Editor: Er bestimmt, wo Stücke liegen dürfen, und fließt nicht in Grundriss, 3D, Materialliste oder PPTX ein. Leser dürfen das Feld ignorieren; alte Dateien ohne `room` bleiben gültig.

```ts
interface RoomPlan {
  widthM: number              // Breite in Metern, > 0 (höchstens 500)
  depthM: number              // Tiefe in Metern, > 0 (höchstens 500)
  obstacles: RoomObstacle[]
}
interface RoomObstacle {
  id: string                  // eindeutig im Raum, z. B. "ob-1"
  kind: 'saeule' | 'tuer' | 'notausgang'
  x: number                   // Ursprung oben links wie im Plan, x von links
  y: number                   // y von der Vorderkante nach hinten
  w: number                   // Breite in Metern, > 0
  d: number                   // Tiefe in Metern, > 0
  label?: string              // optionale Bezeichnung, höchstens 80 Zeichen
}
```

- Beim Import werden ungültige Hindernisse einzeln verworfen (unbekannte Art, doppelte ID, negative Position, Maße ≤ 0); ein ungültiger Raum (Breite oder Tiefe) wird ganz ignoriert.
- Beim Tresen gilt der Raum nur für den Unterbau. Die Thekenplatte steht auf dem Unterbau und wird nicht gegen den Raum geprüft.
