import { useState } from 'react'

// Las fotos están en public/autores/ (jpg, png, jpeg o webp). Si falta una, se muestran las iniciales.
const TEAM = [
  { name: 'Diego Álvarez', photo: 'diego-alvarez' },
  { name: 'Diego Márquez', photo: 'diego-marquez' },
  { name: 'Juan Quintero', photo: 'juan-quintero' },
]
const EXTENSIONS = ['jpg', 'png', 'jpeg', 'webp']

function Avatar({ name, photo }) {
  const [attempt, setAttempt] = useState(0)
  const initials = name.split(' ').map((p) => p[0]).join('')
  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold text-[#060919] ring-2 ring-white/15">
      {attempt < EXTENSIONS.length ? (
        <img src={`/autores/${photo}.${EXTENSIONS[attempt]}`} alt={name} onError={() => setAttempt((a) => a + 1)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

export default function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <svg width="46" height="46" viewBox="0 0 64 64" aria-hidden="true">
          <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <rect width="64" height="64" rx="16" fill="#0b1030" stroke="rgba(255,255,255,.12)" />
          <rect x="20" y="14" width="24" height="9" rx="2" fill="url(#lg)" /><rect x="20" y="26" width="24" height="9" rx="2" fill="url(#lg)" opacity=".75" /><rect x="20" y="38" width="24" height="9" rx="2" fill="url(#lg)" opacity=".5" />
        </svg>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">Autómatas de <span className="grad-text">Pila</span></h1>
          <p className="text-sm text-white/55">Microproyecto AP · Teoría de la computación</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Equipo de trabajo">
        {TEAM.map(({ name, photo }) => (
          <li key={name} className="glass flex items-center gap-2.5 !rounded-full py-1.5 pl-1.5 pr-4 text-sm">
            <Avatar name={name} photo={photo} />
            <span className="grad-text font-semibold">{name}</span>
          </li>
        ))}
      </ul>
    </header>
  )
}
