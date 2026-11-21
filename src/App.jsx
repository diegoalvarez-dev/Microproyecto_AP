import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import SpecInput from './components/SpecInput.jsx'
import AutomatonPanel from './components/AutomatonPanel.jsx'
import { FormalPanel, TablePanel } from './components/TablePanel.jsx'
import { buildMachine } from './services/api.js'
import { PRESETS } from './lib/spec.js'

const KEY = 'ap-spec-v1'
const TABS = [
  ['automata', 'Autómata'],
  ['tabla', 'Tabla de transición'],
  ['formal', 'Definición formal'],
]

// RF-12: lo último que se escribió se recuerda para consultarlo sin volver a ingresarlo.
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && typeof s.alphabet === 'string' && s.builder) return s
  } catch { /* sin almacenamiento */ }
  return { alphabet: PRESETS[0].alphabet, language: PRESETS[0].language, builder: PRESETS[0].builder, mode: 'constructor' }
}

export default function App() {
  const [spec, setSpec] = useState(load)
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('automata')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [signal, setSignal] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(spec)) } catch { /* sin almacenamiento */ }
  }, [spec])

  const build = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await buildMachine(spec.alphabet, spec.language)
      setResult(r)
      if (r.ok) {
        setTab('automata')
        setSignal((n) => n + 1)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [spec.alphabet, spec.language])

  const clear = useCallback(() => {
    setResult(null)
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
          {error && <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</div>}
          {ready ? (
            <>
              <nav className="flex flex-wrap gap-1.5" role="tablist">
                {TABS.map(([id, name]) => (
                  <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'btn-primary' : 'btn-ghost'}`}>{name}</button>
                ))}
              </nav>
              <div hidden={tab !== 'automata'}><AutomatonPanel result={result} spec={{ alphabet: spec.alphabet, language: spec.language }} resetSignal={signal} /></div>
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
        </main>
      </div>
    </div>
  )
}