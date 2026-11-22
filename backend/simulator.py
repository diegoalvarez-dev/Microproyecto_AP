"""Simulación de cadenas sobre el autómata multi-pila (RF-10, RF-11).

Una CONFIGURACIÓN es (estado, posición en la cadena, contenido de cada pila).
Se explora en anchura todas las ejecuciones posibles (el autómata puede ser no
determinista cuando hay símbolos repetidos en bloques vecinos), así que:

  * si alguna ejecución acepta, se devuelve la más corta;
  * si ninguna acepta, se devuelve la ejecución que llegó más lejos y por qué se detuvo.

Se acepta cuando: la entrada se terminó, el estado es final y TODAS las pilas están vacías.
"""
from __future__ import annotations

from collections import deque
from typing import Dict, List, Optional, Tuple

from .models import END, Machine, Transition
from .notation import label, net_ops, symbol_table

MAX_CONFIGS = 200_000


def _applicable(t: Transition, word: str, pos: int, stacks: tuple, idx: Dict[str, int]) -> Optional[int]:
    """Devuelve la nueva posición si la transición se puede aplicar, o None."""
    if t.read is None:
        npos = pos
    elif t.read == END:
        if pos != len(word):
            return None
        npos = pos
    else:
        if pos >= len(word) or word[pos] != t.read:
            return None
        npos = pos + 1
    for s, top in t.pops.items():
        st = stacks[idx[s]]
        if not st or st[-1] != top:
            return None
    for s in t.empties:
        if stacks[idx[s]]:
            return None  
    return npos


def _apply(t: Transition, stacks: tuple, idx: Dict[str, int]) -> tuple:
    new = list(stacks)
    for s in set(t.pops) | set(t.pushes):
        st = list(new[idx[s]])
        if s in t.pops:
            st.pop()
        for sym in reversed(t.pushes.get(s, [])):
            st.append(sym)
        new[idx[s]] = tuple(st)
    return tuple(new)


def simulate(machine: Machine, word: str, max_configs: int = MAX_CONFIGS) -> dict:
    idx = {name: k for k, name in enumerate(machine.stacks)}
    by_state: Dict[str, List[Transition]] = {}
    for t in machine.transitions:
        by_state.setdefault(t.src, []).append(t)
    finals = set(machine.finals)
    sym = symbol_table(machine.stacks)

    start = (machine.initial, 0, tuple(() for _ in idx))
    parent: Dict[tuple, Tuple[Optional[tuple], Optional[Transition]]] = {start: (None, None)}
    depth: Dict[tuple, int] = {start: 0}
    queue = deque([start])
    accepted_cfg = None
    best = start
    limit = False

    def is_accept(cfg) -> bool:
        st, pos, stacks = cfg
        return st in finals and pos == len(word) and all(len(s) == 0 for s in stacks)

    while queue:
        cfg = queue.popleft()
        if is_accept(cfg):
            accepted_cfg = cfg
            break
        if (cfg[1], depth[cfg]) > (best[1], depth[best]):
            best = cfg
        st, pos, stacks = cfg
        drained = False
        for t in by_state.get(st, []):
            npos = _applicable(t, word, pos, stacks, idx)
            if npos is None:
                continue
            if t.drain:
                if drained:
                    continue  # vaciar en cualquier orden es equivalente: se toma el primero
                drained = True
            nxt = (t.dst, npos, _apply(t, stacks, idx))
            if nxt in parent:
                continue
            if len(parent) >= max_configs:
                limit = True
                continue
            parent[nxt] = (cfg, t)
            depth[nxt] = depth[cfg] + 1
            queue.append(nxt)

    final_cfg = accepted_cfg or best
    chain: List[Tuple[tuple, Optional[Transition]]] = []
    c = final_cfg
    while c is not None:
        p, t = parent[c]
        chain.append((c, t))
        c = p
    chain.reverse()

    def show(cfg):
        return {k: [sym[x] for x in cfg[2][i]] for k, i in idx.items()}

    steps = []
    for n, (cfg, t) in enumerate(chain):
        steps.append({
            "n": n, "state": cfg[0], "pos": cfg[1],
            "consumed": word[:cfg[1]], "remaining": word[cfg[1]:],
            "stacks": show(cfg),
            "transition": t.id if t else None,
            "label": label(t, machine.stacks) if t else None,
            "read": (t.read if t.read is not None else None) if t else None,
            "ops": net_ops(t, machine.stacks) if t else [],
            "from": t.src if t else None,
        })

    reason = None
    if accepted_cfg is None:
        st, pos, stacks = final_cfg
        info = machine.state(st)
        where = f"«{info.desc}»" if info.desc else st
        if pos < len(word):
            reason = (
                f"Se rechaza: la ejecución se detuvo en {st} con la entrada pendiente «{word[pos:]}», "
                f"porque ninguna transición se puede aplicar. Estado {st}: {info.desc}"
            )
        elif st in finals:
            left = {k: v for k, v in show(final_cfg).items() if v}
            reason = f"Se rechaza: se llegó al estado final pero quedaron símbolos en las pilas: {left}."
        else:
            reason = (
                f"Se rechaza: la cadena se terminó pero la ejecución quedó bloqueada en {st}, que no es final. "
                f"Seguramente no se cumple la restricción que se estaba verificando. Estado {st}: {info.desc}"
            )
        if limit:
            reason += " (Se alcanzó el límite de configuraciones explorado.)"

    return {
        "word": word,
        "accepted": accepted_cfg is not None,
        "reason": reason,
        "explored": len(parent),
        "limit_reached": limit,
        "steps": steps,
    }
