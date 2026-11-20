// Constructor visual de lenguajes: convierte los bloques en el texto que entiende el backend.
export const PRESETS = [
  {
    name: 'Ejemplo de la ingeniera',
    alphabet: '{0, 1, 2}',
    language: '0^n 1^m 2^k | n>0, n par, m>n, m par, k=m/2',
    builder: {
      blocks: [{ sym: '0', v: 'n' }, { sym: '1', v: 'm' }, { sym: '2', v: 'k' }],
      group: null,
      cons: ['n>0', 'n par', 'm>n', 'm par', 'k=m/2'],
    },
  },
  {
    name: 'Pizarra: (0ⁿ1ᵐ)ᵏ',
    alphabet: '{0, 1}',
    language: '(0^n 1^m)^k | n>0, m>1, k=n',
    builder: {
      blocks: [{ sym: '0', v: 'n' }, { sym: '1', v: 'm' }],
      group: { from: 0, to: 1, v: 'k' },
      cons: ['n>0', 'm>1', 'k=n'],
    },
  },
  {
    name: 'aⁿbⁿ',
    alphabet: '{a, b}',
    language: 'a^n b^n',
    builder: { blocks: [{ sym: 'a', v: 'n' }, { sym: 'b', v: 'n' }], group: null, cons: [] },
  },
]

export function builderToText(b) {
  const blocks = b.blocks.filter((x) => x.sym && x.v)
  if (!blocks.length) return ''
  const items = blocks.map((x) => `${x.sym}^${x.v}`)
  let pattern
  if (b.group && b.group.v && b.group.from <= b.group.to && b.group.to < blocks.length) {
    const g = b.group
    pattern = [
      ...items.slice(0, g.from),
      `(${items.slice(g.from, g.to + 1).join(' ')})^${g.v}`,
      ...items.slice(g.to + 1),
    ].join(' ')
  } else {
    pattern = items.join(' ')
  }
  const cons = b.cons.map((c) => c.trim()).filter(Boolean)
  return cons.length ? `${pattern} | ${cons.join(', ')}` : pattern
}

// Restricciones sugeridas según las variables del lenguaje.
export function suggestions(b) {
  const vars = []
  b.blocks.forEach((x) => x.v && !vars.includes(x.v) && vars.push(x.v))
  if (b.group && b.group.v && !vars.includes(b.group.v)) vars.push(b.group.v)
  const out = []
  vars.forEach((v) => out.push(`${v}>0`, `${v} par`, `${v} impar`))
  for (let i = 0; i + 1 < vars.length; i++) out.push(`${vars[i + 1]}>${vars[i]}`, `${vars[i + 1]}=${vars[i]}`)
  if (vars.length >= 2) out.push(`${vars[vars.length - 1]}=${vars[vars.length - 2]}/2`)
  return out
}

const SUP = { n: 'ⁿ', m: 'ᵐ', k: 'ᵏ', i: 'ⁱ', j: 'ʲ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', l: 'ˡ', o: 'ᵒ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ' }
// 0^n 1^m  ->  0ⁿ 1ᵐ  (para mostrar el lenguaje como se escribe en el tablero)
export const pretty = (s) => (s || '').replace(/\^\{?([a-z])\}?/g, (m, v) => SUP[v] || m)
