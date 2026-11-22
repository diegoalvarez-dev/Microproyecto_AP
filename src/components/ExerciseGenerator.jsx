import { useState } from 'react'
import { generateExercise } from '../services/api.js'
import { pretty } from '../lib/spec.js'

const LEVELS = [
  { id: 'facil', name: 'Fácil', color: '#b6f24a', hint: '2 bloques · 1 o 2 restricciones' },
  { id: 'medio', name: 'Medio', color: '#ffd23f', hint: '3 bloques · par/impar y relaciones' },
  { id: 'dificil', name: 'Difícil', color: '#ff4d8d', hint: '4 bloques, grupos (…)ᵏ, módulos' },
]

export default function ExerciseGenerator({ onApply }) {
  const [busy, setBusy] = useState(null)
  const [ex, setEx] = useState(null)
  const [err, setErr] = useState(null)

  const go = async (level) => {
    setBusy(level)
    setErr(null)
    try {
      const r = await generateExercise(level, ex?.language || '')
      setEx(r)
      onApply(r)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(null)
  }

  const cur = LEVELS.find((l) => l.id === ex?.level)
  return (
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-black/15 p-3" data-testid="generator">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">🎲 Ejercicio aleatorio</h3>
        <span className="text-[11px] text-white/35">para practicar</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Nivel del ejercicio">
        {LEVELS.map((l) => (
          <button key={l.id} type="button" disabled={!!busy} onClick={() => go(l.id)} title={l.hint} data-testid={`gen-${l.id}`}
            className="rounded-lg border px-2 py-2 text-sm font-semibold transition hover:brightness-125 disabled:opacity-50"
            style={{ borderColor: `${l.color}66`, background: `${l.color}1a`, color: l.color }}>
            {busy === l.id ? '…' : l.name}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-rose-300" role="alert">{err}</p>}
      {ex && (
        <div className="space-y-1.5 rounded-lg bg-white/5 p-2.5" data-testid="generated-exercise">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="rounded-md px-1.5 py-0.5 font-bold" style={{ background: `${cur?.color}26`, color: cur?.color }}>{ex.level_name}</span>
            <button type="button" onClick={() => go(ex.level)} disabled={!!busy} className="text-white/60 underline-offset-2 hover:text-white hover:underline" data-testid="gen-again">Otro del mismo nivel</button>
          </div>
          <div className="sym break-words text-sm text-white/90">L = {'{'} {pretty(ex.language)} {'}'}</div>
          <div className="text-[11px] text-white/40">Σ = {ex.alphabet} · palabra de ejemplo: <span className="sym text-white/70">{ex.example || 'ε'}</span></div>
        </div>
      )}
    </div>
  )
}