import { buildLayoutFromPieces, normalizeToOrigin } from './customShape';
import { appendMaterialItems, buildForexMaterialItems } from './forex';
import { buildMaterialList, mergeMaterialLists } from './materialList';
import type { ProjectItem } from './project';
import { STRUCTURE_RULES } from './rules';
import { parseKastenbuehneFile, parseTresenFile } from './savedState';
import { SPINDEL_HEIGHT_OPTIONS_CM } from './tresen';
import type { MaterialListItem } from './types';

/**
 * Materialliste eines Tisches aus seinem gespeicherten Plan — dieselbe Rechnung wie in
 * KastenbuehneConfigurator/TresenConfigurator, nur ohne Editor. Ändert sich dort die Rechnung,
 * muss sie hier mitgezogen werden. null: noch nichts gespeichert oder Plan nicht lesbar.
 */
export function planMaterialList(kind: ProjectItem['kind'], data: unknown): MaterialListItem[] | null {
  if (data === null || data === undefined) return null;
  if (kind === 'kastenbuehne') {
    const parsed = parseKastenbuehneFile(data);
    if (!parsed.ok) return null;
    const heightCm = parsed.value.heightCm ?? STRUCTURE_RULES.buehne.heightOptionsCm[0];
    const pieces = normalizeToOrigin(parsed.value.pieces);
    const layout = buildLayoutFromPieces(pieces);
    const podeste = buildMaterialList({ structureType: 'buehne', layout, heightCm, activeRailingSides: [] });
    return appendMaterialItems(podeste, buildForexMaterialItems(pieces, parsed.value.forexPanels ?? [], heightCm));
  }
  const parsed = parseTresenFile(data);
  if (!parsed.ok) return null;
  const baseHeightCm = parsed.value.baseHeightCm ?? STRUCTURE_RULES.tresen.heightOptionsCm[0];
  const spindelHeightCm = parsed.value.spindelHeightCm ?? SPINDEL_HEIGHT_OPTIONS_CM[1];
  const baseLayout = buildLayoutFromPieces(parsed.value.basePieces);
  const topLayout = buildLayoutFromPieces(parsed.value.topPieces);
  const base = buildMaterialList({ structureType: 'tresen', layout: baseLayout, heightCm: baseHeightCm, activeRailingSides: [] });
  const top = buildMaterialList({
    structureType: 'tresen',
    layout: topLayout,
    heightCm: spindelHeightCm,
    activeRailingSides: [],
    footLabel: `Alu-Verstellspindelfuß (VS-Fuß), Ausgleich ${spindelHeightCm} cm`,
    includeBracing: false,
  });
  return mergeMaterialLists([base, top]);
}

export interface ItemMaterial {
  item: ProjectItem;
  /** Leer, wenn der Tisch noch keine Stücke hat. */
  list: MaterialListItem[];
}

/** Materialliste je Tisch plus die zusammengeführte Gesamtliste des Projekts. */
export function projectMaterial(
  items: ProjectItem[],
  readDraft: (item: ProjectItem) => unknown,
): { perItem: ItemMaterial[]; total: MaterialListItem[] } {
  const perItem = items.map((item) => ({ item, list: planMaterialList(item.kind, readDraft(item)) ?? [] }));
  return { perItem, total: mergeMaterialLists(perItem.map((p) => p.list)) };
}
