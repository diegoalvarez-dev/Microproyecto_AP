import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutomatonPanel from './AutomatonPanel.jsx'
import { FormalPanel, TablePanel } from './TablePanel.jsx'
import { handCheck, handSimulate, handValidate } from '../services/api.js'

/**
 * «Dibujar a mano»: el estudiante arma su propio autómata de pila con círculos (estados) y flechas
 * (transiciones), escribe cada transición con la notación de la plataforma (leído, tope, apila),
 * lo registra y lo valida contra el lenguaje de la izquierda (con explicación de lo que falle).
 */
const KEY = 'ap-hand-v1'
const W = 1000
const H = 520
const R = 28
const MAX_STATES = 16
const C = { base: '#ff9b3d', sel: '#2de2c4', bad: '#ff4d6d', ok: '#b6f24a', fill: '#1a1030', label: '#140d22' }
const BASE_KEYS = ['X₀', 'X', 'Y₀', 'Y', 'Z₀', 'Z', 'X_A₀', 'X_A', '∅', 'ε', 'ϕ', 'λ', ' ; ', ', ']

const HINTS = {
  mover: 'Arrastra los estados para acomodarlos. Haz clic en una flecha para editar sus símbolos.',
  estado: 'Haz clic en el lienzo para crear un estado.',
  flecha: 'Haz clic en el estado de origen y luego en el de destino (el mismo estado para hacer un rizo).',
  inicial: 'Haz clic en un estado para marcarlo como estado inicial.',
  final: 'Haz clic en un estado para marcarlo (o desmarcarlo) como estado final.',
  renombrar: 'Haz clic en un estado para cambiarle el nombre. También sirve el doble clic.',
  borrar: 'Haz clic en un estado o en una flecha para borrarlo.',
}

// ---------------------------------------------------------------- iconos (trazo, como en la plataforma de autómatas)
const Svg = ({ children }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const ICONS = {
  mover: <Svg><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" /><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></Svg>,
  estado: <Svg><circle cx="12" cy="12" r="8" /></Svg>,
  flecha: <Svg><circle cx="4.5" cy="12" r="2.2" /><path d="M7 12h13" /><path d="m16 8 4 4-4 4" /></Svg>,
  inicial: <Svg><path stroke="#2de2c4" d="M1.5 12h6" /><path stroke="#2de2c4" d="m5 9 3 3-3 3" /><circle cx="16" cy="12" r="6" /></Svg>,
  final: <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /></Svg>,
  renombrar: <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>,
  borrar: <Svg><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></Svg>,
  undo: <Svg><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" /></Svg>,
  redo: <Svg><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" /></Svg>,
}
const TOOLS = [
  ['mover', 'Mover estados'],
  ['estado', 'Crear estado'],
  ['flecha', 'Crear transición'],
  ['inicial', 'Marcar estado inicial'],
  ['final', 'Marcar estado final'],
  ['renombrar', 'Renombrar estado'],
  ['borrar', 'Borrar'],
]

const ekey = (e) => `${e.from}->${e.to}`
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && Array.isArray(s.states) && Array.isArray(s.edges)) return { states: s.states, edges: s.edges }
  } catch { /* sin almacenamiento */ }
  return { states: [], edges: [] }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const alphabetSymbols = (text) => [...new Set((text || '').replace(/[{}\s]/g, '').split(',').filter(Boolean))]
const valsText = (v) => Object.entries(v || {}).map(([k, x]) => `${k}=${x}`).join(', ')

// ---------------------------------------------------------------- geometría de las flechas
function geom(e, byId, hasRev) {
  const a = byId[e.from]
  const b = byId[e.to]
  if (!a || !b) return null
  if (e.from === e.to) {
    const p = (deg, r) => ({ x: a.x + r * Math.cos((deg * Math.PI) / 180), y: a.y + r * Math.sin((deg * Math.PI) / 180) })
    const s = p(-118, R)
    const t = p(-62, R + 3)
    return { d: `M ${s.x} ${s.y} C ${a.x - 46} ${a.y - R - 66}, ${a.x + 46} ${a.y - R - 66}, ${t.x} ${t.y}`, lx: a.x, ly: a.y - R - 60 }
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const u = { x: dx / len, y: dy / len }
  const n = { x: -u.y, y: u.x }
  const curv = hasRev ? 52 : 0
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const c = { x: mid.x + n.x * curv, y: mid.y + n.y * curv }
  const toward = (from, to, r) => {
    const vx = to.x - from.x
    const vy = to.y - from.y
    const l = Math.hypot(vx, vy) || 1
    return { x: from.x + (vx / l) * r, y: from.y + (vy / l) * r }
  }
  const s = toward(a, c, R)
  const t = toward(b, c, R + 4)
  const bx = 0.25 * s.x + 0.5 * c.x + 0.25 * t.x
  const by = 0.25 * s.y + 0.5 * c.y + 0.25 * t.y
  const off = curv ? 16 : -18
  return { d: `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${t.x} ${t.y}`, lx: bx + n.x * off, ly: by + n.y * off }
}

const Step = ({ n, children }) => (
  <h3 className="flex items-center gap-3 text-lg font-bold">
    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-sm text-cyan-300">{n}</span>{children}
  </h3>
)

export default function HandPanel({ spec }) {
  const alphabetText = spec?.alphabet || ''
  const languageText = spec?.language || ''
  const init = useRef(load()).current
  const [states, setStates] = useState(init.states)
  const [edges, setEdges] = useState(init.edges)
  const [tool, setTool] = useState('mover')
  const [sel, setSel] = useState(null) // { type: 'state' | 'edge', id }
  const [pending, setPending] = useState(null) // estado de origen de una flecha en curso
  const [cursor, setCursor] = useState(null)
  const [renaming, setRenaming] = useState(null) // id del estado que se está renombrando
  const [notice, setNotice] = useState(null)
  const [val, setVal] = useState(null)
  const [reg, setReg] = useState(null) // autómata registrado: { sig, payload, view } (lo que se ve abajo)
  const [vtab, setVtab] = useState('automata')
  const [request, setRequest] = useState(null)
  const viewer = useRef(null)
  const [check, setCheck] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [busy, setBusy] = useState(null)
  const [, setHv] = useState(0) // para repintar los botones deshacer / rehacer
  const svgRef = useRef(null)
  const drag = useRef(null)
  const ta = useRef(null)
  const caretAfter = useRef(null)
  const hist = useRef({ past: [], future: [], tag: null })

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ states, edges })) } catch { /* sin almacenamiento */ }
  }, [states, edges])

  const byId = useMemo(() => Object.fromEntries(states.map((s) => [s.id, s])), [states])
  const revSet = useMemo(() => new Set(edges.map(ekey)), [edges])
  const payload = useMemo(() => ({
    alphabet: alphabetText,
    states: states.map((s) => ({ id: s.id, initial: !!s.initial, final: !!s.final })),
    transitions: edges.flatMap((e) => e.lines.map((text, line) => ({ edge: ekey(e), line, src: e.from, dst: e.to, text })).filter((t) => t.text.trim())),
  }), [alphabetText, states, edges])
  const sig = JSON.stringify(payload)
  const fullSig = `${sig}|${languageText}`

  // al cambiar el dibujo, lo que se había simulado o validado ya no vale
  useEffect(() => {
    setCheck(null)
    setMsgs([])
  }, [fullSig])

  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  // revisión de la sintaxis de las transiciones mientras se escribe
  useEffect(() => {
    if (!states.length) { setVal(null); return undefined }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await handValidate(payload)
        if (alive) setVal(r)
      } catch {
        if (alive) setVal(null)
      }
    }, 450)
    return () => { alive = false; clearTimeout(t) }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const errAt = useMemo(() => {
    const m = {}
    ;(val?.errors || []).forEach((e) => { if (e.edge != null) m[`${e.edge}#${e.line}`] = e.message })
    return m
  }, [val])
  const generalErrors = (val?.errors || []).filter((e) => e.edge == null)
  const badEdges = useMemo(() => new Set((val?.errors || []).filter((e) => e.edge != null).map((e) => e.edge)), [val])
  const parsedAt = useMemo(() => {
    const m = {}
    ;(val?.parsed || []).forEach((p) => { m[`${p.edge}#${p.line}`] = p.label })
    return m
  }, [val])

  // ------------------------------------------------------------ historial (deshacer / rehacer)
  const snap = () => JSON.stringify({ states, edges })
  const record = (tag = null) => {
    const h = hist.current
    if (tag && h.tag === tag) return
    h.tag = tag
    h.past.push(snap())
    if (h.past.length > 100) h.past.shift()
    h.future = []
    setHv((v) => v + 1)
  }
  const restore = (json) => {
    const s = JSON.parse(json)
    setStates(s.states)
    setEdges(s.edges)
    setSel(null)
    setPending(null)
    setRenaming(null)
  }
  const undo = () => {
    const h = hist.current
    if (!h.past.length) return
    h.future.push(snap())
    restore(h.past.pop())
    h.tag = null
    setHv((v) => v + 1)
  }
  const redo = () => {
    const h = hist.current
    if (!h.future.length) return
    h.past.push(snap())
    restore(h.future.pop())
    h.tag = null
    setHv((v) => v + 1)
  }

  // ------------------------------------------------------------ edición
  const nextName = (list) => {
    let i = 0
    while (list.some((s) => s.id === `q${i}`)) i++
    return `q${i}`
  }
  const addState = (x, y) => {
    if (states.length >= MAX_STATES) return setNotice(`Máximo ${MAX_STATES} estados.`)
    record()
    const id = nextName(states)
    setStates((ss) => [...ss, { id, x: Math.round(x), y: Math.round(y), initial: ss.length === 0, final: false }])
    setSel({ type: 'state', id })
  }
  const setInitial = (id) => {
    record()
    setStates((ss) => ss.map((s) => ({ ...s, initial: s.id === id ? !s.initial : false })))
  }
  const toggleFinal = (id) => {
    record()
    setStates((ss) => ss.map((s) => (s.id === id ? { ...s, final: !s.final } : s)))
  }
  const commitRename = (id, raw) => {
    setRenaming(null)
    const name = (raw || '').trim().replace(/\s+/g, '')
    if (!name || name === id) return
    if (states.some((s) => s.id === name)) return setNotice(`Ya existe un estado llamado «${name}».`)
    record()
    setStates((ss) => ss.map((s) => (s.id === id ? { ...s, id: name } : s)))
    setEdges((es) => es.map((e) => ({ ...e, from: e.from === id ? name : e.from, to: e.to === id ? name : e.to })))
    setSel({ type: 'state', id: name })
  }
  const delState = (id) => {
    record()
    setStates((ss) => ss.filter((s) => s.id !== id))
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id))
    setSel(null)
  }
  const delEdge = (key) => {
    record()
    setEdges((es) => es.filter((e) => ekey(e) !== key))
    setSel(null)
  }
  const addEdge = (from, to) => {
    const key = `${from}->${to}`
    if (!edges.some((e) => ekey(e) === key)) {
      record()
      setEdges((es) => [...es, { from, to, lines: [''] }])
    }
    setSel({ type: 'edge', id: key })
  }
  const setLines = (key, text) => {
    record(`text:${key}`)
    setEdges((es) => es.map((e) => (ekey(e) === key ? { ...e, lines: text.split('\n') } : e)))
  }
  const clearAll = () => {
    if ((states.length || edges.length) && !window.confirm('¿Borrar todo el dibujo?')) return
    record()
    setStates([]); setEdges([]); setSel(null); setPending(null); setCheck(null); setReg(null)
  }
  // acomoda los estados en columnas según la distancia desde el inicial
  const arrange = () => {
    if (!states.length) return
    record()
    const adj = {}
    edges.forEach((e) => { (adj[e.from] ||= []).push(e.to) })
    const start = (states.find((s) => s.initial) || states[0]).id
    const depth = { [start]: 0 }
    const queue = [start]
    while (queue.length) {
      const cur = queue.shift()
      ;(adj[cur] || []).forEach((n) => { if (!(n in depth)) { depth[n] = depth[cur] + 1; queue.push(n) } })
    }
    const last = Math.max(...Object.values(depth))
    states.forEach((s) => { if (!(s.id in depth)) depth[s.id] = last + 1 })
    const layers = {}
    states.forEach((s) => { (layers[depth[s.id]] ||= []).push(s.id) })
    const cols = Object.keys(layers).length
    const gap = cols > 1 ? Math.min(190, (W - 220) / (cols - 1)) : 0
    const pos = {}
    Object.keys(layers).map(Number).sort((a, b) => a - b).forEach((d, ci) => {
      const ids = layers[d]
      const sp = Math.min(120, (H - 200) / Math.max(1, ids.length))
      ids.forEach((id, i) => { pos[id] = { x: Math.round(120 + ci * gap), y: Math.round(H / 2 + (i - (ids.length - 1) / 2) * sp) } })
    })
    setStates((ss) => ss.map((s) => ({ ...s, ...pos[s.id] })))
  }

  // ------------------------------------------------------------ lienzo
  const point = (e) => {
    const s = svgRef.current
    const p = s.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const q = p.matrixTransform(s.getScreenCTM().inverse())
    return { x: q.x, y: q.y }
  }
  const onBg = (e) => {
    hist.current.tag = null
    if (tool === 'estado') {
      const p = point(e)
      addState(clamp(p.x, 70, W - 40), clamp(p.y, 90, H - 40))
    } else {
      setSel(null)
      setPending(null)
    }
  }
  const onState = (e, s) => {
    e.stopPropagation()
    hist.current.tag = null
    if (tool === 'borrar') return delState(s.id)
    if (tool === 'inicial') return setInitial(s.id)
    if (tool === 'final') return toggleFinal(s.id)
    if (tool === 'renombrar') {
      setSel({ type: 'state', id: s.id })
      // se espera un instante: si no, el navegador mueve el foco al lienzo (por el clic) y cierra el cuadro enseguida
      return void setTimeout(() => setRenaming(s.id), 30)
    }
    if (tool === 'flecha') {
      if (!pending) { setPending(s.id); setCursor(point(e)); setSel({ type: 'state', id: s.id }); return }
      addEdge(pending, s.id)
      setPending(null)
      return
    }
    if (tool === 'estado') return setSel({ type: 'state', id: s.id })
    setSel({ type: 'state', id: s.id })
    const p = point(e)
    drag.current = { id: s.id, ox: p.x - s.x, oy: p.y - s.y, moved: false }
    svgRef.current.setPointerCapture(e.pointerId)
  }
  const onEdge = (e, key) => {
    e.stopPropagation()
    hist.current.tag = null
    if (tool === 'borrar') return delEdge(key)
    setSel({ type: 'edge', id: key })
    setPending(null)
  }
  const onMove = (e) => {
    if (drag.current) {
      const p = point(e)
      const { id, ox, oy } = drag.current
      if (!drag.current.moved) { drag.current.moved = true; record() }
      setStates((ss) => ss.map((s) => (s.id === id ? { ...s, x: Math.round(clamp(p.x - ox, 70, W - 40)), y: Math.round(clamp(p.y - oy, 90, H - 40)) } : s)))
    } else if (pending) setCursor(point(e))
  }
  const onUp = () => { drag.current = null }
  const onPanelKey = (e) => {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const k = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() } else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo() } else if (k === 'escape') { setPending(null); setSel(null); setRenaming(null) } else if ((k === 'delete' || k === 'backspace') && sel) {
      e.preventDefault()
      sel.type === 'state' ? delState(sel.id) : delEdge(sel.id)
    }
  }

  // ------------------------------------------------------------ simulación y validación
  // el visor del autómata registrado simula contra el dibujo REGISTRADO (no contra lo que se esté editando)
  const regRunner = useCallback(async (w) => {
    if (!reg) return { ok: false, errors: ['Registra primero tu autómata.'] }
    const r = await handSimulate(reg.payload, w)
    return r.ok ? r : { ...r, errors: (r.errors || []).map((x) => x.message || String(x)) }
  }, [reg])

  const runCheck = async () => {
    setBusy('check')
    setMsgs([])
    try {
      const r = await handCheck(payload, languageText)
      if (!r.ok) { setMsgs(r.errors.map((x) => x.message)); setCheck(null) } else {
        setCheck(r)
        setReg({ sig: fullSig, payload, view: r.view, spec: { alphabet: alphabetText, language: languageText }, n: (reg?.n || 0) + 1 })
        setRequest(null)
        setVtab('automata')
        setTimeout(() => viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
      }
    } catch (e) {
      setMsgs([e.message])
    }
    setBusy(null)
  }

  // ------------------------------------------------------------ teclas para escribir transiciones
  const alpha = alphabetSymbols(alphabetText)
  const insert = (txt) => {
    if (sel?.type !== 'edge') return
    const e = edges.find((x) => ekey(x) === sel.id)
    const el = ta.current
    const cur = e.lines.join('\n')
    const a = el ? el.selectionStart : cur.length
    const z = el ? el.selectionEnd : a
    caretAfter.current = a + txt.length
    setLines(sel.id, cur.slice(0, a) + txt + cur.slice(z))
  }
  useEffect(() => {
    const c = caretAfter.current
    if (c == null || !ta.current) return
    caretAfter.current = null
    ta.current.focus()
    ta.current.setSelectionRange(c, c)
  })

  const selEdge = sel?.type === 'edge' ? edges.find((e) => ekey(e) === sel.id) : null
  const h = hist.current

  // ------------------------------------------------------------ dibujo
  const nodeStroke = (s) => {
    return sel?.type === 'state' && sel.id === s.id ? C.sel : pending === s.id ? C.sel : C.base
  }
  const edgeColor = (k) => {
    if (badEdges.has(k)) return C.bad
    return sel?.type === 'edge' && sel.id === k ? C.sel : C.base
  }
  const marker = (col) => `url(#ah-${col.slice(1)})`
  const hint = notice || (tool === 'flecha' && pending ? `Origen: ${pending}. Ahora haz clic en el estado destino.` : HINTS[tool])
  const status = check ? (check.all_ok ? ['ok', '✓ Registrado y correcto'] : ['bad', '✗ Registrado con errores']) : ['none', reg ? '⚠ Cambiaste algo: vuelve a registrar' : 'Sin registrar']
  const noSpec = !spec || !alphabetText.trim() || !languageText.trim()

  return (
    <section className="glass space-y-5 p-4 outline-none sm:p-5" aria-label="Dibujar el autómata a mano" data-testid="hand-panel" onKeyDown={onPanelKey}>
      <div>
        <h2 className="text-xl font-bold">Dibuja tu autómata de pila</h2>
        <p className="text-xs text-white/50">Crea estados y flechas, escribe cada transición con la notación de la plataforma, regístralo y valídalo contra el lenguaje de la izquierda.</p>
      </div>

      <Step n="1">Tu autómata</Step>

      {/* barra de herramientas */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-black/40 p-1.5" role="toolbar" aria-label="Herramientas de dibujo">
          {TOOLS.map(([id, name]) => (
            <button key={id} type="button" aria-pressed={tool === id} aria-label={name} title={name} data-testid={`tool-${id}`}
              onClick={() => { setTool(id); setPending(null); setRenaming(null) }}
              className={`grid h-11 w-11 place-items-center rounded-xl transition ${tool === id ? 'bg-cyan-400/25 text-cyan-200 ring-1 ring-cyan-300/40' : 'text-white/80 hover:bg-white/10'}`}>{ICONS[id]}</button>
          ))}
        </div>
        <div className="flex gap-1 rounded-2xl bg-black/40 p-1.5" role="group" aria-label="Historial">
          <button type="button" onClick={undo} disabled={!h.past.length} aria-label="Deshacer" title="Deshacer (Ctrl+Z)" data-testid="undo" className="grid h-11 w-11 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 disabled:opacity-30">{ICONS.undo}</button>
          <button type="button" onClick={redo} disabled={!h.future.length} aria-label="Rehacer" title="Rehacer (Ctrl+Y)" data-testid="redo" className="grid h-11 w-11 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 disabled:opacity-30">{ICONS.redo}</button>
        </div>
        <button type="button" onClick={arrange} disabled={!states.length} className="btn-ghost px-4 py-2.5 text-sm" data-testid="arrange" title="Acomoda los estados en columnas desde el inicial">Ordenar estados</button>
        <span className="text-sm text-white/45" data-testid="state-count">{states.length} de {MAX_STATES} estados</span>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70" data-testid="hand-hint" role="status">{hint}</div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0712] outline-none" tabIndex={0}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ touchAction: 'none', cursor: tool === 'estado' ? 'crosshair' : tool === 'borrar' ? 'not-allowed' : tool === 'mover' ? 'default' : 'pointer' }}
          data-testid="hand-canvas" onPointerDown={onBg} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <pattern id="hand-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="rgba(255,255,255,.07)" /></pattern>
            {[C.base, C.sel, C.bad, C.ok].map((col) => (
              <marker key={col} id={`ah-${col.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={col} /></marker>
            ))}
          </defs>
          <rect width={W} height={H} fill="url(#hand-dots)" />

          {states.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="rgba(255,255,255,.3)" fontSize="20">Elige el círculo ⭕ de la barra y haz clic aquí para crear tu primer estado</text>
          )}

          {/* flechas */}
          {edges.map((e) => {
            const k = ekey(e)
            const g = geom(e, byId, !(e.from === e.to) && revSet.has(`${e.to}->${e.from}`))
            if (!g) return null
            const col = edgeColor(k)
            const shown = e.lines.filter((l) => l.trim())
            const lines = shown.length ? shown.slice(0, 4).concat(shown.length > 4 ? ['…'] : []) : ['¿transición?']
            const w = Math.max(...lines.map((l) => l.length)) * 7.4 + 14
            const hh = lines.length * 15 + 8
            return (
              <g key={k} data-testid={`edge-${k}`}>
                <path d={g.d} fill="none" stroke="transparent" strokeWidth="18" style={{ cursor: 'pointer' }} onPointerDown={(ev) => onEdge(ev, k)} />
                <path d={g.d} fill="none" stroke={col} strokeWidth={sel?.type === 'edge' && sel.id === k ? 3.2 : 2.2} markerEnd={marker(col)} pointerEvents="none" />
                <g onPointerDown={(ev) => onEdge(ev, k)} style={{ cursor: 'pointer' }}>
                  <rect x={g.lx - w / 2} y={g.ly - hh / 2} width={w} height={hh} rx="7" fill={C.label} stroke={col} strokeWidth="1.4" opacity="0.96" />
                  {lines.map((l, i) => (
                    <text key={i} x={g.lx} y={g.ly - hh / 2 + 15 + i * 15} textAnchor="middle" fontSize="12" fontFamily="'JetBrains Mono', ui-monospace, monospace" fill={shown.length ? '#fff' : 'rgba(255,255,255,.4)'}>{l}</text>
                  ))}
                </g>
              </g>
            )
          })}

          {/* flecha en curso */}
          {pending && cursor && byId[pending] && (
            <line x1={byId[pending].x} y1={byId[pending].y} x2={cursor.x} y2={cursor.y} stroke={C.sel} strokeWidth="2" strokeDasharray="6 5" pointerEvents="none" />
          )}

          {/* estados */}
          {states.map((s) => {
            const col = nodeStroke(s)
            return (
              <g key={s.id} data-testid={`state-${s.id}`} onPointerDown={(e) => onState(e, s)} onDoubleClick={() => { setTool('renombrar'); setRenaming(s.id) }} style={{ cursor: tool === 'mover' ? 'grab' : 'pointer' }}>
                {s.initial && (
                  <>
                    <line x1={s.x - R - 48} y1={s.y} x2={s.x - R - 3} y2={s.y} stroke={C.sel} strokeWidth="2.4" markerEnd={marker(C.sel)} />
                    <text x={s.x - R - 50} y={s.y - 8} fontSize="11" fill="rgba(255,255,255,.45)" textAnchor="middle">inicio</text>
                  </>
                )}
                {sel?.type === 'state' && sel.id === s.id ? <circle cx={s.x} cy={s.y} r={R + 6} fill={col} opacity=".13" /> : null}
                <circle cx={s.x} cy={s.y} r={R} fill={C.fill} stroke={col} strokeWidth="2.6" />
                {s.final && <circle cx={s.x} cy={s.y} r={R - 6} fill="none" stroke={col} strokeWidth="2" />}
                {renaming !== s.id && <text x={s.x} y={s.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="'JetBrains Mono', ui-monospace, monospace" fill="#fff" pointerEvents="none">{s.id}</text>}
              </g>
            )
          })}

          {/* renombrar: cuadro de texto sobre el estado */}
          {renaming && byId[renaming] && (
            <foreignObject x={byId[renaming].x - 44} y={byId[renaming].y - 17} width="88" height="34" onPointerDown={(e) => e.stopPropagation()}>
              <input autoFocus defaultValue={renaming} maxLength={8} aria-label="Nuevo nombre del estado" data-testid="rename-input" onFocus={(e) => e.target.select()}
                onBlur={(e) => commitRename(renaming, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = renaming; e.currentTarget.blur() } }}
                style={{ width: '100%', height: '100%', boxSizing: 'border-box', textAlign: 'center', font: '700 15px ui-monospace, monospace', color: '#fff', background: '#0a0712', border: '2px solid #2de2c4', borderRadius: 10, outline: 'none' }} />
            </foreignObject>
          )}
        </svg>
      </div>

      {/* transiciones de la flecha seleccionada */}
      {selEdge && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4" data-testid="hand-props">
          <h4 className="font-semibold">Transiciones de <span className="sym rounded-md bg-white/10 px-1.5">{selEdge.from}</span> → <span className="sym rounded-md bg-white/10 px-1.5">{selEdge.to}</span></h4>
          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Símbolos para las transiciones">
            {[...BASE_KEYS, ...alpha].map((k) => (
              <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)} title={`Insertar ${k.trim()}`}
                className="sym min-w-8 rounded-lg bg-white/8 px-2 py-1 text-sm hover:bg-white/16">{k.trim() || k}</button>
            ))}
          </div>
          <textarea ref={ta} rows={Math.max(2, selEdge.lines.length + 1)} spellCheck={false} data-testid="edge-text" aria-label="Transiciones (una por línea)"
            className="field sym w-full resize-y text-base" value={selEdge.lines.join('\n')} placeholder={'0, X₀, X₀X\n0, X, XX'} onChange={(e) => setLines(ekey(selEdge), e.target.value)} />
          <ul className="space-y-1 text-sm">
            {selEdge.lines.map((l, i) => l.trim() && (
              errAt[`${ekey(selEdge)}#${i}`]
                ? <li key={i} className="text-rose-300">✗ <span className="sym">{l}</span> — {errAt[`${ekey(selEdge)}#${i}`]}</li>
                : parsedAt[`${ekey(selEdge)}#${i}`] ? <li key={i} className="text-emerald-300">✓ <span className="sym">{parsedAt[`${ekey(selEdge)}#${i}`]}</span></li> : null
            ))}
          </ul>
          <p className="text-xs text-white/40">Una transición por línea. Con varias pilas, separa las partes con « ; » y repite lo leído en cada una: <span className="sym">X, 1, ε ; Y₀, 1, Y₀</span> (en cada pila se escribe su tope; si no haces nada en una pila, la dejas igual).</p>
        </div>
      )}
      {generalErrors.length > 0 && states.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-200" data-testid="hand-general">{generalErrors.map((e, i) => <li key={i}>⚠ {e.message}</li>)}</ul>
      )}

      <details className="rounded-xl bg-white/5 p-3 text-sm text-white/60">
        <summary className="cursor-pointer font-semibold text-white/80">¿Cómo se escribe una transición?</summary>
        <div className="mt-2 space-y-1.5 text-xs leading-relaxed">
          <p>Cada parte es <span className="sym text-cyan-100">leído, tope, apila</span>: lo que se lee de la cadena, lo que hay arriba de la pila y lo que queda en su lugar (el primero será el nuevo tope).</p>
          <p><span className="sym text-cyan-100">X₀X ; Y₀Y</span> primera transición: declara las pilas (no lee nada) · <span className="sym text-cyan-100">0, X₀, X₀X</span> apila la primera X sobre el fondo · <span className="sym text-cyan-100">0, X, XX</span> apila otra encima · <span className="sym text-cyan-100">1, X, ε</span> desapila una X · <span className="sym text-cyan-100">ϕ, X₀, X₀</span> no hace nada en esa pila (típico al llegar al estado final). El fondo X₀ es el nombre de la pila: nunca se apila ni se desapila. Se acepta con la entrada terminada, en estado final y cada pila reducida a su fondo; solo necesitas un rizo que desapile X en el estado final si ahí aún pueden quedar contadores.</p>
          <p><b>ϕ</b> = fin de la entrada · <b>ε</b> = desapilar · <b>λ</b> = no lee · <b>∅</b> = la pila todavía no existe. Se acepta al terminar la cadena, en un estado final y con cada pila reducida a su fondo (sin contadores).</p>
        </div>
      </details>

      <div className="border-t border-white/10 pt-5" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Step n="2">Registrar y validar</Step>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status[0] === 'ok' ? 'bg-emerald-400/15 text-emerald-200' : status[0] === 'bad' ? 'bg-rose-500/15 text-rose-200' : 'bg-white/8 text-white/50'}`} data-testid="hand-status">{status[1]}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={runCheck} disabled={!!busy || !states.length || noSpec} className="btn-primary min-w-0 flex-1 px-6 py-3" data-testid="hand-validate"
          title="Prueba tu autómata con todas las cadenas cortas del alfabeto y varias palabras largas del lenguaje de la izquierda">
          {busy === 'check' ? 'Validando…' : '✔ Registrar y validar mi autómata'}
        </button>
        <button type="button" onClick={clearAll} className="btn-ghost px-5 py-3" data-testid="hand-clear">Limpiar</button>
      </div>
      {noSpec && <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="hand-nospec">Primero registra los parámetros (alfabeto y lenguaje) con el botón «Registrar parámetros» de la izquierda.</p>}
      <p className="text-xs leading-relaxed text-white/40">El alfabeto y el lenguaje son los registrados a la izquierda. Se acepta una cadena si se lee completa (ϕ), se termina en un estado final y cada pila queda reducida a su fondo (sin contadores).</p>

      {msgs.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert" data-testid="hand-errors">{msgs.map((m, i) => <li key={i}>✗ {m}</li>)}</ul>
      )}

      {check && <Report r={check} onSim={(w) => { setVtab('automata'); setRequest({ word: w, n: Date.now() }); viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />}

      {/* el autómata registrado: diagrama con sus pilas, simulación, tabla de transición y definición formal */}
      {reg && (
        <div className="space-y-4 border-t border-white/10 pt-5" ref={viewer} data-testid="hand-viewer">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Step n="3">Tu autómata registrado</Step>
            {reg.sig !== fullSig && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-200" data-testid="hand-stale">⚠ Cambiaste el dibujo: vuelve a registrar para actualizar</span>}
          </div>
          <nav className="flex flex-wrap gap-1.5" role="tablist">
            {[['automata', 'Autómata'], ['tabla', 'Tabla de transición'], ['formal', 'Definición formal']].map(([id, name]) => (
              <button key={id} type="button" role="tab" aria-selected={vtab === id} data-testid={`htab-${id}`} onClick={() => setVtab(id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${vtab === id ? 'btn-primary' : 'btn-ghost'}`}>{name}</button>
            ))}
          </nav>
          <div hidden={vtab !== 'automata'}>
            <AutomatonPanel key={reg.n} result={reg.view} spec={reg.spec} resetSignal={reg.n} runner={regRunner} staticView request={request} />
          </div>
          {vtab === 'tabla' && <TablePanel result={reg.view} hand />}
          {vtab === 'formal' && <FormalPanel result={reg.view} hand />}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- informe de la validación
function Report({ r, onSim }) {
  const nothing = !r.missed_total && !r.extra_total
  const errs = (r.diagnostics || []).filter((d) => d.level === 'error')
  const warns = (r.diagnostics || []).filter((d) => d.level !== 'error')
  const Row = ({ word, children }) => (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-black/25 px-3 py-2.5">
      <code className="sym rounded-md bg-white/10 px-2 py-0.5 text-sm text-cyan-100">{word || 'ε (vacía)'}</code>
      <div className="min-w-0 flex-1 text-sm text-white/75">{children}</div>
      <button type="button" onClick={() => onSim(word)} className="rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white">▶ simular</button>
    </li>
  )
  return (
    <div className="space-y-3" data-testid="hand-results">
      {r.all_ok ? (
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-3 text-emerald-100" role="status" data-testid="report-ok">
          <div className="text-lg font-bold">🎉 ¡Tu autómata es correcto!</div>
          <p className="mt-1 text-sm">Aceptó las {r.accepted_members} palabras del lenguaje que se probaron (todas las de hasta {r.max_len} símbolos y {r.long_tested} más largas) y rechazó las otras {r.rejected_nonmembers} cadenas que no pertenecen al lenguaje.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-100" role="status" data-testid="report-bad">
          <div className="text-lg font-bold">Tu autómata todavía no es correcto</div>
          <p className="mt-1 text-sm">
            {r.missed_total > 0 && <>Rechaza {r.truncated ? 'al menos ' : ''}{r.missed_total} palabra{r.missed_total === 1 ? '' : 's'} que sí {r.missed_total === 1 ? 'es' : 'son'} del lenguaje. </>}
            {r.extra_total > 0 && <>Acepta {r.truncated ? 'al menos ' : ''}{r.extra_total} cadena{r.extra_total === 1 ? '' : 's'} que no {r.extra_total === 1 ? 'es' : 'son'} del lenguaje. </>}
            {nothing && r.truncated && <>Se probaron {r.tested} de {r.total} cadenas sin errores, pero se acabó el tiempo de la validación. </>}
            Se probaron {r.tested} cadenas (todas las de hasta {r.max_len} símbolos y palabras más largas del lenguaje).
          </p>
        </div>
      )}

      {errs.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-rose-400/30 bg-rose-500/8 p-3 text-sm text-rose-100" data-testid="report-diag">
          <li className="text-xs font-semibold uppercase tracking-wide text-rose-200/80">Problemas del dibujo</li>
          {errs.map((d, i) => <li key={i}>✗ {d.message}</li>)}
        </ul>
      )}
      {warns.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-300/30 bg-amber-400/8 p-3 text-sm text-amber-100">
          <li className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Avisos</li>
          {warns.map((d, i) => <li key={i}>⚠ {d.message}</li>)}
        </ul>
      )}

      {r.missed?.length > 0 && (
        <div className="space-y-2" data-testid="report-missed">
          <h4 className="text-sm font-semibold">Palabras del lenguaje que tu autómata RECHAZA <span className="text-white/45">({r.missed_total}{r.missed.length < r.missed_total ? `, se muestran las ${r.missed.length} más cortas` : ''})</span></h4>
          <ul className="space-y-1.5">
            {r.missed.map((m) => (
              <Row key={m.word} word={m.word}>
                {Object.keys(m.values || {}).length > 0 && <span className="text-emerald-200">Sí pertenece ({valsText(m.values)}). </span>}
                {m.reason}
              </Row>
            ))}
          </ul>
        </div>
      )}
      {r.extra?.length > 0 && (
        <div className="space-y-2" data-testid="report-extra">
          <h4 className="text-sm font-semibold">Cadenas que tu autómata ACEPTA y no son del lenguaje <span className="text-white/45">({r.extra_total}{r.extra.length < r.extra_total ? `, se muestran las ${r.extra.length} más cortas` : ''})</span></h4>
          <ul className="space-y-1.5">
            {r.extra.map((m) => <Row key={m.word} word={m.word}>{m.why}</Row>)}
          </ul>
        </div>
      )}
    </div>
  )
}
