import type { ToolPayload } from '../../../domain/toolPayload';

/** Zustand eines laufenden Ziehens eines platzierten Stücks (oder einer Auswahl). */
export interface DragState {
  id: string;
  moved: boolean;
  /** valid=false: Ziel würde ein anderes Stück überlappen (nur mit Alt, ungerastert möglich). */
  target: { x: number; y: number; valid?: boolean } | null;
  /** Greifpunkt minus Stück-Ursprung (Meter), damit das Stück nicht mit der Mitte an den Cursor springt. */
  grabOffset: { x: number; y: number };
  /** Nur bei gemeinsamem Verschieben mehrerer ausgewählter Stücke: Startpunkt (Meter) und Versatz. */
  group?: { startX: number; startY: number; dx: number; dy: number; valid: boolean };
  /** Zeigertyp des Ziehens; der Drehen-Button während des Ziehens erscheint nur bei Touch. */
  pointerType?: string;
  /** Anzahl 90°-Drehungen während des Ziehens (0–3), nur bei Einzelstück. Das Stück selbst bleibt unverändert, bis es abgelegt wird. */
  rotations?: number;
}

/** Zustand eines laufenden Ziehens einer Kachel aus der Palette. */
export interface PaletteDragState {
  payload: ToolPayload;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  overCanvas: boolean;
}
