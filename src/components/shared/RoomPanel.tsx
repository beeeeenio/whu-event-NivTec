import { useId, useState } from 'react';
import { formatMeters, parseDecimalInput } from '../../lib/format';
import { nextObstacleId, OBSTACLE_LABELS, type ObstacleKind, type RoomObstacle, type RoomPlan } from '../../domain/room';
import { ACTION_BTN } from './editor/styles';

/** Obergrenze wie in sanitizeRoom (domain/room.ts): größere Werte würde der Import ohnehin verwerfen. */
const MAX_M = 500;
const MAX_LABEL_LENGTH = 80;

const FIELD_CLASS =
  'w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums text-[var(--color-text)]';
const KIND_OPTIONS = Object.keys(OBSTACLE_LABELS) as ObstacleKind[];

interface Props {
  room: RoomPlan | undefined;
  onChange: (next: RoomPlan | undefined) => void;
}

/** Breite/Tiefe von Raum und Hindernissen: größer als 0, nicht über der Obergrenze. */
function isValidSize(v: number): boolean {
  return v > 0 && v <= MAX_M;
}

/** Hindernis-Position: nicht negativ (x, y ≥ 0 wie in sanitizeRoom). */
function isValidObstaclePos(v: number): boolean {
  return v >= 0 && v <= MAX_M;
}

/** Raumkontur festlegen, Hindernisse (Säulen, Türen, Notausgänge) als Liste bearbeiten. */
export function RoomPanel({ room, onChange }: Props) {
  const baseId = useId();
  // Eingaben bleiben als Text, bis sie bei blur oder Enter übernommen werden. Ungültige Werte
  // werden verworfen, das Feld zeigt danach wieder den gültigen Wert aus dem Raum.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function setDraft(key: string, text: string) {
    setDrafts((prev) => ({ ...prev, [key]: text }));
  }

  function clearDraft(key: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Übernimmt eine Zahleneingabe, sofern sie gültig ist und sich geändert hat (kein leerer Undo-Schritt). */
  function commitNumber(key: string, committed: number, valid: (v: number) => boolean, apply: (v: number) => void) {
    const text = drafts[key];
    clearDraft(key);
    if (text === undefined) return;
    const v = parseDecimalInput(text);
    if (v === null || !valid(v) || v === committed) return;
    apply(v);
  }

  if (!room) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className={ACTION_BTN}
          onClick={() => onChange({ widthM: 12, depthM: 8, obstacles: [] })}
        >
          Raumkontur festlegen
        </button>
      </div>
    );
  }

  const currentRoom = room;

  function updateObstacle(id: string, patch: Partial<RoomObstacle>) {
    onChange({
      ...currentRoom,
      obstacles: currentRoom.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  }

  function setObstacleLabel(id: string, text: string) {
    const trimmed = text.trim().slice(0, MAX_LABEL_LENGTH);
    // Unveränderte Bezeichnung: kein leerer Undo-Schritt.
    if ((currentRoom.obstacles.find((o) => o.id === id)?.label ?? '') === trimmed) return;
    onChange({
      ...currentRoom,
      obstacles: currentRoom.obstacles.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o };
        if (trimmed) next.label = trimmed;
        else delete next.label;
        return next;
      }),
    });
  }

  function addObstacle(kind: ObstacleKind, w: number, d: number) {
    const obstacle: RoomObstacle = { id: nextObstacleId(currentRoom), kind, x: 0, y: 0, w, d };
    onChange({ ...currentRoom, obstacles: [...currentRoom.obstacles, obstacle] });
  }

  function removeObstacle(id: string) {
    onChange({ ...currentRoom, obstacles: currentRoom.obstacles.filter((o) => o.id !== id) });
  }

  const widthId = `${baseId}-breite`;
  const depthId = `${baseId}-tiefe`;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-[var(--color-text-muted)]">
        Koordinaten wie im Plan: x von links, y von der Vorderkante nach hinten, in Metern.
      </p>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={widthId} className="text-xs text-[var(--color-text-muted)]">
            Breite (m)
          </label>
          <input
            id={widthId}
            type="text"
            inputMode="decimal"
            value={drafts.breite ?? formatMeters(currentRoom.widthM)}
            onChange={(e) => setDraft('breite', e.target.value)}
            onBlur={() => commitNumber('breite', currentRoom.widthM, isValidSize, (v) => onChange({ ...currentRoom, widthM: v }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNumber('breite', currentRoom.widthM, isValidSize, (v) => onChange({ ...currentRoom, widthM: v }));
            }}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={depthId} className="text-xs text-[var(--color-text-muted)]">
            Tiefe (m)
          </label>
          <input
            id={depthId}
            type="text"
            inputMode="decimal"
            value={drafts.tiefe ?? formatMeters(currentRoom.depthM)}
            onChange={(e) => setDraft('tiefe', e.target.value)}
            onBlur={() => commitNumber('tiefe', currentRoom.depthM, isValidSize, (v) => onChange({ ...currentRoom, depthM: v }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNumber('tiefe', currentRoom.depthM, isValidSize, (v) => onChange({ ...currentRoom, depthM: v }));
            }}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Hindernisse</h3>
        {currentRoom.obstacles.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">Noch keine Hindernisse im Raum.</p>
        )}
        <ul className="space-y-2">
          {currentRoom.obstacles.map((o) => {
            const rowId = `${baseId}-${o.id}`;
            const kindId = `${rowId}-art`;
            const labelId = `${rowId}-bezeichnung`;
            const fields = [
              { name: 'x', title: 'X (m)', value: o.x, valid: isValidObstaclePos, apply: (v: number) => updateObstacle(o.id, { x: v }) },
              { name: 'y', title: 'Y (m)', value: o.y, valid: isValidObstaclePos, apply: (v: number) => updateObstacle(o.id, { y: v }) },
              { name: 'w', title: 'B (m)', value: o.w, valid: isValidSize, apply: (v: number) => updateObstacle(o.id, { w: v }) },
              { name: 'd', title: 'T (m)', value: o.d, valid: isValidSize, apply: (v: number) => updateObstacle(o.id, { d: v }) },
            ];
            return (
              <li key={o.id} className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-md border border-[var(--color-border)] px-3 py-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={kindId} className="text-xs text-[var(--color-text-muted)]">
                    Art
                  </label>
                  <select
                    id={kindId}
                    value={o.kind}
                    onChange={(e) => updateObstacle(o.id, { kind: e.target.value as ObstacleKind })}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {OBSTACLE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                {fields.map((f) => {
                  const inputId = `${rowId}-${f.name}`;
                  const key = `${o.id}:${f.name}`;
                  return (
                    <div key={f.name} className="flex flex-col gap-1">
                      <label htmlFor={inputId} className="text-xs text-[var(--color-text-muted)]">
                        {f.title}
                      </label>
                      <input
                        id={inputId}
                        type="text"
                        inputMode="decimal"
                        value={drafts[key] ?? formatMeters(f.value)}
                        onChange={(e) => setDraft(key, e.target.value)}
                        onBlur={() => commitNumber(key, f.value, f.valid, f.apply)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNumber(key, f.value, f.valid, f.apply);
                        }}
                        className={FIELD_CLASS}
                      />
                    </div>
                  );
                })}
                <div className="flex flex-col gap-1">
                  <label htmlFor={labelId} className="text-xs text-[var(--color-text-muted)]">
                    Bezeichnung (optional)
                  </label>
                  <input
                    id={labelId}
                    type="text"
                    maxLength={MAX_LABEL_LENGTH}
                    value={drafts[`${o.id}:label`] ?? o.label ?? ''}
                    onChange={(e) => setDraft(`${o.id}:label`, e.target.value)}
                    onBlur={() => {
                      const text = drafts[`${o.id}:label`];
                      clearDraft(`${o.id}:label`);
                      if (text !== undefined) setObstacleLabel(o.id, text);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className="w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]"
                  />
                </div>
                <button type="button" onClick={() => removeObstacle(o.id)} className={ACTION_BTN}>
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={ACTION_BTN} onClick={() => addObstacle('saeule', 0.5, 0.5)}>
            Säule hinzufügen
          </button>
          <button type="button" className={ACTION_BTN} onClick={() => addObstacle('tuer', 1, 1)}>
            Tür hinzufügen
          </button>
          <button type="button" className={ACTION_BTN} onClick={() => addObstacle('notausgang', 2, 1)}>
            Notausgang hinzufügen
          </button>
        </div>
      </div>

      <div>
        <button type="button" className={ACTION_BTN} onClick={() => onChange(undefined)}>
          Raum entfernen
        </button>
      </div>
    </div>
  );
}
