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
const VIEWS = [
  ['auto', 'Generado por la plataforma', '⚙️'],
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

export default function App() {
  const [spec, setSpec] = useState(load)
  // Cada pestaña de entrada (constructor / a mano) tiene su propio autómata construido.
  const mode = spec.mode || 'constructor'
  const [results, setResults] = useState({})
  const result = results[mode]?.result || null
  const builtWith = results[mode]?.with || null
  const [tab, setTab] = useState('automata')
  const [view, setView] = useState('auto') // derecha: 'auto' = lo genera la plataforma · 'mano' = lo dibujas tú
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [signal, setSignal] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(spec)) } catch { /* sin almacenamiento */ }
  }, [spec])

  const build = useCallback(async () => {
    const m = mode
    setLoading(true)
    setError(null)
    try {
      const r = await buildMachine(spec.alphabet, spec.language)
      setResults((rs) => ({ ...rs, [m]: { result: r, with: r.ok ? { alphabet: spec.alphabet, language: spec.language } : null } }))
      if (r.ok) {
        setTab('automata')
        setSignal((n) => n + 1)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [mode, spec.alphabet, spec.language])

  const clear = useCallback(() => {
    setResults({})
    setError(null)
    setTab('automata')
  }, [])

  const ready = result?.ok
  return (
    <div className="mx-auto max-w-[110rem] space-y-5 px-4 py-6 sm:px-6">
      <Header />

      <div className="grid items-start gap-5 lg:grid-cols-[27rem_minmax(0,1fr)]">
        {/* izquierda: datos de entrada */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1 scroll-thin" aria-label="Datos de entrada">
          <SpecInput spec={spec} setSpec={setSpec} onBuild={build} onClear={clear} loading={loading} result={result} />
        </aside>

        {/* derecha: el autómata */}
        <main className="min-w-0 space-y-4" aria-label="Resultados">
          <SpecSummary spec={spec} result={result} builtWith={builtWith} />

          {/* dos formas de obtener el autómata: que lo genere la plataforma o dibujarlo a mano */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/8 p-1" role="tablist" aria-label="Cómo obtener el autómata">
            {VIEWS.map(([id, name, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} data-testid={`view-${id}`} onClick={() => setView(id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${view === id ? 'btn-primary !rounded-xl' : 'text-white/60 hover:text-white'}`}>{icon} {name}</button>
            ))}
          </div>

          <div hidden={view !== 'auto'} className="space-y-4">
            {error && <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</div>}
            {ready ? (
              <>
                <nav className="flex flex-wrap gap-1.5" role="tablist">
                  {TABS.map(([id, name]) => (
                    <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'btn-primary' : 'btn-ghost'}`}>{name}</button>
                  ))}
                </nav>
                <div hidden={tab !== 'automata'}><AutomatonPanel key={mode} result={result} spec={{ alphabet: spec.alphabet, language: spec.language }} resetSignal={signal} /></div>
                {tab === 'tabla' && <TablePanel result={result} />}
                {tab === 'formal' && <FormalPanel result={result} />}
              </>
            ) : (
              <section className="glass grid min-h-[28rem] place-items-center p-8 text-center" data-testid="placeholder">
                <div className="max-w-md space-y-3">
                  <div className="sym text-5xl text-white/25">X₀X</div>
                  <h2 className="text-xl font-bold">Aquí aparecerá tu autómata de pila</h2>
                  <p className="text-sm leading-relaxed text-white/55">Escribe el alfabeto, los bloques y las restricciones a la izquierda y pulsa <b className="text-white/80">Construir autómata</b>. Luego podrás ver cómo se construye, probar palabras con la tabla de valores y reproducir la simulación.</p>
                </div>
              </section>
            )}
          </div>

          <div hidden={view !== 'mano'}>
            <HandPanel spec={spec} />
          </div>
        </main>
      </div>
    </div>
  )
}