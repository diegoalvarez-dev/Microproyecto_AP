import { useEffect, useRef, useState } from 'react'
import { EMPTY_BUILDER, PRESETS, builderToText, pretty, suggestions, textToBuilder } from '../lib/spec.js'
import { validate } from '../services/api.js'

const VARS = ['n', 'm', 'k', 'p', 'q', 'r']
const GADGETS = { range: 'cota', mod: 'paridad / módulo', cmp: 'comparación', scale: 'proporción', sum: 'suma', trivial: 'siempre cierta' }

// Teclados: [texto que se inserta, ayuda]. Las palabras llevan espacios a los lados.
const OPS = [['+', 'Suma'], ['−', 'Resta'], ['×', 'Multiplicación'], ['÷', 'División'], ['=', 'Igual'], ['<', 'Menor'], ['>', 'Mayor'], ['≤', 'Menor o igual'], ['≥', 'Mayor o igual']]
const WORDS = [[' par ', 'Par'], [' impar ', 'Impar'], [' mod ', 'Módulo: n mod 3 = 1'], [' y ', 'Separa dos restricciones']]
const EXPS = [['ⁿ', 'Exponente n'], ['ᵐ', 'Exponente m'], ['ᵏ', 'Exponente k'], ['ⁱ', 'Exponente i'], ['ʲ', 'Exponente j'], ['ᵖ', 'Exponente p'], ['^', 'Exponente con ^  (0^n)']]
const STRUCT = [['( )', 'Grupo que se repite: (0ⁿ1ᵐ)ᵏ'], ['|', 'Separa el patrón de las restricciones'], [', ', 'Otra restricción']]

function Keys({ title, keys, onKey, wide }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`${wide ? 'w-24' : 'w-20'} shrink-0 text-[11px] uppercase tracking-wide text-white/40`}>{title}</span>
      {keys.map(([k, tip]) => (
        <button key={k} type="button" title={tip} aria-label={tip} onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(k)}
          className="sym min-w-8 rounded-lg bg-white/8 px-2 py-1 text-sm hover:bg-white/16">{k.trim() || k}</button>
      ))}
    </div>
  )
}

function Section({ title, children, aside }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function BuilderForm({ b, setB }) {
  const [focus, setFocus] = useState(null)
  const inputs = useRef([])
  const caret = useRef(null)
  const upd = (patch) => setB({ ...b, ...patch })
  const setBlock = (i, patch) => upd({ blocks: b.blocks.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const addBlock = () => {
    const used = b.blocks.map((x) => x.v)
    upd({ blocks: [...b.blocks, { sym: '', v: VARS.find((v) => !used.includes(v)) || 'p' }] })
  }
  const delBlock = (i) => upd({ blocks: b.blocks.filter((_, j) => j !== i), group: null })
  const g = b.group
  const sugg = suggestions(b).filter((s) => !b.cons.includes(s))

  // inserta un símbolo en la restricción donde estaba el cursor
  const insert = (txt) => {
    if (!b.cons.length) {
      upd({ cons: [txt.trim()] })
      return
    }
    const i = focus != null && focus < b.cons.length ? focus : b.cons.length - 1
    const el = inputs.current[i]
    const cur = b.cons[i]
    const a = el ? el.selectionStart : cur.length
    const z = el ? el.selectionEnd : a
    const text = txt === '( )' ? '()' : txt
    caret.current = { i, pos: a + (txt === '( )' ? 1 : text.length) }
    upd({ cons: b.cons.map((c, j) => (j === i ? cur.slice(0, a) + text + cur.slice(z) : c)) })
  }
  useEffect(() => {
    const c = caret.current
    if (!c || !inputs.current[c.i]) return
    caret.current = null
    inputs.current[c.i].focus()
    inputs.current[c.i].setSelectionRange(c.pos, c.pos)
  })

  return (
    <div className="space-y-5">
      <Section title="Bloques de la cadena" aside={<span className="text-[11px] text-white/35">símbolo ^ variable</span>}>
        <div className="space-y-2">
          {b.blocks.map((x, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 p-1.5 pl-3">
              <span className="w-12 text-xs text-white/40">Bloque {i + 1}</span>
              <input aria-label={`Símbolo del bloque ${i + 1}`} className="field sym w-12 text-center !px-1" maxLength={1} value={x.sym} onChange={(e) => setBlock(i, { sym: e.target.value.slice(-1) })} />
              <span className="text-white/40">^</span>
              <input aria-label={`Variable del bloque ${i + 1}`} className="field sym w-14 text-center !px-1" maxLength={2} value={x.v} onChange={(e) => setBlock(i, { v: e.target.value.trim() })} />
              <button type="button" aria-label="Quitar bloque" onClick={() => delBlock(i)} className="ml-auto rounded-lg px-2.5 py-1.5 text-white/40 hover:bg-white/10 hover:text-rose-300">✕</button>
            </div>
          ))}
          <button type="button" onClick={addBlock} className="btn-ghost px-3 py-1.5 text-sm">+ Agregar bloque</button>
        </div>
      </Section>

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

      <Section title="Restricciones">
        <div className="space-y-2">
          {b.cons.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Restricción ${i + 1}`} ref={(el) => { inputs.current[i] = el }} className="field sym min-w-0 flex-1" value={c} placeholder="n>0   k=m/2   k=n+m"
                onFocus={() => setFocus(i)} onChange={(e) => upd({ cons: b.cons.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Quitar restricción" onClick={() => upd({ cons: b.cons.filter((_, j) => j !== i) })} className="btn-ghost px-3">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => upd({ cons: [...b.cons, ''] })} className="btn-ghost px-3 py-1.5 text-sm">+ Agregar restricción</button>
        </div>
        <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/15 p-2.5" role="toolbar" aria-label="Símbolos para las restricciones">
          <Keys title="Operaciones" keys={OPS} onKey={insert} />
          <Keys title="Palabras" keys={WORDS} onKey={insert} />
        </div>
        {sugg.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-white/40">Sugeridas:</span>
            {sugg.map((s) => (
              <button key={s} type="button" onClick={() => upd({ cons: [...b.cons.filter((c) => c.trim()), s] })} className="sym rounded-lg bg-white/6 px-2 py-1 text-xs hover:bg-white/14">{s}</button>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

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
      <div className="sym break-words text-base text-emerald-50">
        L = {'{'} {pretty(live.pattern)}{live.constraints.length ? ' | ' : ''}{live.constraints.map((c) => c.text).join(', ')} {'}'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="text-white/45">Variables:</span>
        {live.variables.map((v) => <span key={v} className="sym rounded-md bg-white/10 px-1.5 py-0.5">{v}</span>)}
      </div>
      {live.constraints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {live.constraints.map((c, i) => (
            <span key={i} className="rounded-md bg-white/8 px-1.5 py-0.5 text-white/75"><span className="sym text-white">{c.text}</span> · {GADGETS[c.gadget] || c.gadget}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SpecInput({ spec, setSpec, onBuild, onClear, loading, result }) {
  const [mode, setMode] = useState(spec.mode || 'constructor')
  const [live, setLive] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const ta = useRef(null)
  const caretAfter = useRef(null)
  const setB = (builder) => setSpec({ ...spec, builder, language: builderToText(builder) })
  const warnings = live?.warnings?.length ? live.warnings : result?.warnings || []

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

  const switchMode = (m) => {
    setMode(m)
    setNotice('')
    if (m === 'constructor' && spec.language.trim()) {
      const parsed = textToBuilder(spec.language)
      if (parsed) setSpec({ ...spec, mode: m, builder: parsed })
      else {
        setSpec({ ...spec, mode: m })
        setNotice('El texto escrito a mano tiene una forma que el constructor no puede mostrar. Se muestran los bloques anteriores; si los editas, reemplazan el texto.')
      }
    } else setSpec({ ...spec, mode: m })
  }

  const clearAll = () => {
    setNotice('')
    setLive(null)
    setSpec({ alphabet: '', language: '', builder: EMPTY_BUILDER, mode })
    onClear?.()
  }

  const insert = (txt) => {
    const el = ta.current
    const a = el ? el.selectionStart : spec.language.length
    const b = el ? el.selectionEnd : a
    const text = txt === '( )' ? '()' : txt
    caretAfter.current = a + (txt === '( )' ? 1 : text.length)
    setSpec({ ...spec, language: spec.language.slice(0, a) + text + spec.language.slice(b) })
  }
  useEffect(() => {
    const c = caretAfter.current
    if (c == null || !ta.current) return
    caretAfter.current = null
    ta.current.focus()
    ta.current.setSelectionRange(c, c)
  })

  return (
    <section className="glass space-y-5 p-5" aria-labelledby="h-entrada">
      <div className="flex items-center justify-between gap-3">
        <h2 id="h-entrada" className="text-lg font-bold">Datos de entrada</h2>
        <button type="button" onClick={clearAll} className="btn-ghost px-3 py-1.5 text-xs" data-testid="clear-btn" title="Borra el alfabeto, los bloques, las restricciones y el autómata">🗑 Limpiar todo</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-white/40">Ejemplos:</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" onClick={() => { setNotice(''); setSpec({ ...spec, alphabet: p.alphabet, language: p.language, builder: p.builder }) }} className="btn-ghost px-2.5 py-1 text-xs">{p.name}</button>
        ))}
      </div>

      <Section title="Alfabeto Σ">
        <input aria-label="Alfabeto" className="field sym w-full" value={spec.alphabet} placeholder="{0, 1, 2}" onChange={(e) => setSpec({ ...spec, alphabet: e.target.value })} />
      </Section>

      <div>
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-white/8 p-1" role="tablist" aria-label="Modo de entrada">
          {[['constructor', 'Constructor'], ['texto', 'Escribir a mano']].map(([m, name]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} data-testid={`mode-${m}`} onClick={() => switchMode(m)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === m ? 'btn-primary !rounded-lg' : 'text-white/60 hover:text-white'}`}>{name}</button>
          ))}
        </div>
        {notice && <p className="mb-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-2.5 text-xs text-amber-100">{notice}</p>}

        {mode === 'constructor' ? (
          <>
            <BuilderForm b={spec.builder} setB={setB} />
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-2.5">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Texto generado</div>
              <div className="sym break-words text-sm text-white/80" data-testid="generated-text">{pretty(spec.language) || '—'}</div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/15 p-2.5" role="toolbar" aria-label="Símbolos para escribir el lenguaje">
              <Keys title="Exponentes" keys={EXPS} onKey={insert} wide />
              <Keys title="Operaciones" keys={OPS} onKey={insert} wide />
              <Keys title="Estructura" keys={STRUCT} onKey={insert} wide />
              <Keys title="Palabras" keys={WORDS} onKey={insert} wide />
            </div>
            <textarea ref={ta} aria-label="Lenguaje" data-testid="language-input" rows={4} spellCheck={false} className="field sym w-full resize-y text-base" value={spec.language}
              placeholder="0ⁿ 1ᵐ 2ᵏ | n>0 par, m>n par, k=m/2" onChange={(e) => setSpec({ ...spec, language: e.target.value })} />
            <p className="text-xs leading-relaxed text-white/40">
              Escríbelo como quieras: <span className="sym">0^n 1^m</span> o <span className="sym">0ⁿ1ᵐ</span>. Restricciones separadas por coma, «y» o «;».
              También entiende frases como «n mayor que 0», «m igual al doble de n», «k es la mitad de m». Para multiplicar o dividir por una constante usa <span className="sym">×</span> y <span className="sym">÷</span> (k = 2×n, k = m÷2).
            </p>
          </div>
        )}
      </div>

      <Understood live={live} busy={busy} />
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          {warnings.map((e, i) => <li key={i}>⚠ {e}</li>)}
        </ul>
      )}

      <div className="space-y-2">
        <button type="button" onClick={onBuild} disabled={loading || !!live?.errors?.length} className="btn-primary w-full px-6 py-3" data-testid="build-btn">
          {loading ? 'Construyendo…' : 'Construir autómata'}
        </button>
        {result?.ok && <p className="text-center text-sm text-emerald-300">✓ {result.automaton.counts.stacks} pila{result.automaton.counts.stacks === 1 ? '' : 's'} · {result.automaton.counts.states} estados · {result.automaton.counts.transitions} transiciones</p>}
      </div>
    </section>
  )
}