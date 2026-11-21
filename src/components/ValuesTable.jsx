import { useEffect, useRef, useState } from 'react'
import { makeWord } from '../services/api.js'

let nextId = 1
const newRow = (vars) => ({ id: nextId++, vals: Object.fromEntries(vars.map((v) => [v, ''])), auto: {}, word: null, state: 'idle', info: '', sig: '' })
const typedOf = (r, vars) => Object.fromEntries(vars.filter((v) => r.vals[v] !== '').map((v) => [v, r.vals[v]]))
const sigOf = (r, vars) => vars.map((v) => r.vals[v]).join('|')
const why = (mk) => [...(mk.errors || []), ...(mk.violated?.length ? [`No cumple: ${mk.violated.join(', ')}.`] : [])].join(' ')

/**
 * Tabla de valores de las variables (n | m | k ...).
 * Se escriben los valores que se quieran; los que se dejen vacíos se CALCULAN solos con las
 * restricciones (k = m/2, k = n + m...) y aparecen en turquesa con la etiqueta «auto».
 */
export default function ValuesTable({ variables, spec, resetSignal, busy, onRun }) {
  const [rows, setRows] = useState(() => [newRow(variables)])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    setRows([newRow(variables)])
  }, [resetSignal, variables.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, p) => alive.current && setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)))

  // al escribir, se calculan (con un pequeño retraso) los valores que faltan y se muestra la cadena resultante
  useEffect(() => {
    const timers = rows.map((r) => {
      const sig = sigOf(r, variables)
      if (r.sig === sig) return null
      return setTimeout(async () => {
        const typed = typedOf(r, variables)
        if (!Object.keys(typed).length) return patch(r.id, { sig, auto: {}, word: null, state: 'idle', info: '' })
        try {
          const mk = await makeWord(spec.alphabet, spec.language, typed)
          const auto = mk.ok ? Object.fromEntries((mk.auto || []).map((v) => [v, mk.values[v]])) : {}
          patch(r.id, mk.ok
            ? { sig, auto, word: mk.word, state: 'idle', info: mk.notes?.join(' ') || 'Lista para probar' }
            : { sig, auto, word: null, state: 'warn', info: why(mk) })
        } catch (e) {
          patch(r.id, { sig, state: 'warn', info: e.message })
        }
      }, 400)
    })
    return () => timers.forEach((t) => t && clearTimeout(t))
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const test = async (r, show = true) => {
    const typed = typedOf(r, variables)
    if (!Object.keys(typed).length) return patch(r.id, { state: 'warn', info: 'Escribe al menos un valor.' })
    patch(r.id, { state: 'busy', info: '' })
    try {
      const mk = await makeWord(spec.alphabet, spec.language, typed)
      if (!mk.ok) return patch(r.id, { state: 'bad', word: null, info: why(mk) })
      const auto = Object.fromEntries((mk.auto || []).map((v) => [v, mk.values[v]]))
      const sim = await onRun(mk.word, show)
      patch(r.id, { auto, word: mk.word, state: sim?.accepted ? 'ok' : 'bad', info: sim?.accepted ? 'Aceptada' : sim?.reason || 'Rechazada' })
    } catch (e) {
      patch(r.id, { state: 'bad', info: e.message })
    }
  }
  const testAll = async () => {
    for (let i = 0; i < rows.length; i++) await test(rows[i], i === rows.length - 1) // eslint-disable-line no-await-in-loop
  }

  const color = { ok: 'text-emerald-300', bad: 'text-rose-300', warn: 'text-amber-200', busy: 'text-white/50', idle: 'text-white/45' }

  return (
    <div className="space-y-3" data-testid="values-table">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Tabla de valores de las variables</h3>
        <span className="text-[11px] text-white/40">Deja vacías las que dependen de otras: se calculan solas.</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0712]/70 scroll-thin">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-xs text-white/55">
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {variables.map((v) => <th key={v} className="sym px-3 py-2 text-left text-base text-amber-200">{v}</th>)}
              <th className="px-3 py-2 text-left font-semibold">Cadena</th>
              <th className="px-3 py-2 text-left font-semibold">Resultado</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-white/8 align-middle">
                {variables.map((v) => {
                  const auto = r.vals[v] === '' && r.auto[v] !== undefined
                  return (
                    <td key={v} className="px-2 py-1.5">
                      <div className="relative w-24">
                        <input aria-label={`Valor de ${v}, fila ${i + 1}`} data-testid={`val-${v}-${i}`} type="number" min={0} inputMode="numeric"
                          className={`field sym w-full !px-2 !py-1 ${auto ? 'placeholder:text-cyan-300 placeholder:opacity-100' : ''}`}
                          value={r.vals[v]} placeholder={auto ? String(r.auto[v]) : '—'}
                          onChange={(e) => patch(r.id, (x) => ({ vals: { ...x.vals, [v]: e.target.value }, state: 'idle', info: '' }))}
                          onKeyDown={(e) => e.key === 'Enter' && test(r)} />
                        {auto && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase text-cyan-300" data-testid={`auto-${v}-${i}`}>auto</span>}
                      </div>
                    </td>
                  )
                })}
                <td className="sym max-w-[12rem] truncate px-3 py-1.5 text-xs text-white/75" title={r.word ?? ''}>{r.word === null ? '—' : r.word || '(vacía)'}</td>
                <td className={`px-3 py-1.5 text-xs font-semibold ${color[r.state]}`} data-testid={`res-${i}`}>
                  {r.state === 'ok' && '✓ '}{r.state === 'bad' && '✗ '}{r.state === 'busy' ? '…' : r.info || '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={busy || r.state === 'busy'} onClick={() => test(r)} data-testid={`test-${i}`}>Probar</button>
                  {rows.length > 1 && <button type="button" aria-label="Quitar fila" className="ml-1 rounded-md px-2 py-1 text-white/45 hover:bg-white/10 hover:text-white" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setRows((rs) => [...rs, newRow(variables)])} data-testid="add-row">+ Agregar fila</button>
        {rows.length > 1 && <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy} onClick={testAll} data-testid="test-all">Probar todas</button>}
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setRows([newRow(variables)])}>Limpiar tabla</button>
      </div>
    </div>
  )
}