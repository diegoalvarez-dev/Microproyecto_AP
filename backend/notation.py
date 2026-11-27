"""Notación de las transiciones (todo el formato visible vive aquí, para ajustarlo fácil).

Cada transición se escribe con una parte por pila que toca, separadas por « ; »:

        leído, tope, apila

  leído   símbolo de la entrada, ϕ (vacío: ya no hay más entrada) o λ (no lee)
  tope    símbolo que debe estar arriba de esa pila (∅ si la pila todavía no existe)
  apila   lo que queda en esa pila en lugar del tope; ε = desapilar

Ejemplos:
        0, X₀, X₀X             apila una X sobre el fondo X₀ (el fondo nunca se apila ni se desapila: solo se mira)
        0, X, XX               ya hay contadores: la siguiente X va encima
        1, X, ε                desapila una X
        ϕ, X₀, X₀              en esa pila no se hace nada (se escribe el tope y se deja igual)
  El apilado se escribe de ABAJO hacia ARRIBA: lo último que se escribe queda en el tope.
"""
from __future__ import annotations

from typing import Dict, List

from .models import END, NOREAD, POP, StackDef, Transition


def symbol_table(stacks: Dict[str, StackDef]) -> Dict[str, str]:
    table: Dict[str, str] = {}
    for s in stacks.values():
        table[s.bottom] = s.show_bottom
        table[s.counter] = s.show_counter
    return table


def read_text(read) -> str:
    return NOREAD if read is None else read


def _join(syms: List[str]) -> str:
    return "".join(syms) if all(len(x) <= 2 for x in syms) else " ".join(syms)


def parts(t: Transition, stacks: Dict[str, StackDef]) -> List[dict]:
    sym = symbol_table(stacks)
    out = []
    for name in stacks:
        if name not in t.pops and name not in t.pushes:
            continue
        top = sym[t.pops[name]] if name in t.pops else "∅"
        pushed = t.pushes.get(name, [])
        push = _join([sym[x] for x in reversed(pushed)]) if pushed else POP
        out.append({"stack": name, "top": top, "read": read_text(t.read), "push": push})
    # pilas donde no se hace nada: se muestra el tope y se deja igual
    for name in stacks:
        if name in t.stay and name not in t.pops and name not in t.pushes:
            tp = sym[t.stay[name]]
            out.append({"stack": name, "top": tp, "read": read_text(t.read), "push": tp})
    order = {n: i for i, n in enumerate(stacks)}
    out.sort(key=lambda p: order[p["stack"]])
    return out


def is_init(t: Transition, stacks: Dict[str, StackDef]) -> bool:
    """La primera transición: no lee nada y solo crea cada pila con su fondo."""
    return (t.read is None and not t.pops and bool(t.pushes)
            and all(v == [stacks[k].bottom] for k, v in t.pushes.items()))


def label(t: Transition, stacks: Dict[str, StackDef]) -> str:
    if is_init(t, stacks):  # X₀X ; Y₀Y : por cada pila, su fondo y su símbolo
        return " ; ".join(f"{stacks[k].show_bottom}{stacks[k].show_counter}" for k in stacks if k in t.pushes)
    ps = parts(t, stacks)
    if not ps:
        return read_text(t.read)
    return " ; ".join(f"{p['read']}, {p['top']}, {p['push']}" for p in ps)


def net_ops(t: Transition, stacks: Dict[str, StackDef]) -> List[dict]:
    """Efecto neto sobre cada pila, para animar apilar/desapilar.

    op = "push" | "pop" | "peek" (solo se mira el tope, no cambia nada).
    """
    sym = symbol_table(stacks)
    ops: List[dict] = []
    for name in stacks:
        popped = t.pops.get(name)
        pushed = list(t.pushes.get(name, []))
        if name not in t.pops and name not in t.pushes:
            continue
        if popped is not None and pushed and pushed[-1] == popped:
            above = pushed[:-1]
            if not above:
                ops.append({"stack": name, "op": "peek", "symbol": sym[popped]})
            for s in reversed(above):
                ops.append({"stack": name, "op": "push", "symbol": sym[s]})
        else:
            if popped is not None:
                ops.append({"stack": name, "op": "pop", "symbol": sym[popped]})
            for s in reversed(pushed):
                ops.append({"stack": name, "op": "push", "symbol": sym[s]})
    return ops