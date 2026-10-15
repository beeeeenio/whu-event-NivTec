export type StructureTypeId = 'buehne' | 'tisch' | 'tresen' | 'tribuene';

export type FootType = 'fest' | 'spindel';

export type RailingSide = 'hinten' | 'links' | 'rechts' | 'vorne';

/** Eine Standard-Plattengröße aus dem Katalog eines Aufbautyps. */
export interface PanelSize {
  /** Breite in Metern (lange Seite bei den meisten Größen) */
  w: number;
  /** Tiefe in Metern */
  d: number;
  /**
   * true = nicht die 2×1-Hauptplatte (nur UI-Hervorhebung, ändert nichts an Katalog-Verhalten
   * oder Tests).
   */
  sondermassOnly?: boolean;
}

/** Welche Ecke der Bounding-Box eines Dreieckpodests den rechten Winkel trägt. */
export type TriangleCorner = 'tl' | 'tr' | 'bl' | 'br';

/** Form eines Stücks — Standard ist Rechteck (kein shape-Feld). */
export type PieceShape = 'viertelkreis';

/** Eine platzierte Platte im Grundriss, in Metern, Ursprung oben-links. */
export interface PanelInstance {
  x: number;
  y: number;
  w: number;
  d: number;
  /** z.B. "2x1" — Schlüssel für die Materialliste */
  sizeKey: string;
  isSondermass: boolean;
  /** Nur gesetzt für das echte Dreieckpodest — siehe Piece2D.corner in customShape.ts für die
   *  volle Erklärung (insb. die (1,1)-Mehrdeutigkeit mit dem echten 1×1-Rechteck). */
  corner?: TriangleCorner;
  /** Form des Stücks — undefined = normales Rechteck. Viertelkreis gilt nur wenn corner auch gesetzt ist. */
  shape?: PieceShape;
}

export interface LayoutResult {
  orientation: 'normal' | 'rotiert';
  widthM: number;
  depthM: number;
  areaM2: number;
  cols: number;
  rows: number;
  panels: PanelInstance[];
  panelCountsBySize: Record<string, number>;
  hasSondermass: boolean;
  /** Warnung, wenn der Reststreifen nicht sauber mit Standardgrößen gefüllt werden konnte */
  sondermassWarning?: string;
}

export interface FootCount {
  heightCm: number;
  type: FootType;
  count: number;
}

export interface RailingRequirement {
  required: boolean;
  optional: boolean;
  activeSides: RailingSide[];
}

export interface StairsResult {
  heightCm: number;
  stepCount: number;
  stepHeightCm: number;
  stepDepthM: number;
}

export interface RampResult {
  heightCm: number;
  inclineRatio: number;
  lengthM: number;
}

export interface MaterialListItem {
  pos: number;
  gruppe: string;
  artikel: string;
  /** Offizielle NivTec-Artikelnummer, falls bekannt (nur Bühne/Tribüne-Bauteile). */
  artikelNr?: string;
  menge: number;
  einheit: string;
}

/** Kante eines Podests im Plan (y nach unten): 'bottom' = Vorderkante (größtes y), 'hyp' = Schräge eines Dreiecks. */
export type ForexSide = 'top' | 'right' | 'bottom' | 'left' | 'hyp';

/**
 * Forex-Blende: bedruckte PVC-Hartschaumplatte (Standard 5 mm) vor einer freien Außenkante eines
 * Podests. Gemeinsames Austauschformat mit der Stadthallenplanung — Feldnamen nicht ändern.
 */
export interface ForexPanel {
  /** Stabil, z. B. "fx-1". */
  id: string;
  /** Piece2D.id des Podests, an dessen Kante die Blende hängt. */
  pieceId: string;
  side: ForexSide;
  /** Plattenstärke in mm, Standard 5. */
  thicknessMm?: number;
  /** Gleiche Gruppe = ein durchlaufender Druck über diese Platten. */
  printGroup?: string;
}
