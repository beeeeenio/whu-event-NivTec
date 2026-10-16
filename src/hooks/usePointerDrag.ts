import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isPrimaryButton } from '../lib/pointer';
import { advanceSession, startSession, type DragSession } from '../lib/pointerDrag';

export interface PointerDragHandlers<C> {
  /** false = Geste nicht übernehmen (z. B. Umschalt-Klick, bewaffnetes Werkzeug). */
  onStart?: (e: React.PointerEvent<Element>, ctx: C) => boolean | void;
  onMove: (e: React.PointerEvent<Element>, s: DragSession, ctx: C) => void;
  onEnd: (e: React.PointerEvent<Element>, s: DragSession, ctx: C) => void;
  onCancel?: (ctx: C) => void;
}

export interface PointerDragOptions {
  /** erlaubte Maustasten, Standard [0] */
  allowButtons?: number[];
}

/**
 * Zieh-Geste für einzelne Elemente: Schwelle je Zeigertyp, Pointer-Capture, Esc-Abbruch.
 * `bind(ctx)` liefert die Zeiger-Handler für ein Element, `ctx` wird an alle Callbacks durchgereicht.
 */
export function usePointerDrag<C>(handlers: PointerDragHandlers<C>, options?: PointerDragOptions): {
  bind: (ctx: C) => {
    onPointerDown: (e: React.PointerEvent<Element>) => void;
    onPointerMove: (e: React.PointerEvent<Element>) => void;
    onPointerUp: (e: React.PointerEvent<Element>) => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
  };
  active: boolean;
  cancel: () => void;
} {
  // Handler und Optionen werden nach jedem Render aktualisiert, damit die Zeiger-Callbacks stabil bleiben
  // und trotzdem immer die aktuellen Werte sehen (wie bei den Paletten-Callbacks).
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
    optionsRef.current = options;
  });

  // Laufende Sitzung und ihr Kontext in einem Ref: Zeiger-Events brauchen keinen Render dazwischen.
  const sessionRef = useRef<{ session: DragSession; ctx: C } | null>(null);
  const [active, setActive] = useState(false);

  const cancel = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    sessionRef.current = null;
    setActive(false);
    handlersRef.current.onCancel?.(cur.ctx);
  }, []);

  // Esc bricht eine laufende Geste ab, ohne Commit.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, cancel]);

  function bind(ctx: C) {
    function onPointerDown(e: React.PointerEvent<Element>) {
      const allowed = optionsRef.current?.allowButtons ? optionsRef.current.allowButtons.includes(e.button) : isPrimaryButton(e);
      if (!allowed) return;
      const h = handlersRef.current;
      if (h.onStart && h.onStart(e, ctx) === false) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture kann ohne aktiven, vom Browser registrierten Pointer werfen
        // (z.B. bei synthetisch erzeugten Events) — das Ziehen funktioniert trotzdem.
      }
      sessionRef.current = { session: startSession(e), ctx };
      setActive(true);
    }

    function onPointerMove(e: React.PointerEvent<Element>) {
      const cur = sessionRef.current;
      if (!cur || cur.session.pointerId !== e.pointerId) return;
      cur.session = advanceSession(cur.session, e);
      if (!cur.session.moved) return;
      handlersRef.current.onMove(e, cur.session, ctx);
    }

    function onPointerUp(e: React.PointerEvent<Element>) {
      const cur = sessionRef.current;
      if (!cur) return;
      sessionRef.current = null;
      setActive(false);
      handlersRef.current.onEnd(e, cur.session, ctx);
    }

    // lostpointercapture feuert nach pointerup, dann ist keine Sitzung mehr offen und nichts passiert.
    function onPointerCancel() {
      cancel();
    }

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
    };
  }

  return { bind, active, cancel };
}
