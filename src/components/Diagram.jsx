import { useContext, useMemo, useRef } from 'react'
import { R, computeLayout, layoutWithPositions, wrapLabel } from '../lib/layout.js'
import PanZoom, { DiagramContext } from './PanZoom.jsx'

export const TONES = {
  base: '#8b9cff',
  new: '#fbbf24', // lo que acaba de crearse
  cur: '#22d3ee', // estado / transición actual de la simulación
  ok: '#34d399', // ya recorrido
  bad: '#fb7185', // la ejecución se bloqueó aquí
}
// Color base de cada estado según la fase del algoritmo en que se creó.
const PHASE = { init: '#8b9cff', lectura: '#8b9cff', verificacion: '#c4a1ff', vaciado: '#34d399' }
const NODE_FILL = '#0d1230'
const glow = (tone) => (tone === 'base' ? undefined : `drop-shadow(0 0 7px ${TONES[tone]})`)

function Edge({ edge, lines, tone, color }) {
  const c = color || TONES[tone]
  const strong = tone !== 'base'
  const { label } = edge
  const rowH = 17
  return (
    <g style={{ filter: glow(tone) }}>
      <path d={edge.path} pathLength="1" fill="none" stroke={c} strokeWidth={strong ? 3.2 : 2} strokeLinecap="round" className="edge-draw" />
      <polygon points={edge.arrow} fill={c} className="fade-in" />
      <g className="label-in">
        <rect x={label.x - label.w / 2} y={label.y - label.h / 2} width={label.w} height={lines.length * rowH + 10} rx={10} fill="#060919" fillOpacity={0.94} stroke={c} strokeOpacity={0.7} />
        {lines.map((l, i) => (
          <text key={i} x={label.x} y={label.y - label.h / 2 + 5 + rowH * (i + 0.5) + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#f1f3ff" style={{ fontFamily: 'var(--font-mono)' }}>
            {l}
          </text>
        ))}
      </g>
    </g>
  )
}

function Node({ id, pos, state, tone, ctx }) {
  const color = tone === 'base' ? PHASE[state.phase] || TONES.base : TONES[tone]
  const drag = useRef(null)
  const moving = !!ctx?.moving
  const down = (e) => {
    if (!moving || e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y }
  }
  const move = (e) => {
    const d = drag.current
    if (d) ctx.setPos(id, { x: d.x + (e.clientX - d.sx) / ctx.scale, y: d.y + (e.clientY - d.sy) / ctx.scale })
  }
  return (
    <g data-testid={`node-${id}`} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} style={moving ? { cursor: 'grab' } : undefined}>
      <title>{`${id}: ${state.desc}`}</title>
      <g className="node-in" style={{ filter: glow(tone) }}>
        <circle cx={pos.x} cy={pos.y} r={R} fill={NODE_FILL} stroke={color} strokeWidth={2.6} />
        {state.final && <circle cx={pos.x} cy={pos.y} r={R - 6.5} fill="none" stroke={color} strokeWidth={2.2} />}
        <text x={pos.x} y={pos.y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill="#f1f3ff" style={{ fontFamily: 'var(--font-mono)' }}>{id}</text>
      </g>
    </g>
  )
}

function Content({ automaton, layout: base, visible, tones }) {
  const ctx = useContext(DiagramContext)
  const overrides = ctx?.overrides
  const layout = useMemo(() => {
    if (!overrides || !Object.keys(overrides).length) return base
    return layoutWithPositions(automaton, { ...base.nodes, ...overrides })
  }, [automaton, base, overrides])
  const byKey = useMemo(() => Object.fromEntries(automaton.edges.map((e) => [e.key, e])), [automaton])
  const nodeTone = (id) => tones.nodes[id] || 'base'
  const showInit = !visible || visible.states.has(automaton.initial)

  return (
    <>
      {layout.edges.map((e) => {
        const src = byKey[e.key]
        let ids = src.transitions
        if (visible) {
          const seen = visible.edges.get(e.key)
          if (!seen) return null
          ids = src.transitions.filter((t) => seen.has(t))
        }
        const lines = src.transitions.flatMap((t, i) => (ids.includes(t) ? wrapLabel(src.labels[i]) : []))
        if (!lines.length) return null
        return <Edge key={e.key} edge={e} lines={lines} tone={tones.edges[e.key] || 'base'} />
      })}
      {showInit && layout.initialArrow && (
        <g className="fade-in">
          <path d={layout.initialArrow.line} stroke={TONES[nodeTone(automaton.initial)]} strokeWidth={3} strokeLinecap="round" fill="none" />
          <polygon points={layout.initialArrow.arrow} fill={TONES[nodeTone(automaton.initial)]} />
        </g>
      )}
      {automaton.states.map((s) =>
        !visible || visible.states.has(s.id) ? (
          <Node key={s.id} id={s.id} pos={layout.nodes[s.id]} state={visible && !visible.finals.has(s.id) ? { ...s, final: false } : s} tone={nodeTone(s.id)} ctx={ctx} />
        ) : null,
      )}
    </>
  )
}

/**
 * Diagrama del autómata.
 *   visible = { states:Set, edges:Map(key -> Set de ids de transición), finals:Set } | null (todo visible)
 *   tones   = { nodes:{id:tono}, edges:{key:tono} }
 *   follow  = id del estado a centrar (opcional)
 */
export default function Diagram({ automaton, visible = null, tones, follow = null, followKey, resetKey, title, className = 'h-[30rem]' }) {
  const layout = useMemo(() => computeLayout(automaton), [automaton])
  const pos = follow ? layout.nodes[follow] : null
  return (
    <PanZoom bounds={layout.bounds} resetKey={resetKey} title={title} className={className} follow={pos ? { x: pos.x, y: pos.y, key: followKey ?? follow } : null}>
      <Content automaton={automaton} layout={layout} visible={visible} tones={tones} />
    </PanZoom>
  )
}
