const ITEMS = [
  ['ϕ', 'vacío: ya no queda entrada por leer'],
  ['ε', 'desapilar (quitar el tope)'],
  ['λ', 'no lee nada de la cadena'],
  ['∅', 'la pila todavía no existe'],
  ['X₀X', 'declara la pila X: fondo X₀ y símbolo X'],
]

export default function Legend({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs ${className}`} data-testid="legend">
      {ITEMS.map(([s, t]) => (
        <span key={s} className="flex items-center gap-1.5"><b className="sym text-cyan-300">{s}</b><span className="text-white/60">{t}</span></span>
      ))}
    </div>
  )
}