import ValuesTable from './ValuesTable.jsx'

/** Todo lo que se necesita para probar palabras: la cadena, ejemplos y la tabla de valores. */
export default function WordLab({ word, setWord, onRun, busy, msg, examples, variables, spec, resetSignal }) {
  return (
    <section className="glass space-y-4 p-4 sm:p-5" aria-label="Probar palabras">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">Cadena de prueba</h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Cadena de prueba" data-testid="word-input" className="field sym min-w-0 flex-1 text-lg" value={word} placeholder="Escribe una cadena, p. ej. 00111122"
            onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onRun(word)} />
          <button type="button" className="btn-primary px-5 py-2" disabled={busy} onClick={() => onRun(word)} data-testid="run-btn">Simular</button>
        </div>
        {examples.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-white/50">Ejemplos válidos:</span>
            {examples.map((e, i) => (
              <button key={i} type="button" className="sym rounded-lg bg-white/7 px-2.5 py-1 text-xs hover:bg-white/15" onClick={() => { setWord(e.word); onRun(e.word) }}
                title={Object.entries(e.values).map(([k, v]) => `${k}=${v}`).join(', ')}>{e.word || '(vacía)'}</button>
            ))}
          </div>
        )}
        {msg && (
          <ul className="space-y-1 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {msg.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
      <ValuesTable variables={variables} spec={spec} resetSignal={resetSignal} busy={busy} onRun={onRun} />
    </section>
  )
}