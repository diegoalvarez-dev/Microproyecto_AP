"""Vistas del autómata para la interfaz: definición formal (RF-07), tabla (RF-08) y diagrama (RF-09)."""
from __future__ import annotations

from typing import Dict, List

from .models import END, Machine, NOREAD, Transition
from .notation import is_init, label, parts, read_text, symbol_table


def edges(machine: Machine) -> List[dict]:
    """Transiciones agrupadas por (origen, destino): cada flecha del diagrama."""
    groups: Dict[tuple, List[Transition]] = {}
    for t in machine.transitions:
        groups.setdefault((t.src, t.dst), []).append(t)
    out = []
    for (a, b), ts in groups.items():
        out.append({
            "key": f"{a}->{b}", "from": a, "to": b, "loop": a == b,
            "transitions": [t.id for t in ts],
            "labels": [label(t, machine.stacks) for t in ts],
        })
    return out


def table(machine: Machine) -> List[dict]:
    """Tabla de transición: una fila por transición δ(estado, leído, tope(s)) = (destino, apila)."""
    sym = symbol_table(machine.stacks)
    rows = []
    for t in machine.transitions:
        rows.append({
            "id": t.id, "from": t.src, "read": read_text(t.read), "to": t.dst, "phase": t.phase,
            "init": is_init(t, machine.stacks),
            "tops": {k: sym[v] for k, v in t.pops.items()},
            "pushes": {k: (" ".join(sym[x] for x in v) if v else "ε") for k, v in t.pushes.items()},
            "parts": parts(t, machine.stacks),
            "label": label(t, machine.stacks),
            "note": t.note,
        })
    return rows


def formal(machine: Machine) -> dict:
    """Definición formal  AP = (Q, Σ, Γ₁..Γₙ, δ, q₀, Z₀₁..Z₀ₙ, F)."""
    names = list(machine.stacks)
    gamma = {
        n: [machine.stacks[n].show_bottom, machine.stacks[n].show_counter] for n in names
    }
    q = [s.id for s in machine.states]
    text = [
        f"Q = {{{', '.join(q)}}}",
        f"Σ = {{{', '.join(machine.alphabet)}}}",
        "Γ (una por pila) = " + "; ".join(f"Γ_{machine.stacks[n].show_counter} = {{{', '.join(g)}}}" for n, g in gamma.items()),
        f"q₀ = {machine.initial}",
        "Fondos = " + ", ".join(f"{machine.stacks[n].show_bottom} (pila {machine.stacks[n].show_counter})" for n in names),
        f"F = {{{', '.join(machine.finals)}}}",
        f"δ: Q × (Σ ∪ {{{END}, {NOREAD}}}) × Γ₁ × … × Γₙ → Q × Γ₁* × … × Γₙ*  ({len(machine.transitions)} transiciones, ver la tabla)",
        f"Convenciones: {END} = vacío (la entrada terminó), ε = desapilar, {NOREAD} = no leer.",
        "Aceptación: entrada terminada, estado final y cada pila reducida a su fondo (sin contadores).",
    ]
    return {
        "Q": q, "sigma": machine.alphabet, "gamma": gamma, "q0": machine.initial, "F": machine.finals,
        "bottoms": {n: machine.stacks[n].show_bottom for n in names}, "text": text,
    }


def automaton(machine: Machine) -> dict:
    return {
        "states": [{"id": s.id, "initial": s.initial, "final": s.final, "desc": s.desc, "phase": s.phase} for s in machine.states],
        "initial": machine.initial,
        "finals": machine.finals,
        "edges": edges(machine),
        "stacks": [d.public() for d in machine.stacks.values()],
        "variables": machine.variables,
        "alphabet": machine.alphabet,
        "deterministic": is_deterministic(machine),
        "counts": {"states": len(machine.states), "transitions": len(machine.transitions), "stacks": len(machine.stacks)},
    }


def is_deterministic(machine: Machine) -> bool:
    """Dos transiciones del mismo estado chocan si pueden aplicarse a la vez."""
    by: Dict[str, List[Transition]] = {}
    for t in machine.transitions:
        by.setdefault(t.src, []).append(t)
    for ts in by.values():
        for i in range(len(ts)):
            for j in range(i + 1, len(ts)):
                a, b = ts[i], ts[j]
                if a.drain and b.drain:
                    continue  # vaciar las pilas en cualquier orden da el mismo resultado
                if a.read is not None and b.read is not None and a.read != b.read:
                    continue
                if any(s in b.pops and b.pops[s] != top for s, top in a.pops.items()):
                    continue
                return False
    return True