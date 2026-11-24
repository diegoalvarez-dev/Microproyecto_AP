"""Análisis estático de un autómata multi-pila.

Recorre TODAS las configuraciones (estado, pilas) a las que se puede llegar, sin mirar ninguna cadena concreta:
cada camino de transiciones corresponde a alguna cadena (la que resulta de juntar lo que lee cada transición),
con una sola condición: después de leer el vacío ϕ ya no se puede leer ningún símbolo más.

Sirve para dos cosas:
  * saber qué hay en el tope de cada pila en cada estado (así se completa la notación de las transiciones:
    «X₀, 0, X₀» cuando en esa pila no se hace nada);
  * saber si en el estado final puede quedar algo en las pilas (solo entonces hace falta el rizo que desapila).

Las pilas se acotan a una altura máxima: para saber QUÉ hay en el tope (el fondo o un contador) basta con alturas pequeñas.
"""
from __future__ import annotations

from collections import deque
from typing import Dict, List, Sequence, Set, Tuple

from .models import END, Transition

Config = Tuple[bool, tuple]  # (¿ya se leyó ϕ?, contenido de cada pila)


def fits(t: Transition, stacks: tuple, idx: Dict[str, int]) -> bool:
    for s, top in t.pops.items():
        st = stacks[idx[s]]
        if not st or st[-1] != top:
            return False
    for s in t.empties:
        if stacks[idx[s]]:
            return False
    return True


def apply(t: Transition, stacks: tuple, idx: Dict[str, int]) -> tuple:
    new = list(stacks)
    for s in set(t.pops) | set(t.pushes):
        st = list(new[idx[s]])
        if s in t.pops:
            st.pop()
        for sym in reversed(t.pushes.get(s, [])):
            st.append(sym)
        new[idx[s]] = tuple(st)
    return tuple(new)


def max_height(n_stacks: int) -> int:
    return 5 if n_stacks <= 3 else 3 if n_stacks <= 5 else 2


def reachable(initial: str, transitions: Sequence[Transition], names: List[str], height: int = 0,
              cap: int = 300_000) -> Tuple[Dict[str, Set[Config]], bool]:
    """Configuraciones alcanzables por estado. El segundo valor es True si se superó `cap` (el resultado es parcial)."""
    height = height or max_height(len(names))
    idx = {n: i for i, n in enumerate(names)}
    by: Dict[str, List[Transition]] = {}
    for t in transitions:
        by.setdefault(t.src, []).append(t)
    start = (initial, False, tuple(() for _ in names))
    seen = {start}
    queue = deque([start])
    out: Dict[str, Set[Config]] = {initial: {(False, start[2])}}
    capped = False
    while queue:
        st, ended, stacks = queue.popleft()
        for t in by.get(st, []):
            if t.read == END:
                nended = True
            elif t.read is None:
                nended = ended
            else:
                if ended:
                    continue
                nended = ended
            if not fits(t, stacks, idx):
                continue
            new = apply(t, stacks, idx)
            if any(len(s) > height for s in new):
                continue
            nxt = (t.dst, nended, new)
            if nxt in seen:
                continue
            if len(seen) >= cap:
                capped = True
                continue
            seen.add(nxt)
            out.setdefault(t.dst, set()).add((nended, new))
            queue.append(nxt)
    return out, capped


def complete_notation(machine) -> None:
    """Completa la notación: en cada transición, para las pilas que NO se tocan, anota qué hay en su tope
    (por ejemplo «X₀, ϕ, X₀»). Solo se anota cuando ese tope es siempre el mismo en todas las ejecuciones posibles;
    es solo para mostrar: no cambia lo que hace el autómata."""
    names = list(machine.stacks)
    reach, capped = reachable(machine.initial, machine.transitions, names)
    if capped:
        return
    idx = {n: i for i, n in enumerate(names)}
    for t in machine.transitions:
        t.stay = {}
        configs = reach.get(t.src, set())
        for n in names:
            if n in t.pops or n in t.pushes or n in t.empties:
                continue
            tops = set()
            for ended, stacks in configs:
                if t.read not in (None, END) and ended:
                    continue
                if not fits(t, stacks, idx):
                    continue
                st = stacks[idx[n]]
                tops.add(st[-1] if st else None)
            if len(tops) == 1 and None not in tops:
                t.stay[n] = next(iter(tops))
