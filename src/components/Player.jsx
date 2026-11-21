import { useRef, useState } from 'react'

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
)
const ICONS = {
  first: 'M6 6h2v12H6zM9.5 12 18 6v12z',
  prev: 'M15.5 6 7 12l8.5 6z',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M8.5 6 17 12l-8.5 6z',
  last: 'M16 6h2v12h-2zM6 6l8.5 6L6 18z',
}
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]

function Btn({ label, onClick, disabled, primary, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-xl transition disabled:opacity-30 ${
        primary ? 'btn-primary h-11 w-11' : 'h-10 w-10 bg-white/8 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

function SeekBar({ idx, total, onSeek }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const pct = total ? (idx / total) * 100 : 0
  const at = (e) => {
    const r = ref.current.getBoundingClientRect()
    onSeek(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))) * total))
  }
  const onKey = (e) => {
    const k = { ArrowLeft: idx - 1, ArrowRight: idx + 1, Home: 0, End: total }[e.key]
    if (k === undefined) return
    e.preventDefault()
    onSeek(Math.min(total, Math.max(0, k)))
  }
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Barra de avance"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={idx}
      className="group relative cursor-pointer py-2.5 outline-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(true)
        at(e)
      }}
      onPointerMove={(e) => drag && at(e)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={onKey}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10 transition group-hover:h-2">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Controles de reproducción: barra, primero/anterior/play/siguiente/último y velocidad. */
export default function Player({ player, label = 'Paso' }) {
  const { idx, setIdx, playing, setPlaying, speed, setSpeed, max } = player
  const done = idx >= max
  const pauseAnd = (fn) => () => {
    setPlaying(false)
    fn()
  }
  const toggle = () => {
    if (playing) return setPlaying(false)
    if (done) setIdx(0)
    setPlaying(true)
  }
  return (
    <div className="space-y-2">
      <SeekBar idx={idx} total={max} onSeek={(n) => { setPlaying(false); setIdx(n) }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Btn label="Volver al inicio" onClick={pauseAnd(() => setIdx(0))} disabled={idx === 0}><Icon d={ICONS.first} /></Btn>
          <Btn label="Paso anterior" onClick={pauseAnd(() => setIdx((i) => Math.max(0, i - 1)))} disabled={idx === 0}><Icon d={ICONS.prev} /></Btn>
          <Btn label={playing ? 'Pausar' : done ? 'Repetir' : 'Reproducir'} onClick={toggle} primary><Icon d={playing ? ICONS.pause : ICONS.play} size={22} /></Btn>
          <Btn label="Paso siguiente" onClick={pauseAnd(() => setIdx((i) => Math.min(max, i + 1)))} disabled={done}><Icon d={ICONS.next} /></Btn>
          <Btn label="Ir al final" onClick={pauseAnd(() => setIdx(max))} disabled={done}><Icon d={ICONS.last} /></Btn>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="tabular-nums text-white/50">{label} {idx} / {max}</span>
          <div className="flex rounded-xl bg-white/8 p-1" role="group" aria-label="Velocidad">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${speed === s ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
