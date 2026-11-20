import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import SpecInput from './components/SpecInput.jsx'
import ConstructionPanel from './components/ConstructionPanel.jsx'
import SimulatorPanel from './components/SimulatorPanel.jsx'
import { FormalPanel, TablePanel } from './components/TablePanel.jsx'
import { buildMachine } from './services/api.js'
import { PRESETS } from './lib/spec.js'

const KEY = 'ap-spec-v1'
const TABS = [
  ['construccion', 'Construcción'],
  ['simulacion', 'Simulación'],
  ['tabla', 'Tabla de transición'],
  ['formal', 'Definición formal'],
]

// RF-12: lo último que se escribió se recuerda para consultarlo sin volver a ingresarlo.
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.alphabet && s.builder) return s
  } catch { /* sin almacenamiento */ }
  return { alphabet: PRESETS[0].alphabet, language: PRESETS[0].language, builder: PRESETS[0].builder, mode: 'constructor' }
}

export default function App() {
  const [spec, setSpec] = useState(load)
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('construccion')
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
        setTab('construccion')
        setSignal((n) => n + 1)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [spec.alphabet, spec.language])

  const ready = result?.ok
  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <Header />

      <SpecInput spec={spec} setSpec={setSpec} onBuild={build} loading={loading} result={result} />
      {error && <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</div>}

      {ready && (
        <section aria-label="Resultados" className="space-y-4">
          <nav className="flex flex-wrap gap-1.5" role="tablist">
            {TABS.map(([id, name], i) => (
              <button key={id} role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'btn-primary' : 'btn-ghost'}`}>
                {i + 2} · {name}
              </button>
            ))}
          </nav>
          <div hidden={tab !== 'construccion'}><ConstructionPanel result={result} resetSignal={signal} /></div>
          <div hidden={tab !== 'simulacion'}><SimulatorPanel result={result} spec={{ alphabet: spec.alphabet, language: spec.language }} resetSignal={signal} /></div>
          {tab === 'tabla' && <TablePanel result={result} />}
          {tab === 'formal' && <FormalPanel result={result} />}
        </section>
      )}
    </div>
  )
}
