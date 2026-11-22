import { useEffect, useRef, useState } from 'react'

const HUES = [330, 160, 45, 95, 200, 15] // un color por variable (n, m, k, ...)
const H_NORMAL = 280 // alto del área de apilado (en pantalla completa se usa una versión compacta)
const OP = { push: { c: '#b6f24a', t: 'apila' }, pop: { c: '#ff4d6d', t: 'desapila' }, peek: { c: '#2de2c4', t: 'lee el tope' } }

function StackColumn({ def, hue, items, ops, animKey, exists, compact }) {
  const H = compact ? 150 : H_NORMAL
  const prev = useRef(items)
  const [ghosts, setGhosts] = useState([])
  const sig = items.join('|')

  // lo que acaba de salir de la pila se anima hacia arriba antes de desaparecer
  useEffect(() => {
    const p = prev.current
    prev.current = items
    if (p.length > items.length) {
      setGhosts(p.slice(items.length).map((s, i) => ({ k: `${animKey}-${i}`, s, at: items.length + i })))
      const t = setTimeout(() => setGhosts([]), 650)
      return () => clearTimeout(t)
    }
    setGhosts([])
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const h = Math.max(8, Math.min(32, Math.floor(H / Math.max(items.length, 8))))
  const isAux = def.role === 'aux'
  const color = `hsl(${hue} 85% 62%)`
  const style = (s, bottom) => {
    const isBottom = s === def.show_bottom
    return {
      bottom,
      height: h - 3,
      background: isBottom ? 'rgba(148,163,184,.14)' : `hsl(${hue} 80% 55% / .2)`,
      border: `1.5px ${isAux ? 'dashed' : 'solid'} ${isBottom ? 'rgba(148,163,184,.6)' : `hsl(${hue} 85% 65% / .85)`}`,
      color: isBottom ? '#cbd5e1' : '#f4f6ff',
    }
  }
  const mine = ops.filter((o) => o.stack === def.name)
  const peek = mine.some((o) => o.op === 'peek')

  return (
    <div className={`flex ${compact ? 'w-[64px]' : 'w-[92px]'} flex-col items-center gap-1.5`} data-testid={`stack-${def.name}`}>
      <div className="text-center leading-tight">
        <div className="sym text-lg" style={{ color }}>{def.show_counter}</div>
        <div className="text-[10px] text-white/45">{isAux ? `aux. de ${def.owner}` : def.var ? `cuenta ${def.var}` : 'sin uso'}</div>
      </div>
      <div
        className="relative w-full rounded-b-lg border-x-2 border-b-2 border-white/25 px-1 pb-1"
        style={{ height: H + 4, opacity: exists ? 1 : 0.45, borderStyle: exists ? 'solid' : 'dashed' }}
      >
        <div className="relative h-full w-full overflow-visible">
          {items.map((s, i) => (
            <div key={`${i}-${s}`} className="stack-item push-in" style={style(s, i * h)} data-testid={`item-${def.name}`}>
              {h >= 14 ? s : ''}
            </div>
          ))}
          {ghosts.map((g) => (
            <div key={g.k} className="stack-item pop-out" style={style(g.s, g.at * h)}>
              {h >= 14 ? g.s : ''}
            </div>
          ))}
          {peek && items.length > 0 && <div key={animKey} className="peek-ring" style={{ bottom: (items.length - 1) * h - 2, height: h + 1 }} />}
          {!exists && <div className="absolute inset-x-0 bottom-2 text-center text-[10px] text-white/35">sin crear</div>}
        </div>
      </div>
      <div className="flex h-9 flex-col items-center gap-0.5">
        {mine.map((o, i) => (
          <span key={`${animKey}-${i}`} className="badge-in rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${OP[o.op].c}22`, color: OP[o.op].c }}>
            {OP[o.op].t} {o.symbol}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Las pilas lado a lado.
 *   contents: { X: ['X₀','X','X'], ... } (de abajo hacia arriba) | null → solo el fondo de cada pila
 *   ops: operaciones netas del paso actual, para resaltar apilar / desapilar
 */
export default function StacksView({ stacks, contents = null, ops = [], animKey = 0, declared = true, compact = false }) {
  const vars = [...new Set(stacks.map((s) => s.var))]
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 overflow-x-auto pb-1 scroll-thin" data-testid="stacks-view">
      {stacks.map((def) => {
        const items = contents ? contents[def.name] || [] : declared ? [def.show_bottom] : []
        const exists = contents ? items.length > 0 || animKey > 0 : declared
        return <StackColumn key={def.name} def={def} hue={HUES[vars.indexOf(def.var) % HUES.length]} items={items} ops={ops} animKey={animKey} exists={exists} compact={compact} />
      })}
    </div>
  )
}
