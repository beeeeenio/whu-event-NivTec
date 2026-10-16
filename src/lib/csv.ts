import { groupMaterialList } from '../domain/materialList';
import type { MaterialListItem } from '../domain/types';

/**
 * Tabellenzeilen der Materialliste (Kopfzeile zuerst), in Gruppenreihenfolge. Fehlende Artikelnummern
 * werden durch `missingNr` ersetzt — CSV nimmt leer, Druck/PPTX zeigen '–'.
 */
export function materialListRows(items: MaterialListItem[], missingNr = '–'): string[][] {
  const header = ['Pos', 'Gruppe', 'Artikel', 'Art.-Nr.', 'Menge', 'Einheit'];
  const ordered = groupMaterialList(items).flatMap(([, groupItems]) => groupItems);
  const rows = ordered.map((i, index) => [
    String(index + 1),
    i.gruppe,
    i.artikel,
    i.artikelNr ?? missingNr,
    String(i.menge),
    i.einheit,
  ]);
  return [header, ...rows];
}

export function materialListToCsv(items: MaterialListItem[]): string {
  const escape = (v: unknown) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return materialListRows(items, '')
    .map((r) => r.map(escape).join(';'))
    .join('\n');
}
