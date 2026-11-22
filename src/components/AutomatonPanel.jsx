import { useEffect, useMemo, useState } from 'react'
import Diagram from './Diagram.jsx'
import Legend from './Legend.jsx'
import Player from './Player.jsx'
import StacksView from './StacksView.jsx'
import WordLab from './WordLab.jsx'
import { usePlayer } from '../lib/usePlayer.js'
import { simulate } from '../services/api.js'

const PHASES = {
  init: ['Fase 1', 'Declarar pilas y leer', '#ff9b3d'],
  lectura: ['Fase 1', 'Declarar pilas y leer', '#ff9b3d'],
  verificacion: ['Fase 2', 'Verificar restricciones', '#ff4d8d'],
  vaciado: ['Fase 3', 'Vaciar y aceptar', '#b6f24a'],
}

// Qué se ve del autómata después de reproducir los primeros `idx` pasos de la construcción.
function visibleAt(steps, idx) {
  const states = new Set()
  const edges = new Map()
  const finals = new Set()
  let stacksShown = false
  for (let i = 0; i < idx; i++) {
    const s = steps[i]
    if (s.kind === 'state') states.add(s.state)
    if (s.kind === 'final') finals.add(s.state)
    if (s.kind === 'stacks') stacksShown = true
    if (s.kind === 'edge') {
      const k = `${s.from}->${s.to}`
      if (!edges.has(k)) edges.set(k, new Set())
      s.transitions.forEach((t) => edges.get(k).add(t))
    }
  }
  return { states, edges, finals, stacksShown }
}

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

/**
 * Autómata + simulación en un solo visor: la construcción paso a paso y, al probar una palabra,
 * la simulación (con la cadena arriba). Un único reproductor con velocidades; en pantalla
 * completa se ven también la cadena y los controles.
 */
export default function AutomatonPanel({ result, spec, resetSignal }) {
  const { automaton, steps, variables, examples = [], table } = result
  const [mode, setMode] = useState('construccion')
  const [word, setWord] = useState('')
  const [run, setRun] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
const [stacksOpen, setStacksOpen] = useState(true) // pilas visibles en pantalla completa
  const build = usePlayer(steps.length, 700)
  const nRun = run ? run.steps.length - 1 : 0
  const sim = usePlayer(nRun, 800)
  const simulating = mode === 'simulacion' && !!run
  const player = simulating ? sim : build

  useEffect(() => {
    build.reset(0, true)
    setRun(null)
    setMsg(null)
    setMode('construccion')
  }, [resetSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const runWord = async (w, show = true) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await simulate(spec.alphabet, spec.language, (w ?? '').trim())
      if (!r.ok) {
        setMsg(r.errors)
        return r
      }
      if (show) {
        setRun(r)
        setMode('simulacion')
        sim.reset(0, true)
      }
      return r
    } catch (e) {
      setMsg([e.message])
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  // ----- construcción
  const vis = useMemo(() => visibleAt(steps, build.idx), [steps, build.idx])
  const cur = build.idx > 0 ? steps[build.idx - 1] : null
  const phase = cur?.phase ? PHASES[cur.phase] : null
  const buildTones = useMemo(() => {
    const t = { nodes: {}, edges: {} }
    if (cur?.kind === 'state' || cur?.kind === 'final') t.nodes[cur.state] = 'new'
    if (cur?.kind === 'edge') {
      t.edges[`${cur.from}->${cur.to}`] = 'new'
      t.nodes[cur.to] = 'cur'
    }
    return t
  }, [cur])

  // ----- simulación
  const step = run ? run.steps[sim.idx] : null
  const simTones = useMemo(() => {
    const t = { nodes: {}, edges: {} }
    if (!run) return t
    for (let i = 0; i <= sim.idx; i++) {
      const s = run.steps[i]
      t.nodes[s.state] = 'ok'
      if (s.from) t.edges[`${s.from}->${s.state}`] = 'ok'
    }
    const s = run.steps[sim.idx]
    t.nodes[s.state] = sim.idx === nRun && !run.accepted ? 'bad' : 'cur'
    if (s.from) t.edges[`${s.from}->${s.state}`] = 'cur'
    return t
  }, [run, sim.idx, nRun])
  const note = step?.transition != null ? table.find((r) => r.id === step.transition)?.note : null
  const atEnd = simulating && sim.idx === nRun

  const followId = simulating ? step.state : cur?.kind === 'edge' ? cur.to : cur?.state
  const nTrans = [...vis.edges.values()].reduce((a, s) => a + s.size, 0)

  const controls = (
    <div className="space-y-3">
      <Player player={player} label="Paso" />
      <div className="min-h-[3.5rem] rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed" aria-live="polite" data-testid={simulating ? 'sim-text' : 'step-text'}>
        {simulating ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sym rounded-md bg-cyan-300/20 px-2 py-0.5 text-cyan-100">{step.state}</span>
              {step.label ? <><span className="text-white/45">llegó con</span><code className="sym rounded-md bg-white/8 px-2 py-0.5 text-xs text-cyan-100">{step.label}</code></> : <span className="text-white/60">Configuración inicial: ninguna pila creada todavía.</span>}
            </div>
            {note && <p className="mt-2 text-white/80">{note}</p>}
          </>
        ) : (
          <>
            {phase && <span className="mr-2 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: `${phase[2]}26`, color: phase[2] }}>{phase[0]} · {phase[1]}</span>}
            {cur ? (
              <>
                {cur.kind === 'phase' && <b>{cur.title}. </b>}
                {cur.text}
                {cur.labels && <div className="mt-2 flex flex-wrap gap-1.5">{cur.labels.map((l, i) => <code key={i} className="sym rounded-md bg-white/8 px-2 py-0.5 text-xs text-cyan-100">{l}</code>)}</div>}
              </>
            ) : (
              <span className="text-white/45">Pulsa reproducir para ver cómo se construye el autómata de pila, estado por estado.</span>
            )}
          </>
        )}
      </div>
      {atEnd && (
        <div data-testid="verdict" role="status" className={`rounded-xl border px-4 py-3 ${run.accepted ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/40 bg-rose-500/10 text-rose-100'}`}>
          <div className="text-lg font-bold">{run.accepted ? '✓ Cadena aceptada' : '✗ Cadena rechazada'}</div>
          <p className="mt-1 text-sm">{run.accepted ? 'Se leyó toda la entrada (ϕ), se llegó al estado final y todas las pilas quedaron vacías.' : run.reason}</p>
        </div>
      )}
    </div>
  )

const overlay = (
  <>
    {simulating && (
      <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4" data-testid="tape-full">
        <div className="pointer-events-auto max-w-full rounded-2xl border border-white/10 bg-[#140d22]/90 px-3 py-2 backdrop-blur">
          <Tape word={run.word} pos={step.pos} />
        </div>
      </div>
    )}
    {(simulating || vis.stacksShown) && (
      <div className="absolute bottom-9 right-3 max-w-[calc(100%-1.5rem)]" data-testid="stacks-full" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-white/10 bg-[#140d22]/90 p-2 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Pilas</span>
            <button type="button" onClick={() => setStacksOpen((o) => !o)} aria-pressed={stacksOpen} className="rounded-md px-1.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white">
              {stacksOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {stacksOpen && (
            <div className="mt-1 max-w-full overflow-x-auto scroll-thin">
              {simulating
                ? <StacksView compact stacks={automaton.stacks} contents={step.stacks} ops={step.ops} animKey={sim.idx} />
                : <StacksView compact stacks={automaton.stacks} />}
            </div>
          )}
        </div>
      </div>
    )}
  </>
)

  const seg = (id, name, disabled) => (
    <button key={id} type="button" disabled={disabled} aria-pressed={mode === id} onClick={() => setMode(id)} data-testid={`mode-${id}`}
      title={disabled ? 'Prueba una palabra para ver la simulación' : undefined}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-35 ${mode === id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}>{name}</button>
  )

  return (
    <div className="space-y-4">
      <WordLab word={word} setWord={setWord} onRun={runWord} busy={busy} msg={msg} examples={examples} variables={variables} spec={spec} resetSignal={resetSignal} />

      <section className="glass space-y-4 p-4 sm:p-5" aria-label="Autómata de pila">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Autómata de pila</h2>
          <div className="flex rounded-xl bg-white/8 p-1" role="group" aria-label="Qué se muestra">
            {seg('construccion', 'Construcción', false)}
            {seg('simulacion', 'Simulación', !run)}
          </div>
        </div>

        {simulating && (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">Cadena que se está simulando</div>
            <Tape word={run.word} pos={step.pos} />
          </div>
        )}

        <div className="space-y-4">
          <Diagram
            automaton={automaton}
            visible={simulating ? null : vis}
            tones={simulating ? simTones : buildTones}
            follow={followId || null}
            followKey={`${mode}-${player.idx}`}
            resetKey={result.pattern}
            title={simulating ? `Simulación de «${run.word || '(vacía)'}»` : 'Construcción del autómata'}
            className="h-[36rem]"
            overlay={overlay}
            reserveTop={simulating ? 70 : 0}
            footer={<div className="glass p-4">{controls}</div>}
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0a0712]/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Pilas del autómata</div>
            {simulating ? (
              <StacksView stacks={automaton.stacks} contents={step.stacks} ops={step.ops} animKey={sim.idx} />
            ) : vis.stacksShown ? (
              <StacksView stacks={automaton.stacks} />
            ) : (
              <p className="text-sm text-white/45">La primera transición declarará qué pilas se van a usar (una por variable, más sus auxiliares).</p>
            )}
            <Legend />
            {!simulating && (
              <div className="mt-auto text-xs text-white/45">{vis.states.size} / {automaton.counts.states} estados · {nTrans} / {automaton.counts.transitions} transiciones</div>
            )}
          </div>
        </div>

        {controls}
      </section>
    </div>
  )
}