# Überarbeitung Plan-Editor: Recherche & Plan

_Ergebnis einer Agenten-Recherche (Interaktionsmuster, Event-/Bühnenplaner, Technik, Undo/Zustand, Barrierefreiheit, Code-Bestandsaufnahme)._

## Kernaussagen

Ich habe den Entwurf gegen den Code auf feature/editor-best-practices geprüft (PieceCanvasEditor.tsx mit 1030 Zeilen, pieceOps.ts, usePieceLayer.ts, useUndoableState.ts, customShape.ts, history.ts). Die Basis ist grün: `npm test` und `npx tsc -b` laufen ohne Fehler, `npm run lint` zeigt nur Warnungen in anderen Dateien. Dateipfade, Funktionsnamen und Annahmen des Entwurfs stimmen weitgehend: DRAG_THRESHOLD_PX, ARROW_DELTA in der Komponente, onMouseMove am Platzier-rect, Gruppen-Zweig mit others/free, showBlockedMessage ohne Timer-Aufräumen, Undo-Zweige in handleCanvasKeyDown, fitsAllAt in customShape, vitest mit environment 'node'. Kastenbühne und Tresen spreaden editorProps, neue optionale Props kommen dort also automatisch an. Diese Korrekturen waren nötig:
(1) T7: Die Akzeptanz war falsch. Mit der Reihenfolge rechts k=1, unten k=1, rechts k=2 landet ein zweites Strg+D bei (0,1) und nicht bei (4,0). Duplizieren sucht jetzt nur nach rechts (k=1..maxSteps). Das ist vorhersagbar und ergibt beim wiederholten Strg+D eine Reihe.
(2) T3: touch-action auf einzelnen SVG-Formen (rect/path/polygon) wird nicht in allen Browsern ausgewertet. Robuster ist touch-action:none auf dem <svg> selbst, so wie es auch tldraw und Figma machen. Die Seite scrollt dann nur außerhalb des Plans. DRAG_THRESHOLD_PX wird ausdrücklich entfernt, die nutzlose pointerType-Prop von isPrimaryButton ist gestrichen.
(3) T2: pointercancel an der Palette setzt suppressNextClickRef nicht mehr. Nach einem cancel kommt kein click, und ein hängendes true hätte die nächste Tastatur-Aktivierung verschluckt.
(4) T6: Die Cursor-Logik bei bewaffnetem Werkzeug steht jetzt als konkreter Code da, statt als Kommentar.
(5) T8: Entf wird bei e.repeat zwar verworfen, preventDefault läuft aber weiter.
Die Abhängigkeiten sind klar benannt: T4 braucht T1, T5 braucht T4, T6 braucht T1 und T4, T7 braucht T1. Weil alle Aufgaben PieceCanvasEditor.tsx berühren, laufen sie strikt nacheinander von T1 bis T8. Keine Aufgabe ändert das JSON-Format, savedState.ts oder Pflicht-Props.

## Lückenanalyse

VORHANDEN (beibehalten, im Code bestätigt):
- Pointer Events mit setPointerCapture (try/catch), Schwelle DRAG_THRESHOLD_PX = 4, suppressNextClickRef gegen den Klick nach einem Drag. Der Zähler wird in handlePaletteButtonPointerDown zurückgesetzt.
- svgPointFromClient über getScreenCTM().inverse().
- Commit erst bei pointerup, ein Drag ergibt einen Undo-Schritt. Snapshot-History (src/lib/history.ts, Limit 100) mit txId-Bündelung über queueMicrotask in useUndoableState.
- findFreePosition mit Kanten-Snapping und Ringsuche (liefert für ein Einzelstück immer ein Ergebnis), dazu fitsAt und fitsAllAt.
- Klick-Bewaffnen, Tastatur-Cursor, Pfeil-Nudge (nur Einzelstück), R, Entf, Esc, 1–4, T, Strg+Z/Y (nur bei fokussiertem SVG).
- Drehen während des Palette-Drags über einen window-Listener (R, contextmenu, wheel), Shift-Klick-Mehrfachauswahl, Gruppen-Drag, Alles verschieben, referenceFootprint.
- Reine, getestete Domänenfunktionen (pieceOps.test.ts, customShape.test.ts, history.test.ts).

FEHLT (im Code bestätigt):
P0 Robustheit/Tablet:
1. touch-action fehlt am <svg> (nur die Palette-Buttons haben touch-none). Auf dem Tablet scrollt die Seite statt zu ziehen.
2. pointercancel und lostpointercapture werden nirgends behandelt. Es bleibt eine Geister-Vorschau, weil drag/paletteDrag gesetzt bleiben.
3. Esc in handleCanvasKeyDown ruft nur arm(null) auf und bricht ein laufendes Ziehen nicht ab. Der window-Listener beim Palette-Drag kennt nur R.
4. Kein e.button-Check (Rechtsklick startet einen Drag). Die Schwelle hängt nicht vom Zeigertyp ab. Das Platzier-rect nutzt onMouseMove. onWheel dreht bei jedem Event, auch bei Strg (Pinch).
P1 Feedback:
5. Der Gruppen-Zweig friert die Vorschau bei einer Kollision ein (setDrag ohne dx/dy). Ein blockierter Pfeil-Nudge passiert ohne Meldung. movePieceTo auf dieselbe Position erzeugt ein neues Array und damit einen leeren Undo-Eintrag (applyChange prüft nur die Referenz). showBlockedMessage räumt seine Timer nicht auf.
6. Ein Einzelstück springt beim Ziehen mit seiner Mitte an den Cursor (x - piece.w/2). setDrag läuft bei jedem pointermove. setSelectedId(null) nach dem Verschieben.
7. Gruppen-Verschieben und Mehrfach-Löschen laufen als N einzelne Aufrufe (forEach) und hängen an der Microtask-Bündelung.
P2 Effizienz:
8. Der Nudge wirkt nur bei selectedPiece (genau 1 Stück). Shift+←/→ verschiebt immer die ganze Fläche, Shift ist kein großer Schritt.
9. Strg+A, Strg+D und ein Duplizieren-Button fehlen.
10. Undo-Shortcuts wirken nur am SVG und gehen nach einem Klick auf einen Palette- oder Toolbar-Button ins Leere.
P3 (später): Smart Guides und Abstandsmaße, Maßketten, maßstäblicher Export, Vorlagen, Raumkontur und Hindernisse, Zoom/Pan, Marquee, ARIA-Ausbau, schemaVersion und Migrationen, Autosave-Härtung, Zwischenablage, gemeinsame History, usePointerDrag-Hook. Strg+A/D sollen außerdem auch außerhalb des SVG-Fokus wirken.

# Überarbeitungsplan Plan-Editor (NivTec Planungstool), geprüfte Fassung

Branch: `feature/editor-best-practices`. Die Basis ist grün: `npm test` und `npx tsc -b` laufen ohne Fehler, `npm run lint` zeigt nur Warnungen in anderen Dateien.

## Leitlinien
- **Keine DnD-Bibliothek.** Die eigene Pointer-Events-Lösung bleibt und wird gehärtet.
- **Domänenlogik bleibt rein** (`src/domain`, `src/lib`) und wird mit vitest getestet (environment `node`, kein jsdom). Das UI wird manuell geprüft.
- **Kompatibilität:** Kein Task ändert `savedState.ts`, das Dateiformat oder Pflicht-Props von `PieceCanvasEditor`. Neue Props sind optional. `KastenbuehneConfigurator` und `TresenConfigurator` spreaden `editorProps` und bekommen neue Callbacks automatisch, sie werden nicht angefasst.
- **Ein Nutzer-Schritt ergibt genau einen Undo-Eintrag.** Bulk-Aktionen laufen über einen einzigen `set()`-Aufruf.

## Reihenfolge und Abhängigkeiten
Alle Tasks berühren `src/components/shared/PieceCanvasEditor.tsx`. Sie werden **strikt nacheinander** umgesetzt, von T1 bis T8. Nach jedem Task laufen `npm test`, `npm run lint` und `npx tsc -b`.
- T1: Grundlage (movePiecesBy, removePiecesByIds, r3)
- T2, T3: unabhängig von T1, aber in dieser Reihenfolge, wegen derselben Datei
- T4 braucht T1. T5 braucht T4 (Feld `valid`). T6 braucht T1 und T4 (checkGroupMove). T7 braucht T1 (r3). T8 ist eigenständig.

## Phase 1 – Robustheit und Tablet (T1–T3)
- T1: Bulk-Operationen und No-op-Schutz in `movePieceTo`.
- T2: Abbruch über Esc, pointercancel und lostpointercapture (Stück- und Palette-Drag).
- T3: `touch-action: none` am `<svg>`, Prüfung der primären Maustaste, Schwelle je Zeigertyp, `onPointerMove`, Wheel-Drosselung und Strg-Ausschluss.
*Bewusste Änderung:* Über dem Plan scrollt auf dem Touch-Gerät die Seite nicht mehr. Außerhalb des Plans (max. 420 px hoch) scrollt sie wie bisher. Grund: `touch-action` auf einzelnen SVG-Formen wird nicht in allen Browsern ausgewertet.

## Phase 2 – Feedback (T4–T6)
- T4: Ungültige Gruppenposition rot und gestrichelt mit Meldung, Timer der Meldungen aufräumen.
- T5: Greif-Offset, weniger Re-Renders, Auswahl bleibt nach dem Verschieben erhalten.
- T6: Pfeil-Nudge für die ganze Auswahl, Shift = 1 m, Meldung bei Blockade. Shift+←/→ verschiebt die ganze Fläche nur noch ohne Auswahl und ohne Werkzeug.

## Phase 3 – Effizienz (T7–T8)
- T7: Strg/Cmd+A, Strg/Cmd+D und ein Duplizieren-Button. Die Kopie landet immer rechts daneben an der nächsten freien Stelle, wiederholtes Strg+D baut so eine Reihe.
- T8: Undo/Redo auf Ebene des Editor-Containers, mit Schutz für Eingabefelder und IME. Gehaltenes Entf löscht nur einmal.

## Später (siehe "later")
Smart Guides und Abstandsmaße, Vorlagen, Maßketten, maßstäblicher PDF-Export, Raumkontur, Zoom/Pan, Marquee, Kontextleiste, ARIA, Migrationen, Autosave-Härtung, Zwischenablage, gemeinsame History, `usePointerDrag`-Hook und Zerlegung des Monolithen.

## Risiken und Gegenmaßnahmen
- **lostpointercapture feuert auch nach einem normalen pointerup.** Der Handler verwirft nur (`setDrag(null)`). pointerup hat vorher synchron committet, deshalb ist das harmlos.
- **Esc während des Palette-Drags:** Nach Esc folgt beim Loslassen noch ein click. Deshalb wird `suppressNextClickRef = true` gesetzt. Bei pointercancel kommt kein click, also wird dort NICHT gesetzt.
- **Verhaltensänderungen** (Auswahl bleibt nach dem Verschieben, Shift+Pfeil mit Auswahl = 1 m, kein Seiten-Scroll über dem Plan) werden im Hilfetext dokumentiert.
- **Tresen mit zwei Editoren:** Der Undo-Handler hängt am jeweiligen Container-div und wirkt nur auf die Ebene, in der der Fokus liegt.

## Für später

- Smart Guides und Live-Abstandsmaße beim Ziehen: Fluchtlinien zu Nachbarn und Rand, Abstand in m, Gesamtmaß der Bounding-Box. Kanten-Snap-Toleranz in Bildschirm-px (ca. 8 px) statt Metern
- Alt-Taste als temporärer Snap-Bypass, ohne Kanten-Snapping und ohne findFreePosition-Verschiebung. Kollision wird rot angezeigt
- Starter-Vorlagen (4×3, 6×4, 8×4 m, T-Steg, Laufsteg, Tresen gerade/L/U) als Ein-Klick-Start im Leerzustand. Eigene Auswahl als Baustein speichern
- Dauerhafte Maßketten (Außen- und Segmentmaße) im Editor, im FloorPlanSVG und in der PPTX, mit Schalter
- Maßstäblicher PDF/SVG-Export (1:50, 1:100, A4/A3) mit Maßstabsleiste, Publikumsseite, Plankopf und Fußfarben-Legende
- Raumkontur mit Hindernissen (Säulen, Türen, Notausgangs-Freiflächen), die fitsAt und findFreePosition als belegt berücksichtigen
- Zoom/Pan über eine änderbare viewBox: Strg+Wheel bzw. Pinch zum Cursor, Leertaste+Ziehen, Zoom-Widget. Vorher die Mausrad-Drehung beim Palette-Drag umbelegen. Die viewBox nicht während des Drags wachsen lassen
- Feinere touch-action-Steuerung: Seiten-Scroll über leerer Planfläche auf dem Tablet wieder erlauben (z. B. touch-action je nach Trefferziel oder Zwei-Finger-Pan), sobald Zoom/Pan existiert
- Strg/Cmd+A und Strg/Cmd+D zusätzlich im Container-Handler, damit sie auch nach einem Klick auf die Toolbar wirken (wie Undo in T8). Nach dem Duplizieren die neue Kopie auswählen (braucht IDs aus onAddPieces)
- Rahmenauswahl (Marquee) als pure Funktion piecesInRect, Mehrfachauswahl-Toggle für Touch, Hover-Zustand und grabbing-Cursor, Bounding-Box um die Auswahl
- Kontextmenü bzw. schwebende Aktionsleiste an der Auswahl. Drehen-Button während des Touch-Drags
- Einzelstück ohne Ziehen verschieben (Verschieben-Modus mit Antippen des Ziels oder ±0,5-m-Buttons) für WCAG 2.5.7
- Positions-Inspector: X/Y in m, Drehung und Typ editierbar, mit fitsAt-Validierung
- Messwerkzeug, freie Textnotizen und Symbole (Treppe, FOH, Notausgang) im Export
- Ebenen und Stücke sperren bzw. ausblenden (Tresen Unterbau/Platte, Forex)
- Kanten-Snapping auch für den Gruppen-Drag. Drehung um den Mittelpunkt. Die dreifach duplizierte Rotationslogik (rotateCurrent, handleCanvasKeyDown, rotatePaletteDrag) zusammenführen
- Explizite Transaktions-API (transact) in useUndoableState statt Microtask-Bündelung, z. B. für rotateSelected (onMovePiece + onRotatePiece)
- Gemeinsame History pro Dokument (Tresen beide Ebenen, Höhen, Forex-Blenden). Import als ein Schritt, Auswahl nach Undo bereinigen
- Plan leeren mit Snackbar 'Plan geleert – Rückgängig'. Leerzustand mit Anleitung
- schemaVersion und kind in Plan-Dateien, Migrationskette src/domain/migrations.ts mit Fixture-Tests, Import-Bericht statt stillem Verwerfen in sanitizePieces
- Autosave härten: Flush bei visibilitychange/pagehide, Mehr-Tab-Erkennung, Hinweis bei QuotaExceeded
- Zwischenablage Strg+C/X/V mit typisiertem Payload
- Barrierefreiheit: role=application/aria-roledescription, aria-live für Aufnehmen, Ablegen und Blockiert, Roving-Focus zwischen Stücken, Zielflächen von 44 px bei pointer:coarse
- Refactoring: usePointerDrag-Hook für Kastenbühne, Tresen und Forex. PieceCanvasEditor zerlegen (Toolbar, Palette, Canvas-Ebenen, Ghost, memo, rAF). Optional jsdom und testing-library für Komponententests (neue Dev-Abhängigkeit)
- Forex-Blenden an Kanten statt an pieceId binden. Materialliste mit Artikelnummern
- Plan per Kurzcode bzw. URL teilen, mit Nur-Lesen-Ansicht
