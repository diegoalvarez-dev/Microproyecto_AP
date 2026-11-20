import { useEffect, useState } from 'react'
import { makeWord, simulate } from '../services/api.js'

const emptyRow = (vars) => ({ vals: Object.fromEntries(vars.map((v) => [v, ''])), word: null, state: 'idle', info: '' })

/**
 * Tabla de valores de las variables (n | m | ...). Cada fila es una prueba:
 * se arma la cadena con esos valores, se simula y se marca si el autómata la acepta.
 */
export default function ValuesTable({ variables, spec, resetSignal, busy, onShow }) {
  const [rows, setRows] = useState([emptyRow(variables)])

  useEffect(() => {
    setRows((old) => {
      const base = old.length ? old : [emptyRow(variables)]
      return base.map((r) => ({ ...emptyRow(variables), vals: Object.fromEntries(variables.map((v) => [v, r.vals[v] ?? ''])) }))
    })
  }, [resetSignal, variables.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i, fn) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...fn(r) } : r)))

  const test = async (i, show = true) => {
    const row = rows[i]
    if (variables.some((v) => row.vals[v] === '' || Number(row.vals[v]) < 0)) {
      patch(i, () => ({ state: 'bad', word: null, info: 'Completa todos los valores (números ≥ 0).' }))
      return
    }
    patch(i, () => ({ state: 'busy', info: '' }))
    try {
      const mk = await makeWord(spec.alphabet, spec.language, row.vals)
      if (!mk.ok) {
        const why = [...(mk.errors || [])]
        if (mk.violated?.length) why.push(`No cumple: ${mk.violated.join(', ')}.`)
        patch(i, () => ({ state: 'bad', word: null, info: why.join(' ') }))
        return
      }
      const sim = await simulate(spec.alphabet, spec.language, mk.word)
      patch(i, () => ({ state: sim.accepted ? 'ok' : 'bad', word: mk.word, info: sim.accepted ? 'Aceptada' : sim.reason || 'Rechazada' }))
      if (show) onShow(mk.word)
    } catch (e) {
      patch(i, () => ({ state: 'bad', info: e.message }))
    }
  }

  const testAll = async () => { for (let i = 0; i < rows.length; i++) await test(i, i === rows.length - 1) } // eslint-disable-line no-await-in-loop

  return (
    <div className="space-y-2" data-testid="values-table">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Tabla de valores de las variables</div>
      <div className="overflow-x-auto rounded-xl border border-white/10 scroll-thin">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="bg-black/25 text-xs text-white/55">
            <tr>
              {variables.map((v) => <th key={v} className="sym px-3 py-1.5 text-left text-base text-amber-200">{v}</th>)}
              <th className="px-3 py-1.5 text-left font-semibold">Cadena</th>
              <th className="px-3 py-1.5 text-left font-semibold">Resultado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-white/8">
                {variables.map((v) => (
                  <td key={v} className="px-2 py-1">
                    <input aria-label={`Valor de ${v}, fila ${i + 1}`} data-testid={`val-${v}-${i}`} type="number" min={0} className="field sym w-20 !px-2 !py-1" value={r.vals[v]}
                      onChange={(e) => patch(i, (x) => ({ vals: { ...x.vals, [v]: e.target.value }, state: 'idle', word: null, info: '' }))}
                      onKeyDown={(e) => e.key === 'Enter' && test(i)} />
                  </td>
                ))}
                <td className="sym max-w-[14rem] truncate px-3 py-1 text-xs text-white/70" title={r.word ?? ''}>{r.word === null ? '—' : r.word || '(vacía)'}</td>
                <td className={`px-3 py-1 text-xs font-semibold ${r.state === 'ok' ? 'text-emerald-300' : r.state === 'bad' ? 'text-rose-300' : 'text-white/40'}`} data-testid={`res-${i}`}>
                  {r.state === 'ok' && '✓ '}{r.state === 'bad' && '✗ '}{r.state === 'busy' ? '…' : r.info || '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={busy || r.state === 'busy'} onClick={() => test(i)} data-testid={`test-${i}`}>Probar</button>
                  {rows.length > 1 && <button type="button" aria-label="Quitar fila" className="ml-1 rounded-md px-2 py-1 text-white/45 hover:bg-white/10 hover:text-white" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setRows((rs) => [...rs, emptyRow(variables)])} data-testid="add-row">+ Agregar fila</button>
        {rows.length > 1 && <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy} onClick={testAll}>Probar todas</button>}
      </div>
    </div>
  )
}