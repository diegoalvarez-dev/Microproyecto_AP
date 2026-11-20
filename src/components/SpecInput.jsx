import { useEffect, useRef, useState } from 'react'
import { PRESETS, builderToText, pretty, suggestions } from '../lib/spec.js'
import { validate } from '../services/api.js'

const VARS = ['n', 'm', 'k', 'p', 'q', 'r']

function BuilderForm({ b, setB }) {
  const upd = (patch) => setB({ ...b, ...patch })
  const setBlock = (i, patch) => upd({ blocks: b.blocks.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const addBlock = () => {
    const used = b.blocks.map((x) => x.v)
    upd({ blocks: [...b.blocks, { sym: '', v: VARS.find((v) => !used.includes(v)) || 'p' }] })
  }
  const delBlock = (i) => upd({ blocks: b.blocks.filter((_, j) => j !== i), group: null })
  const g = b.group
  const sugg = suggestions(b).filter((s) => !b.cons.includes(s))

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">Bloques de la cadena</div>
        <div className="flex flex-wrap items-center gap-2">
          {b.blocks.map((x, i) => (
            <div key={i} className="flex items-center gap-1 rounded-xl bg-white/6 py-1 pl-2 pr-1">
              <input aria-label={`Símbolo del bloque ${i + 1}`} className="field sym w-10 text-center !px-1" maxLength={1} value={x.sym} onChange={(e) => setBlock(i, { sym: e.target.value.slice(-1) })} />
              <span className="text-white/40">^</span>
              <input aria-label={`Variable del bloque ${i + 1}`} className="field sym w-12 text-center !px-1" maxLength={2} value={x.v} onChange={(e) => setBlock(i, { v: e.target.value.trim() })} />
              <button type="button" aria-label="Quitar bloque" onClick={() => delBlock(i)} className="px-1.5 text-white/40 hover:text-rose-300">×</button>
            </div>
          ))}
          <button type="button" onClick={addBlock} className="btn-ghost px-3 py-2 text-sm">+ bloque</button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/15 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!g} onChange={(e) => upd({ group: e.target.checked ? { from: 0, to: Math.max(0, b.blocks.length - 1), v: 'k' } : null })} />
          Repetir un grupo de bloques, como (0ⁿ1ᵐ)ᵏ
        </label>
        {g && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/70">
            desde el bloque
            <select className="field" value={g.from} onChange={(e) => upd({ group: { ...g, from: +e.target.value } })}>
              {b.blocks.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
            </select>
            hasta el
            <select className="field" value={g.to} onChange={(e) => upd({ group: { ...g, to: +e.target.value } })}>
              {b.blocks.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
            </select>
            veces
            <input aria-label="Variable de repeticiones" className="field sym w-14 text-center" maxLength={2} value={g.v} onChange={(e) => upd({ group: { ...g, v: e.target.value.trim() } })} />
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">Restricciones</div>
        <div className="space-y-2">
          {b.cons.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Restricción ${i + 1}`} className="field sym flex-1" value={c} placeholder="n>0" onChange={(e) => upd({ cons: b.cons.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Quitar restricción" onClick={() => upd({ cons: b.cons.filter((_, j) => j !== i) })} className="btn-ghost px-3">×</button>
            </div>
          ))}
          <button type="button" onClick={() => upd({ cons: [...b.cons, ''] })} className="btn-ghost px-3 py-2 text-sm">+ restricción</button>
        </div>
        {sugg.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-white/40">Sugeridas:</span>
            {sugg.map((s) => (
              <button key={s} type="button" onClick={() => upd({ cons: [...b.cons.filter((c) => c.trim()), s] })} className="sym rounded-lg bg-white/6 px-2 py-1 text-xs hover:bg-white/14">{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const GADGETS = { range: 'cota', mod: 'paridad / módulo', cmp: 'comparación', scale: 'proporción', sum: 'suma', trivial: 'siempre cierta' }
// Botones para escribir a mano: los exponentes se insertan como superíndices reales.
const KEYS = [
  ['ⁿ', 'Exponente n'], ['ᵐ', 'Exponente m'], ['ᵏ', 'Exponente k'], ['ⁱ', 'Exponente i'], ['ʲ', 'Exponente j'], ['ᵖ', 'Exponente p'],
  ['^', 'Exponente con ^ (0^n, 1^{ab})'], ['( )', 'Grupo que se repite: (0ⁿ1ᵐ)ᵏ'], ['|', 'Separa el patrón de las restricciones'],
  ['≥', 'Mayor o igual'], ['≤', 'Menor o igual'], [' par', 'Par'], [' impar', 'Impar'], [', ', 'Otra restricción'],
]

function Understood({ live, busy }) {
  if (!live) return <div className="text-xs text-white/35">{busy ? 'Interpretando…' : ''}</div>
  if (live.errors?.length)
    return (
      <ul className="space-y-1 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert" data-testid="live-errors">
        {live.errors.map((e, i) => <li key={i}>✗ {e}</li>)}
      </ul>
    )
  return (
    <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/8 p-3 text-sm" data-testid="understood">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Así entendió el sistema tu lenguaje</div>
      <div className="sym text-base text-emerald-50">
        L = {'{'} {pretty(live.pattern)}{live.constraints.length ? ' | ' : ''}{live.constraints.map((c) => c.text).join(', ')} {'}'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="text-white/45">Variables:</span>
        {live.variables.map((v) => <span key={v} className="sym rounded-md bg-white/10 px-1.5 py-0.5">{v}</span>)}
        {live.constraints.length > 0 && <span className="ml-2 text-white/45">Restricciones:</span>}
        {live.constraints.map((c, i) => (
          <span key={i} className="rounded-md bg-white/8 px-1.5 py-0.5 text-white/75"><span className="sym text-white">{c.text}</span> · {GADGETS[c.gadget] || c.gadget}</span>
        ))}
      </div>
    </div>
  )
}

export default function SpecInput({ spec, setSpec, onBuild, loading, result }) {
  const [mode, setMode] = useState(spec.mode || 'constructor')
  const [live, setLive] = useState(null)
  const [busy, setBusy] = useState(false)
  const ta = useRef(null)
  const caretAfter = useRef(null) // posición del cursor que hay que restaurar tras insertar un símbolo
  const setB = (builder) => setSpec({ ...spec, builder, language: builderToText(builder) })
  const warnings = live?.warnings?.length ? live.warnings : result?.warnings || []

  // interpreta lo que se va escribiendo (con un pequeño retraso) para mostrar cómo lo entendió el sistema
  useEffect(() => {
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await validate(spec.alphabet, spec.language)
        if (alive) setLive(r)
      } catch {
        if (alive) setLive(null)
      }
      if (alive) setBusy(false)
    }, 450)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [spec.alphabet, spec.language])

  const insert = (txt) => {
    const el = ta.current
    const a = el ? el.selectionStart : spec.language.length
    const b = el ? el.selectionEnd : a
    let text = txt
    let caret = a + txt.length
    if (txt === '( )') {
      text = '()'
      caret = a + 1
    }
    caretAfter.current = caret
    setSpec({ ...spec, language: spec.language.slice(0, a) + text + spec.language.slice(b) })
  }

  // justo después de renderizar el texto nuevo, el cursor queda a continuación del símbolo insertado
  useEffect(() => {
    const c = caretAfter.current
    if (c == null || !ta.current) return
    caretAfter.current = null
    ta.current.focus()
    ta.current.setSelectionRange(c, c)
  })

  return (
    <section className="glass p-5 sm:p-6" aria-labelledby="h-entrada">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-entrada" className="text-lg font-bold">1 · Datos de entrada</h2>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => setSpec({ ...spec, alphabet: p.alphabet, language: p.language, builder: p.builder })} className="btn-ghost px-3 py-1.5 text-xs">{p.name}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,15rem)_1fr]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Alfabeto Σ</span>
          <input aria-label="Alfabeto" className="field sym w-full" value={spec.alphabet} placeholder="{0, 1, 2}" onChange={(e) => setSpec({ ...spec, alphabet: e.target.value })} />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Lenguaje L</span>
            <div className="flex rounded-xl bg-white/8 p-1" role="group" aria-label="Modo de entrada">
              {[['constructor', 'Constructor'], ['texto', 'Escribir a mano']].map(([m, name]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setSpec({ ...spec, mode: m }) }} className={`rounded-lg px-3 py-1 text-xs font-semibold ${mode === m ? 'bg-white/20' : 'text-white/55'}`}>{name}</button>
              ))}
            </div>
          </div>
          {mode === 'constructor' && <BuilderForm b={spec.builder} setB={setB} />}

          <div className="mt-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-1" role="toolbar" aria-label="Símbolos para escribir el lenguaje">
              <span className="mr-1 text-xs text-white/45">Insertar:</span>
              {KEYS.map(([k, tip]) => (
                <button key={k} type="button" title={tip} aria-label={tip} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)} className="sym min-w-8 rounded-lg bg-white/8 px-2 py-1 text-sm hover:bg-white/16">{k.trim() || k}</button>
              ))}
            </div>
            <textarea
              ref={ta}
              aria-label="Lenguaje"
              data-testid="language-input"
              rows={mode === 'texto' ? 3 : 2}
              spellCheck={false}
              className="field sym w-full resize-y text-base"
              value={spec.language}
              placeholder="0ⁿ 1ᵐ 2ᵏ | n>0 par, m>n par, k=m/2"
              onChange={(e) => setSpec({ ...spec, language: e.target.value })}
            />
            <p className="mt-1 text-xs text-white/40">
              Escríbelo como quieras: <span className="sym">0^n 1^m</span> o <span className="sym">0ⁿ1ᵐ</span>; restricciones separadas por coma, «y» o «;»;
              también entiende frases como «n mayor que 0», «m igual al doble de n», «k es la mitad de m».
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4"><Understood live={live} busy={busy} /></div>
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          {warnings.map((e, i) => <li key={i}>⚠ {e}</li>)}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBuild} disabled={loading || !!live?.errors?.length} className="btn-primary px-6 py-3" data-testid="build-btn">
          {loading ? 'Construyendo…' : 'Construir autómata'}
        </button>
        {result?.ok && <span className="text-sm text-emerald-300">✓ {result.automaton.counts.stacks} pila{result.automaton.counts.stacks === 1 ? '' : 's'} · {result.automaton.counts.states} estados · {result.automaton.counts.transitions} transiciones</span>}
      </div>
    </section>
  )
}
