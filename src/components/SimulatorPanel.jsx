import { useEffect, useMemo, useState } from 'react'
import Diagram from './Diagram.jsx'
import Legend from './Legend.jsx'
import Player from './Player.jsx'
import StacksView from './StacksView.jsx'
import ValuesTable from './ValuesTable.jsx'
import { usePlayer } from '../lib/usePlayer.js'
import { simulate } from '../services/api.js'

function Tape({ word, pos }) {
  const chars = [...word]
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-lg" data-testid="tape" aria-label="Cadena de entrada">
      {chars.map((c, i) => (
        <span key={i} className={`grid h-9 w-9 place-items-center rounded-lg border font-bold transition ${i < pos ? 'border-white/10 bg-white/5 text-white/35' : i === pos ? 'border-cyan-300 bg-cyan-300/20 text-cyan-100 shadow-[0_0_12px_rgba(45,226,196,.45)]' : 'border-white/20 bg-white/8'}`}>{c}</span>
      ))}
      <span title="ϕ = vacío: fin de la entrada" className={`grid h-9 min-w-9 place-items-center rounded-lg border px-1 font-bold ${pos >= chars.length ? 'border-cyan-300 bg-cyan-300/20 text-cyan-100' : 'border-white/10 text-white/35'}`}>ϕ</span>
    </div>
  )
}

export default function SimulatorPanel({ result, spec, resetSignal }) {
  const { automaton, variables, examples = [], table } = result
  const [word, setWord] = useState('')
  const [run, setRun] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const n = run ? run.steps.length - 1 : 0
  const player = usePlayer(n, 800)

  useEffect(() => {
    setRun(null)
    setMsg(null)
  }, [resetSignal])

  const go = async (w = word) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await simulate(spec.alphabet, spec.language, w.trim())
      if (!r.ok) {
        setRun(null)
        setMsg({ bad: true, lines: r.errors })
      } else {
        setRun(r)
        player.reset(0, true)
      }
    } catch (e) {
      setMsg({ bad: true, lines: [e.message] })
    }
    setBusy(false)
  }

  const step = run ? run.steps[player.idx] : null
  const tones = useMemo(() => {
    const t = { nodes: {}, edges: {} }
    if (!run) return t
    for (let i = 0; i <= player.idx; i++) {
      const s = run.steps[i]
      t.nodes[s.state] = 'ok'
      if (s.from) t.edges[`${s.from}->${s.state}`] = 'ok'
    }
    const s = run.steps[player.idx]
    const end = player.idx === n
    t.nodes[s.state] = end && !run.accepted ? 'bad' : 'cur'
    if (s.from) t.edges[`${s.from}->${s.state}`] = 'cur'
    return t
  }, [run, player.idx, n])

  const note = step?.transition != null ? table.find((r) => r.id === step.transition)?.note : null
  const atEnd = run && player.idx === n

  return (
    <div className="space-y-4">
      <div className="glass space-y-3 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Cadena de prueba</div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Cadena de prueba" data-testid="word-input" className="field sym min-w-0 flex-1 text-lg" value={word} placeholder="Escribe una cadena, p. ej. 00111122" onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          <button type="button" className="btn-primary px-5 py-2" disabled={busy} onClick={() => go()} data-testid="run-btn">Simular</button>
        </div>

        <ValuesTable variables={variables} spec={spec} resetSignal={resetSignal} busy={busy} onShow={(w) => { setWord(w); go(w) }} />

        {examples.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-white/50">Ejemplos válidos:</span>
            {examples.map((e, i) => (
              <button key={i} type="button" className="sym rounded-lg bg-white/7 px-2.5 py-1 text-xs hover:bg-white/15" onClick={() => { setWord(e.word); go(e.word) }} title={Object.entries(e.values).map(([k, v]) => `${k}=${v}`).join(', ')}>{e.word || '(vacía)'}</button>
            ))}
          </div>
        )}
        {msg && (
          <ul className={`space-y-1 rounded-xl border p-3 text-sm ${msg.bad ? 'border-rose-400/40 bg-rose-500/10 text-rose-200' : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'}`}>
            {msg.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>

      <Legend />
      {run && step && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
            <Diagram automaton={automaton} tones={tones} follow={step.state} followKey={player.idx} resetKey={result.pattern} title={`Simulación de «${run.word || '(vacía)'}»`} className="h-[30rem]" />
            <div className="glass flex flex-col gap-3 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Pilas</div>
              <StacksView stacks={automaton.stacks} contents={step.stacks} ops={step.ops} animKey={player.idx} />
            </div>
          </div>

          <div className="glass space-y-3 p-4">
            <Tape word={run.word} pos={step.pos} />
            <Player player={player} label="Paso" />
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed" aria-live="polite" data-testid="sim-text">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-cyan-300/20 px-2 py-0.5 sym text-cyan-100">{step.state}</span>
                {step.label ? <><span className="text-white/45">llegó con</span><code className="sym rounded-md bg-white/8 px-2 py-0.5 text-xs text-cyan-100">{step.label}</code></> : <span className="text-white/60">Configuración inicial: ninguna pila creada todavía.</span>}
              </div>
              {note && <p className="mt-2 text-white/80">{note}</p>}
            </div>
            {atEnd && (
              <div data-testid="verdict" className={`rounded-xl border px-4 py-3 ${run.accepted ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/40 bg-rose-500/10 text-rose-100'}`} role="status">
                <div className="text-lg font-bold">{run.accepted ? '✓ Cadena aceptada' : '✗ Cadena rechazada'}</div>
                <p className="mt-1 text-sm">{run.accepted ? 'Se leyó toda la entrada (ϕ), se llegó al estado final y todas las pilas quedaron vacías.' : run.reason}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}