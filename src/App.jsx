import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import SpecInput from './components/SpecInput.jsx'
import AutomatonPanel from './components/AutomatonPanel.jsx'
import SpecSummary from './components/SpecSummary.jsx'
import { FormalPanel, TablePanel } from './components/TablePanel.jsx'
import { buildMachine } from './services/api.js'
import HandPanel from './components/HandPanel.jsx'
import { EMPTY_BUILDER } from './lib/spec.js'

const KEY = 'ap-spec-v1'
const REG_KEY = 'ap-reg-v1'
const VIEWS = [
  ['auto', 'Generar en la plataforma', '⚙️'],
  ['mano', 'Dibujar a mano', '✏️'],
]
const TABS = [
  ['automata', 'Autómata'],
  ['tabla', 'Tabla de transición'],
  ['formal', 'Definición formal'],
]

// RF-12: lo último que se escribió se recuerda para consultarlo sin volver a ingresarlo.
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && typeof s.alphabet === 'string' && s.builder) return { handText: s.mode === 'texto' ? s.language || '' : '', cAlphabet: s.mode === 'texto' ? '' : s.alphabet, hAlphabet: s.mode === 'texto' ? s.alphabet : '', ...s }
  } catch { /* sin almacenamiento */ }
  return { alphabet: '', language: '', builder: EMPTY_BUILDER, handText: '', cAlphabet: '', hAlphabet: '', mode: 'constructor' }
}
const loadRegistered = () => {
  try {
    const s = JSON.parse(localStorage.getItem(REG_KEY))
    if (s && typeof s.alphabet === 'string' && typeof s.language === 'string') return s
  } catch { /* sin almacenamiento */ }
  return null
}

export default function App() {
  const [spec, setSpec] = useState(load)
  // Parámetros REGISTRADOS (alfabeto + lenguaje): son los que usan las dos pestañas de la derecha.
  const [registered, setRegistered] = useState(loadRegistered)
  const [built, setBuilt] = useState(null) // { result, with }
  const result = built?.result || null
  const builtWith = built?.with || null
  const [tab, setTab] = useState('automata')
  const [view, setView] = useState('auto') // derecha: 'auto' = lo genera la plataforma · 'mano' = lo dibujas tú
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [signal, setSignal] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(spec)) } catch { /* sin almacenamiento */ }
  }, [spec])
  useEffect(() => {
    try { localStorage.setItem(REG_KEY, JSON.stringify(registered)) } catch { /* sin almacenamiento */ }
  }, [registered])

  const register = useCallback(() => {
    setRegistered({ alphabet: spec.alphabet, language: spec.language })
    setError(null)
  }, [spec.alphabet, spec.language])

  const build = useCallback(async () => {
    if (!registered) return
    setLoading(true)
    setError(null)
    try {
      const r = await buildMachine(registered.alphabet, registered.language)
      setBuilt({ result: r, with: r.ok ? { alphabet: registered.alphabet, language: registered.language } : null })
      if (r.ok) {
        setTab('automata')
        setSignal((n) => n + 1)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [registered])

  const clear = useCallback(() => {
    setRegistered(null)
    setBuilt(null)
    setError(null)
    setTab('automata')
  }, [])

  const ready = result?.ok
  const stale = ready && builtWith && registered && (builtWith.alphabet !== registered.alphabet || builtWith.language !== registered.language)
  const buildErrors = result && !result.ok ? result.errors || [] : []
  return (
    <div className="mx-auto max-w-[110rem] space-y-5 px-4 py-6 sm:px-6">
      <Header />

      <div className="grid items-start gap-5 lg:grid-cols-[27rem_minmax(0,1fr)]">
        {/* izquierda: datos de entrada */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1 scroll-thin" aria-label="Datos de entrada">
          <SpecInput spec={spec} setSpec={setSpec} onRegister={register} onClear={clear} registered={registered} />
        </aside>

        {/* derecha: el autómata */}
        <main className="min-w-0 space-y-4" aria-label="Resultados">
          <SpecSummary registered={registered} result={result} builtWith={builtWith} />

          {/* dos formas de obtener el autómata: que lo genere la plataforma o dibujarlo a mano */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/8 p-1" role="tablist" aria-label="Cómo obtener el autómata">
            {VIEWS.map(([id, name, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} data-testid={`view-${id}`} onClick={() => setView(id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${view === id ? 'btn-primary !rounded-xl' : 'text-white/60 hover:text-white'}`}>{icon} {name}</button>
            ))}
          </div>

          <div hidden={view !== 'auto'} className="space-y-4">
            {/* construir el autómata con los parámetros registrados */}
            <section className="glass flex flex-wrap items-center gap-4 p-4 sm:p-5" aria-label="Construir el autómata">
              <div className="min-w-0 flex-1 text-sm text-white/65">
                {!registered
                  ? <>Primero <b className="text-white/85">registra los parámetros</b> a la izquierda. Después podrás construir aquí el autómata de pila.</>
                  : <>La plataforma construirá el autómata con los parámetros registrados. {stale && <span className="text-amber-200">⚠ Registraste otros datos desde la última construcción.</span>}</>}
              </div>
              <button type="button" onClick={build} disabled={loading || !registered} className="btn-primary px-7 py-3" data-testid="build-btn">
                {loading ? 'Construyendo…' : ready && !stale ? 'Volver a construir' : 'Construir autómata'}
              </button>
              {ready && !stale && <p className="w-full text-sm text-emerald-300">✓ {result.automaton.counts.stacks} pila{result.automaton.counts.stacks === 1 ? '' : 's'} · {result.automaton.counts.states} estados · {result.automaton.counts.transitions} transiciones</p>}
              {result?.warnings?.length > 0 && ready && (
                <ul className="w-full space-y-1 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">{result.warnings.map((e, i) => <li key={i}>⚠ {e}</li>)}</ul>
              )}
            </section>

            {(error || buildErrors.length > 0) && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error || buildErrors.join(' ')}</div>
            )}
            {ready ? (
              <>
                <nav className="flex flex-wrap gap-1.5" role="tablist">
                  {TABS.map(([id, name]) => (
                    <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'btn-primary' : 'btn-ghost'}`}>{name}</button>
                  ))}
                </nav>
                <div hidden={tab !== 'automata'}><AutomatonPanel result={result} spec={builtWith} resetSignal={signal} /></div>
                {tab === 'tabla' && <TablePanel result={result} />}
                {tab === 'formal' && <FormalPanel result={result} />}
              </>
            ) : (
              <section className="glass grid min-h-[24rem] place-items-center p-8 text-center" data-testid="placeholder">
                <div className="max-w-md space-y-3">
                  <div className="sym text-5xl text-white/25">X₀X</div>
                  <h2 className="text-xl font-bold">Aquí aparecerá tu autómata de pila</h2>
                  <p className="text-sm leading-relaxed text-white/55">Registra los parámetros a la izquierda y pulsa <b className="text-white/80">Construir autómata</b>. Luego podrás ver cómo se construye, probar palabras con la tabla de valores y reproducir la simulación.</p>
                </div>
              </section>
            )}
          </div>

          <div hidden={view !== 'mano'}>
            <HandPanel spec={registered} />
          </div>
        </main>
      </div>
    </div>
  )
}