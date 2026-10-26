import { useEffect, useRef, useState } from 'react';
import { KastenbuehneConfigurator } from './modules/kastenbuehne/KastenbuehneConfigurator';
import { TresenConfigurator } from './modules/tresen/TresenConfigurator';
import type { CiId } from './lib/ci';
import type { PlanKind } from './domain/migrations';
import { ProjectBar, type ProjectView } from './components/shared/ProjectBar';
import { ProjectMaterialView } from './components/shared/ProjectMaterialView';
import { useProjects } from './hooks/useProjects';
import { decodePlanToken, readShareToken } from './lib/planShare';

// Jeder Techie einer WHU-Initiative (forumWHU, Campus for Finance, ...) ist gleichzeitig Teil
// von WHU Event — das Tool wird deshalb von mehreren Initiativen genutzt, mit je eigener CI,
// während "WHU Event" als das eigentlich verantwortliche Team immer sichtbar bleibt.
const CI_STORAGE_KEY = 'nivtec-ci';

/** Geteilter Plan aus dem URL-Hash (`#plan=…`): nur zur Ansicht, nie Teil des eigenen Entwurfs. */
interface SharedPlan {
  kind: PlanKind;
  data: unknown;
}

const CIS: Array<{ id: CiId; label: string }> = [
  { id: 'forumwhu', label: 'forum WHU' },
  { id: 'cff', label: 'Campus for Finance' },
  { id: 'whuevent', label: 'WHU Event' },
  { id: 'sensability', label: 'Sensability' },
  { id: 'cscm', label: 'CSCM WHU' },
];

/** CIs deren eigene Kopfzeilenfläche IMMER dunkel ist, unabhängig vom System-Light/Dark-Modus —
 *  CFF (Guidelines' eigene feste Primary-Rendition) und Sensability (expliziter Wunsch, den
 *  Hintergrund immer grün zu halten). Jedes Logo im Umschalter sitzt auf DERSELBEN Kopfzeile,
 *  die von der jeweils AKTIVEN CI bestimmt wird — ist irgendeine hiervon aktiv, brauchen daher
 *  ALLE Logos (nicht nur das eigene) ihre helle Variante, sonst verschwindet z.B. das dunkle
 *  Sensability-Icon auf der jetzt dunkelgrünen Fläche, wenn Sensability selbst aktiv ist. */
const ALWAYS_DARK_CIS = new Set<CiId>(['cff', 'sensability']);

/** Wählt die passende Logo-Variante für die tatsächlich sichtbare Kopfzeilenfläche: die "helle"
 *  Variante folgt dem System-Light/Dark-Wechsel wie gewohnt — außer wenn eine der ALWAYS_DARK_CIS
 *  aktiv ist, dann wird zwangsweise die dunkle Variante gezeigt, unabhängig vom System-Modus. */
function AdaptiveLogo({
  light,
  dark,
  alt,
  activeCi,
  heightClassName = 'h-6 w-auto',
}: {
  light: string;
  dark: string;
  alt: string;
  activeCi: CiId;
  heightClassName?: string;
}) {
  if (ALWAYS_DARK_CIS.has(activeCi)) {
    return <img src={dark} alt={alt} className={heightClassName} />;
  }
  return (
    <>
      <img src={light} alt={alt} className={`brand-logo-light ${heightClassName}`} />
      <img src={dark} alt={alt} className={`brand-logo-dark ${heightClassName}`} />
    </>
  );
}

/** Logo-Grafik je CI — wird direkt IN den Umschalt-Buttons gezeigt statt danebenstehendem Text. */
function CiLogo({ id, activeCi }: { id: CiId; activeCi: CiId }) {
  if (id === 'forumwhu') {
    // Eigener Beige-Chip (Brand Style Guide Primärfarbe #f4eee0, siehe index.css) wie bei Campus —
    // dadurch ist die Logo-Fläche immer gleich hell, unabhängig von System-Dark-Mode oder aktiver
    // CI, deshalb reicht hier die eine helle Wortmarke statt des Light/Dark-Wechsels.
    return (
      <span className="inline-flex items-center rounded px-2 py-1" style={{ backgroundColor: '#f4eee0' }}>
        <img src="/brand/forumwhu-mark.png" alt="forum WHU" className="h-5 w-auto" />
      </span>
    );
  }
  if (id === 'whuevent') {
    return (
      <AdaptiveLogo
        light="/brand/whuevent-mark-black.svg"
        dark="/brand/whuevent-mark-white.svg"
        alt="WHU Event"
        activeCi={activeCi}
      />
    );
  }
  if (id === 'cff') {
    // Jetzt gibt es beide Wortmarken-Varianten (dunkles Navy-Logo + die bestehende weiße), deshalb
    // kein Chip mehr nötig — genau wie bei WHU Event wählt AdaptiveLogo die passende Variante für
    // die jeweils tatsächlich sichtbare Kopfzeilenfläche (hell bei System-Light/forumWHU/WHU Event,
    // weiß auf der immer dunklen CFF-eigenen Fläche, wenn CFF selbst aktiv ist).
    return (
      <AdaptiveLogo
        light="/brand/cff-main-dark.png"
        dark="/brand/cff-main-white.svg"
        alt="Campus for Finance"
        activeCi={activeCi}
        heightClassName="h-3.5 w-auto"
      />
    );
  }
  if (id === 'sensability') {
    // Nur eine Bildmarke (kein Schriftzug) vorhanden, deshalb Icon + eigenes Text-Label statt
    // eines einzigen Logo-Bilds — Textfarbe folgt var(--color-text), das bereits korrekt auf die
    // gerade sichtbare Kopfzeilenfläche abgestimmt ist (auch im CFF-fest-dunkel-Fall).
    return (
      <span className="inline-flex items-center gap-1.5">
        <AdaptiveLogo
          light="/brand/sensability-mark.png"
          dark="/brand/sensability-mark-white.png"
          alt=""
          activeCi={activeCi}
          heightClassName="h-5 w-auto"
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          Sensability
        </span>
      </span>
    );
  }
  // CSCM WHU: einzelnes Icon+Wortmarke-Lockup wie bei WHU Event, kein Chip nötig.
  return (
    <AdaptiveLogo light="/brand/cscm-mark.png" dark="/brand/cscm-mark-white.png" alt="CSCM WHU" activeCi={activeCi} />
  );
}

function App() {
  const { store, project, activeItem, saveFailed, actions } = useProjects();
  const [view, setView] = useState<ProjectView>('item');
  // Der Link-Effekt unten läuft nur einmal, braucht aber immer die aktuellen Aktionen.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [ci, setCi] = useState<CiId>(() => {
    const saved = localStorage.getItem(CI_STORAGE_KEY);
    return saved === 'cff' || saved === 'whuevent' || saved === 'sensability' || saved === 'cscm'
      ? saved
      : 'forumwhu';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ci', ci);
    localStorage.setItem(CI_STORAGE_KEY, ci);
  }, [ci]);

  const [shared, setShared] = useState<SharedPlan | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  // Zählt die Ladevorgänge: Dekodieren ist async, ein älterer Hash darf einen neueren Stand nicht überschreiben.
  const shareLoadSeq = useRef(0);

  // Geteilten Plan beim Öffnen und bei jeder Hash-Änderung laden. Ohne Token gibt es keinen geteilten Plan mehr.
  useEffect(() => {
    async function loadSharedFromHash() {
      const seq = ++shareLoadSeq.current;
      const token = readShareToken(location.hash);
      if (token === null) {
        setShared(null);
        setShareError(null);
        return;
      }
      const decoded = await decodePlanToken(token);
      if (seq !== shareLoadSeq.current) return;
      if (decoded === null) {
        setShared(null);
        setShareError('Geteilter Link ist ungültig.');
        return;
      }
      setShared({ kind: decoded.kind, data: decoded.data });
      setShareError(null);
      actionsRef.current.openKind(decoded.kind);
      setView('item');
    }
    void loadSharedFromHash();
    window.addEventListener('hashchange', loadSharedFromHash);
    return () => window.removeEventListener('hashchange', loadSharedFromHash);
  }, []);

  // Verlassen der Nur-Lesen-Ansicht: Hash weg, eigener Entwurf bleibt wie er war.
  function leaveShared() {
    // Ein noch laufendes Dekodieren darf die gerade verlassene Ansicht nicht wieder öffnen.
    shareLoadSeq.current++;
    setShared(null);
    setShareError(null);
    history.replaceState(null, '', location.pathname + location.search);
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              WHU Event
            </span>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">NivTec Planungstool</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Bühne &amp; Tresen aus modularen Systemplatten planen — leerer Plan, Stücke per Drag &amp; Drop, Füße
              und Materialliste automatisch berechnet.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {CIS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCi(c.id)}
                aria-pressed={ci === c.id}
                title={c.label}
                aria-label={c.label}
                className={`flex items-center rounded-md border-2 px-2 py-1.5 transition-opacity ${
                  ci === c.id
                    ? 'border-[var(--color-accent)] opacity-100'
                    : 'border-transparent opacity-40 hover:opacity-70'
                }`}
              >
                <CiLogo id={c.id} activeCi={ci} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <ProjectBar
        store={store}
        project={project}
        activeItem={activeItem}
        view={view}
        onView={setView}
        actions={actions}
        saveFailed={saveFailed}
      />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {shareError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-2 rounded-md border border-[var(--color-warning)] px-3 py-2 text-sm text-[var(--color-warning)]"
          >
            <span>{shareError}</span>
            <button type="button" onClick={leaveShared} className="shrink-0 text-xs underline">
              Schließen
            </button>
          </div>
        )}
        {view === 'total' ? (
          <ProjectMaterialView project={project} />
        ) : activeItem === null ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Dieses Projekt hat noch keinen Tisch. Oben über „+ Tisch hinzufügen“ einen anlegen.
          </p>
        ) : activeItem.kind === 'kastenbuehne' ? (
          <KastenbuehneConfigurator
            key={activeItem.id}
            ci={ci}
            namespace={activeItem.namespace}
            title={activeItem.name}
            shared={shared?.kind === 'kastenbuehne' ? shared.data : undefined}
            onLeaveShared={leaveShared}
          />
        ) : (
          <TresenConfigurator
            key={activeItem.id}
            ci={ci}
            namespace={activeItem.namespace}
            title={activeItem.name}
            shared={shared?.kind === 'tresen' ? shared.data : undefined}
            onLeaveShared={leaveShared}
          />
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-6 text-xs text-[var(--color-text-muted)]">
        Privates Lernprojekt, inspiriert vom NivTec-Systempodest-Konzept. Alle Maße/Regeln sind recherchierte bzw.
        plausible Annahmen ohne Gewähr — keine offiziellen NivTec-Preise; Artikelnummern nach eigener Recherche, ohne Gewähr.
      </footer>
    </div>
  );
}

export default App;
