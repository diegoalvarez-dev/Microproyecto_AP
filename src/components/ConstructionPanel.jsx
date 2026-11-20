import { useEffect, useMemo } from 'react'
import Diagram from './Diagram.jsx'
import Player from './Player.jsx'
import StacksView from './StacksView.jsx'
import { usePlayer } from '../lib/usePlayer.js'
import Legend from './Legend.jsx'


const PHASES = {
  init: ['Fase 1', 'Declarar pilas y leer', '#8b9cff'],
  lectura: ['Fase 1', 'Declarar pilas y leer', '#8b9cff'],
  verificacion: ['Fase 2', 'Verificar restricciones', '#c4a1ff'],
  vaciado: ['Fase 3', 'Vaciar y aceptar', '#34d399'],
}

// Qué se ve del autómata después de reproducir los primeros `idx` pasos.
function visibleAt(steps, idx) {
  const states = new Set()
  const edges = new Map()
  const finals = new Set()
  let stacksShown = false
  let last = null
  for (let i = 0; i < idx; i++) {
    const s = steps[i]
    last = s
    if (s.kind === 'state') states.add(s.state)
    if (s.kind === 'final') finals.add(s.state)
    if (s.kind === 'stacks') stacksShown = true
    if (s.kind === 'edge') {
      const k = `${s.from}->${s.to}`
      if (!edges.has(k)) edges.set(k, new Set())
      s.transitions.forEach((t) => edges.get(k).add(t))
    }
  }
  return { states, edges, finals, stacksShown, last }
}

export default function ConstructionPanel({ result, resetSignal }) {
  const { automaton, steps } = result
  const player = usePlayer(steps.length, 700)
  useEffect(() => player.reset(0, true), [resetSignal]) // eslint-disable-line react-hooks/exhaustive-deps
  const vis = useMemo(() => visibleAt(steps, player.idx), [steps, player.idx])
  const cur = player.idx > 0 ? steps[player.idx - 1] : null
  const phase = cur?.phase ? PHASES[cur.phase] : null

  const tones = useMemo(() => {
    const t = { nodes: {}, edges: {} }
    if (cur?.kind === 'state') t.nodes[cur.state] = 'new'
    if (cur?.kind === 'final') t.nodes[cur.state] = 'new'
    if (cur?.kind === 'edge') {
      t.edges[`${cur.from}->${cur.to}`] = 'new'
      t.nodes[cur.to] = 'cur'
    }
    return t
  }, [cur])

  const followId = cur?.kind === 'edge' ? cur.to : cur?.state
  const shown = vis.states.size
  const nTrans = [...vis.edges.values()].reduce((a, s) => a + s.size, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Diagram automaton={automaton} visible={vis} tones={tones} follow={followId || null} followKey={player.idx} resetKey={result.pattern} title="Construcción del autómata" className="h-[32rem]" />
        <div className="glass flex flex-col gap-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Pilas del autómata</div>
          {vis.stacksShown ? (
             <>
              <StacksView stacks={automaton.stacks} />
              <Legend />
            </>
          ) : (
            <p className="text-sm text-white/45">La primera transición declarará qué pilas se van a usar (una por variable, más sus auxiliares).</p>
          )}
          <div className="mt-auto text-xs text-white/45">
            {shown} / {automaton.counts.states} estados · {nTrans} / {automaton.counts.transitions} transiciones
          </div>
        </div>
      </div>

      <div className="glass space-y-3 p-4">
        <Player player={player} label="Paso" />
        <div className="min-h-[3.5rem] rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed" aria-live="polite" data-testid="step-text">
          {phase && (
            <span className="mr-2 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: `${phase[2]}26`, color: phase[2] }}>{phase[0]} · {phase[1]}</span>
          )}
          {cur ? (
            <>
              {cur.kind === 'phase' && <b>{cur.title}. </b>}
              {cur.text}
              {cur.labels && <div className="mt-2 flex flex-wrap gap-1.5">{cur.labels.map((l, i) => <code key={i} className="sym rounded-md bg-white/8 px-2 py-0.5 text-xs text-cyan-100">{l}</code>)}</div>}
            </>
          ) : (
            <span className="text-white/45">Pulsa reproducir para ver cómo se construye el autómata de pila, estado por estado.</span>
          )}
        </div>
      </div>
    </div>
  )
}
