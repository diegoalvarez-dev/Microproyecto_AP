import { pretty } from '../lib/spec.js'

// «0^n 1^m | n>0, m>n»  ->  patrón y lista de restricciones
function split(text) {
  const t = text || ''
  const i = t.indexOf('|')
  const pat = (i < 0 ? t : t.slice(0, i)).trim()
  const cons = i < 0 ? [] : t.slice(i + 1).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return [pat, cons]
}

/** Las indicaciones registradas (Σ y L), siempre visibles arriba a la derecha. */
export default function SpecSummary({ spec, result, builtWith }) {
  const [pat, cons] = split(spec.language)
  const empty = !spec.alphabet.trim() && !pat
  const built = !!result?.ok && builtWith
  const same = built && builtWith.alphabet === spec.alphabet && builtWith.language === spec.language

  return (
    <section className="glass p-4 sm:p-5" aria-label="Indicaciones registradas" data-testid="spec-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">Indicaciones registradas</h2>
        {built && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${same ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`} data-testid="summary-status">
            {same ? '✓ Autómata construido' : '⚠ Cambiaste los datos: vuelve a construir'}
          </span>
        )}
      </div>
      {empty ? (
        <p className="mt-2 text-sm text-white/45">Aún no has escrito nada. Registra el alfabeto y el lenguaje a la izquierda y aparecerán aquí.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="sym flex flex-wrap items-baseline gap-x-3 text-lg">
            <span className="text-white/50">Σ =</span>
            <span data-testid="summary-alphabet">{spec.alphabet.trim() || '—'}</span>
          </div>
          <div className="sym flex flex-wrap items-baseline gap-x-3 text-lg">
            <span className="text-white/50">L =</span>
            <span className="break-words" data-testid="summary-language">{'{ '}{pretty(pat) || '—'}{cons.length ? ' | ' : ''}{cons.join(', ')}{' }'}</span>
          </div>
          {cons.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-white/40">Restricciones:</span>
              {cons.map((c, i) => <span key={i} className="sym rounded-lg bg-white/8 px-2 py-0.5 text-xs">{c}</span>)}
            </div>
          )}
          {built && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-white/50">
              <span>{result.automaton.counts.stacks} pila{result.automaton.counts.stacks === 1 ? '' : 's'}</span>
              <span>{result.automaton.counts.states} estados</span>
              <span>{result.automaton.counts.transitions} transiciones</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}