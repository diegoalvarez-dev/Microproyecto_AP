"""Construcción del autómata multi-pila a partir del lenguaje, usando el MENOR número de pilas.

Idea general (como se diseñaría a mano):

  1. Las restricciones sobre UNA sola variable (n>0, n par, m>1, n mod 3 = 1...) se
     verifican con los ESTADOS mientras se lee la cadena: no necesitan pila.
  2. Una variable solo lleva pila si participa en una relación con otra variable
     (m>n, k=m/2, k=n+m...). Las demás no tienen pila.
  3. Una igualdad entre dos bloques (aⁿbⁿ) se verifica al leer: el primer bloque APILA y
     el segundo DESAPILA de la misma pila; el segundo no necesita pila propia.
  4. Las relaciones que quedan se verifican al final de la cadena (símbolo ϕ) con un
     «gadget» que desapila las pilas involucradas. Una pila solo se RESTAURA (con su
     auxiliar) si otra restricción la va a necesitar después; su último uso la consume.
  5. Con un grupo repetido (0ⁿ1ᵐ)ᵏ, la 1.ª repetición define n y m y las demás se
     comparan alternando entre la pila y su auxiliar (así se hizo en clase).

La primera transición declara todas las pilas. El estado final tiene un rizo que
desapila los contadores que queden (solo si hace falta): se acepta con la entrada terminada
y cada pila reducida a su fondo.
"""
from __future__ import annotations

from collections import deque
from itertools import product
from typing import Callable, Dict, List, Optional, Tuple

from .language import FLIP, Language, classify, lcm
from .analysis import complete_notation
from .models import END, Machine, NOREAD, POP, State, StackDef, Transition, make_stack
from .notation import label

LETTERS = list("XYZWUVTSRQPONML")
PH_NAME = {"r1": "1.ª repetición", "E": "repetición par", "O": "repetición impar"}


class Atom:
    """Una operación sobre una pila: qué tope exige y qué deja en su lugar."""

    __slots__ = ("stack", "tops", "push", "inspect")

    def __init__(self, stack: str, tops: list, push: Callable, inspect: bool = False):
        self.stack, self.tops, self.push, self.inspect = stack, tops, push, inspect


def _merge(atoms: List[Atom]) -> List[Atom]:
    by: Dict[str, Atom] = {}
    for a in atoms:
        b = by.get(a.stack)
        if b is None:
            by[a.stack] = a
            continue
        if not (a.inspect or b.inspect):
            raise AssertionError(f"dos operaciones sobre la pila {a.stack}")
        tops = [t for t in b.tops if t in a.tops]
        keep = b if not b.inspect else a
        by[a.stack] = Atom(a.stack, tops, keep.push, a.inspect and b.inspect)
    return list(by.values())


def names_of(g: dict) -> List[str]:
    k = g["gadget"]
    if k in ("range", "mod"):
        return [g["var"]]
    if k in ("cmp", "scale"):
        return [g["p"], g["q"]]
    if k == "sum":
        return [g["x"]] + list(g["terms"])
    return []


class Builder:
    def __init__(self, lang: Language, aux_declared: Optional[set] = None):
        self.lang = lang
        self.simple = lang.group is None
        self.declared = set(aux_declared or set())
        self.aux_used: set = set()
        self.states: List[State] = []
        self.trans: List[Transition] = []
        self.stacks: Dict[str, StackDef] = {}
        self.steps: List[dict] = []
        self.occ_stack: Dict[str, str] = {}
        self.var_stack: Dict[str, str] = {}
        self.pos_states: Dict[tuple, str] = {}
        self.queue: deque = deque()
        self.end_moves: List[tuple] = []
        self.phase = "init"
        # planificación
        self.todo: List[tuple] = []
        self.notes: List[str] = []
        self.unary: Dict[str, list] = {}
        self.popper_of: Dict[str, str] = {}
        self.rel: Dict[str, dict] = {}
        self.trk: Dict[int, dict] = {}
        self.occ_block = {o.occ: o.block for o in lang.occurrences if o.kind == "block"}

    # ------------------------------------------------------------ planificación
    def make_tracker(self, gs: List[dict]) -> dict:
        """Autómata finito que lleva la cuenta de un bloque para verificar sus restricciones unarias."""
        ranges = [g for g in gs if g["gadget"] == "range"]
        mods = [(g["c"], g["r"]) for g in gs if g["gadget"] == "mod"]
        his = [g["hi"] for g in ranges if g["hi"] is not None]

        def ok(c: int) -> bool:
            return all(g["lo"] <= c and (g["hi"] is None or c <= g["hi"]) for g in ranges) and all(c % m == r for m, r in mods)

        if not gs:
            return {"next": lambda c: 0, "ok": lambda c: True, "T0": 0, "Lm": 1, "finite": False, "trivial": True, "cons": []}
        if his:
            maxc = min(his)
            nxt = lambda c: c + 1 if c < maxc else None  # noqa: E731
            return {"next": nxt, "ok": ok, "T0": 0, "Lm": 1, "finite": True, "trivial": False, "cons": []}
        Lm = 1
        for m, _ in mods:
            Lm = lcm(Lm, m)
        T0 = max([g["lo"] for g in ranges], default=0)
        top = T0 + Lm
        nxt = lambda c: c + 1 if c + 1 < top else T0  # noqa: E731
        return {"next": nxt, "ok": ok, "T0": T0, "Lm": Lm, "finite": False, "trivial": False, "cons": []}

    def plan(self) -> None:
        L = self.lang
        items = [(c.text, classify(c), c.hidden) for c in L.hidden + L.constraints]
        if not self.simple:
            self.todo = items
            return
        rel = []
        for text, g, h in items:
            k = g["gadget"]
            if k in ("range", "mod"):
                self.unary.setdefault(g["var"], []).append((text, g))
            elif k == "trivial":
                self.notes.append(f"La restricción «{text}» siempre se cumple (las variables son naturales): no necesita transiciones.")
            else:
                rel.append((text, g, h))

        # relaciones entre dos bloques (=, <, <=, >, >=): el primero APILA y el segundo DESAPILA de la
        # misma pila; los símbolos de más (cuando la pila ya está vacía) los cuentan los estados.
        inc: Dict[str, int] = {}
        for _, g, _ in rel:
            for nm in names_of(g):
                inc[nm] = inc.get(nm, 0) + 1
        aliased = set()
        for idx, (text, g, h) in enumerate(rel):
            if g["gadget"] != "cmp" or g["p"] == g["q"]:
                continue
            p, q, cmp, c = g["p"], g["q"], g["cmp"], g["c"]
            if self.occ_block[p] > self.occ_block[q]:
                pop, own, rc, rcn = p, q, cmp, c  # p (el bloque de después) desapila la pila de q
            elif c == 0:
                pop, own, rc, rcn = q, p, FLIP[cmp], 0  # se invierte la relación para que lo lea el bloque de después
            else:
                continue
            if inc[own] == 1 and pop not in self.popper_of:
                emax = {"=": rcn, "<": rcn - 1, "<=": rcn, ">": rcn + 1, ">=": rcn}[rc]
                self.popper_of[pop] = own
                self.rel[pop] = {"cmp": rc, "c": rcn, "emax": emax, "text": text}
                aliased.add(idx)
                self.notes.append(
                    f"La relación «{text}» se verifica mientras se lee: el bloque de {own} apila y el de {pop} desapila de la misma pila; "
                    f"los símbolos de más los cuentan los estados. Así {pop} no necesita pila propia (a menos que otra restricción la use)."
                )
        self.todo = [x for i, x in enumerate(rel) if i not in aliased]

        # restricciones de una variable: se verifican con los estados
        for b in L.blocks:
            gs = [g for _, g in self.unary.get(b.var, [])] if b.occ == b.var else []
            tk = self.make_tracker(gs)
            tk["cons"] = [t for t, _ in self.unary.get(b.var, [])] if b.occ == b.var else []
            self.trk[b.index] = tk
        for var, lst in self.unary.items():
            self.notes.append(
                f"Las restricciones sobre {var} ({', '.join(t for t, _ in lst)}) se verifican con los estados mientras se lee la cadena: no necesitan pila."
            )

    # ------------------------------------------------------------------- pilas
    def declare_stacks(self) -> None:  # lenguajes con grupo repetido
        L = self.lang
        for k, o in enumerate(L.occurrences):
            name = LETTERS[k] if k < len(LETTERS) else f"S{k + 1}"
            self.occ_stack[o.occ] = name
            if o.primary:
                self.var_stack[o.var] = name
        if L.group:
            for b in L.blocks:
                if b.in_group:
                    self.declared.add(self.occ_stack[b.occ] + "A")
        for o in L.occurrences:
            name = self.occ_stack[o.occ]
            self.stacks[name] = make_stack(name, o.var, "count")
            if name + "A" in self.declared:
                self.stacks[name + "A"] = make_stack(name + "A", o.var, "aux", owner=name)

    def declare_simple(self) -> None:
        L = self.lang
        need = set(self.popper_of.values())
        for _, g, _ in self.todo:
            need.update(names_of(g))
        order = [o for o in L.occurrences if o.occ in need]
        if not order:  # lenguaje regular: ninguna restricción necesita pila; se deja una vacía para ser un AP
            self.stacks["X"] = make_stack("X", "", "count")
            return
        for k, o in enumerate(order):
            name = LETTERS[k] if k < len(LETTERS) else f"S{k + 1}"
            self.occ_stack[o.occ] = name
            self.stacks[name] = make_stack(name, o.var, "count")
            if name + "A" in self.declared:
                self.stacks[name + "A"] = make_stack(name + "A", o.var, "aux", owner=name)

    def aux(self, name: str) -> str:
        a = name + "A"
        if a not in self.stacks:
            self.aux_used.add(a)
            self.stacks[a] = make_stack(a, self.stacks[name].var, "aux", owner=name)
        return a

    def dn(self, name: str) -> str:
        return self.stacks[name].show_counter

    def S(self, i: int) -> str:
        return self.occ_stack[self.lang.blocks[i - 1].occ]

    def vs(self, var: str) -> str:
        return self.occ_stack[var]  # var puede ser una variable o una aparición repetida (n', n'')

    # ----------------------------------------------------------------- átomos
    def a_push(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [d.bottom, d.counter], lambda t, d=d: [d.counter, t])

    def a_pop(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [d.counter], lambda t: [])

    def a_bot(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [d.bottom], lambda t, d=d: [d.bottom], True)

    def a_cnt(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [d.counter], lambda t, d=d: [d.counter], True)

    def a_init(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [None], lambda t, d=d: [d.bottom])

    def a_drain(self, s: str) -> Atom:
        d = self.stacks[s]
        return Atom(s, [d.counter], lambda t: [])  # solo contadores: el fondo nunca se desapila

    # ------------------------------------------------- estados y aristas
    def new_state(self, desc: str, phase: Optional[str] = None) -> str:
        sid = f"q{len(self.states)}"
        ph = phase or self.phase
        self.states.append(State(sid, desc, ph))
        self.steps.append({"kind": "state", "state": sid, "text": f"Se crea el estado {sid}: {desc}", "phase": ph})
        return sid

    def edge(self, src: str, dst: str, read: Optional[str], atoms: List[Atom], why: str) -> List[int]:
        atoms = _merge(atoms)
        ids: List[int] = []
        for combo in product(*[a.tops for a in atoms]):
            pops, pushes = {}, {}
            for a, top in zip(atoms, combo):
                if top is not None:
                    pops[a.stack] = top
                pushes[a.stack] = list(a.push(top))
            t = Transition(len(self.trans), src, dst, read, pops, pushes, self.phase, why)
            self.trans.append(t)
            ids.append(t.id)
        if ids:
            self.steps.append({
                "kind": "edge", "from": src, "to": dst, "text": why, "phase": self.phase, "transitions": ids,
                "labels": [label(self.trans[i], self.stacks) for i in ids],
            })
        return ids

    def phase_step(self, phase: str, title: str, text: str) -> None:
        self.phase = phase
        self.steps.append({"kind": "phase", "phase": phase, "title": title, "text": text})

    def declare_step(self, q0: str) -> str:
        names = list(self.stacks)

        def what(n):
            d = self.stacks[n]
            if d.role == "aux":
                return f"{d.show_counter} (auxiliar de {d.owner})"
            return f"{d.show_counter} (cuenta {d.var})" if d.var else f"{d.show_counter} (sin uso: el lenguaje es regular y no necesita pila)"

        self.steps.append({
            "kind": "stacks", "phase": "init",
            "text": f"El autómata usa {len(names)} pila{'s' if len(names) != 1 else ''}: {', '.join(what(n) for n in names)}. "
                    f"Cada una arranca con su símbolo de fondo ({', '.join(self.stacks[n].show_bottom for n in names)}).",
            "stacks": [self.stacks[n].public() for n in names],
        })
        return q0

    # =================================================== lenguajes SIN grupo
    def reading_simple(self) -> None:
        for n in self.notes:
            self.steps.append({"kind": "info", "phase": "init", "text": n})
        self.phase_step(
            "init", "Fase 1 · Declarar las pilas y leer la cadena",
            "La primera transición declara las pilas. Después se lee la cadena: cada bloque apila o desapila en su pila, "
            "y los estados verifican las restricciones de una sola variable.",
        )
        q0 = self.new_state("estado inicial: todas las pilas están sin crear.", "init")
        self.states[0].initial = True
        self.declare_step(q0)
        s0 = self.get_s(0, 0, 0)
        self.phase = "init"
        self.edge(q0, s0, None, [self.a_init(n) for n in self.stacks], self.init_why())
        self.phase = "lectura"
        while self.queue:
            i, t, e = self.queue.popleft()
            self.moves_simple(i, t, e)

    def init_why(self) -> str:
        pairs = " ; ".join(f"{d.show_bottom}{d.show_counter}" for d in self.stacks.values())
        return (f"Primera transición: declara las pilas con la notación {pairs}. Cada par es «fondo + símbolo»: "
                f"X₀X crea la pila X con su fondo X₀. No lee nada de la cadena (λ).")

    def tk_text(self, i: int, t: int) -> str:
        tk, v = self.trk[i], self.lang.blocks[i - 1].var
        if tk["finite"] or t < tk["T0"]:
            what = f"{v} = {t}"
        else:
            what = (f"{v} ≥ {tk['T0']}, " if tk["T0"] else "") + (f"{v} ≡ {t % tk['Lm']} (mod {tk['Lm']})" if tk["Lm"] > 1 else f"{v} ≥ {tk['T0']}")
            what = what.rstrip(", ")
        return f"El estado lleva la cuenta ({what}) para verificar {', '.join(tk['cons'])} sin usar pila."

    def get_s(self, i: int, t: int, e: int) -> str:
        key = (i, t, e)
        if key not in self.pos_states:
            if i == 0:
                desc = "lectura: todavía no se ha leído ninguna letra de la cadena."
            else:
                b = self.lang.blocks[i - 1]
                desc = f"leyendo el bloque {i} («{b.symbol}», exponente {b.var})."
                if not self.trk[i]["trivial"]:
                    desc += " " + self.tk_text(i, t)
                if b.occ in self.rel:
                    desc += f" Lleva {e} símbolo(s) de más (los que llegaron con {self.dn(self.occ_stack[self.popper_of[b.occ]])} ya vacía)."
            self.pos_states[key] = self.new_state(desc, "lectura")
            self.queue.append(key)
        return self.pos_states[key]

    def next_e(self, rel: dict, e: int) -> Optional[int]:
        """Símbolos de más contados por el estado; en > y >= se satura (cuenta «al menos»)."""
        if e < rel["emax"]:
            return e + 1
        if rel["cmp"] in (">", ">=") and e >= rel["emax"]:
            return e
        return None

    def read_options(self, j: int, e: int) -> List[tuple]:
        """Formas de leer un símbolo del bloque j: (átomos, nuevo e, tipo)."""
        b = self.lang.blocks[j - 1]
        own = self.occ_stack.get(b.occ)
        base = [self.a_push(own)] if own else []
        if b.occ not in self.rel:
            return [(base, 0, "plain")]
        X = self.occ_stack[self.popper_of[b.occ]]
        opts = [([self.a_pop(X)] + base, e, "pop")]
        ne = self.next_e(self.rel[b.occ], e)
        if ne is not None:
            opts.append(([self.a_bot(X)] + base, ne, "extra"))
        return opts

    def rel_alts(self, s: int, e: int) -> List[List[Atom]]:
        """Qué debe verse en la pila y en el contador de más para que la relación del bloque s se cumpla."""
        occ = self.lang.blocks[s - 1].occ
        rel = self.rel[occ]
        X = self.occ_stack[self.popper_of[occ]]
        cmp, c = rel["cmp"], rel["c"]
        if cmp == "=":
            return [[self.a_bot(X)]] if e == c else []
        if cmp == ">":
            return [[self.a_bot(X)]] if e > c else []
        if cmp == ">=":
            return [[self.a_bot(X)]] if e >= c else []
        alts = [[self.a_cnt(X)]] if e == 0 else []  # queda pila sin desapilar: el bloque fue más corto
        if (cmp == "<" and e < c) or (cmp == "<=" and e <= c):
            alts.append([self.a_bot(X)])
        return alts

    def leave_alts(self, i: int, e: int, j: int) -> List[List[Atom]]:
        """Al pasar de los bloques ≤ i a los bloques ≥ j, cada relación pendiente debe cumplirse."""
        per = []
        for s in range(max(i, 1), j):
            if self.lang.blocks[s - 1].occ in self.rel:
                per.append(self.rel_alts(s, e if s == i else 0))
        if not per:
            return [[]]
        return [sum(combo, []) for combo in product(*per)]

    def read_why(self, j: int, kind: str, loop: bool, frm: Optional[int] = None, guarded: bool = False) -> str:
        b = self.lang.blocks[j - 1]
        own = self.occ_stack.get(b.occ)
        mine = f" y apila en {self.dn(own)} (cuenta {b.var} para otra restricción)" if own else ", sin pila propia"
        if kind == "pop":
            X = self.occ_stack[self.popper_of[b.occ]]
            act = f"desapila de {self.dn(X)}: compara {b.var} con {self.popper_of[b.occ]} mientras lee{mine}"
        elif kind == "extra":
            X = self.occ_stack[self.popper_of[b.occ]]
            act = f"{self.dn(X)} ya está vacía, así que este es un símbolo de más: el estado lo cuenta{mine}"
        elif own:
            act = f"apila en {self.dn(own)}: cuenta una letra más de {b.var}"
        else:
            act = f"solo cambia de estado: {b.var} no necesita pila"
        txt = (f"Sigue leyendo «{b.symbol}»: " if loop else f"Al leer «{b.symbol}»: ") + act + "."
        if not self.trk[j]["trivial"]:
            txt += f" El estado actualiza la cuenta de {b.var} ({', '.join(self.trk[j]['cons'])})."
        if not loop and frm is not None:
            if j > frm + 1:
                txt += f" Se saltan los bloques {frm + 1}..{j - 1}, que valen 0."
            if guarded:
                txt += " Antes comprueba el tope de la pila y los símbolos de más para confirmar que se cumple la relación entre los bloques."
        return txt

    def moves_simple(self, i: int, t: int, e: int) -> None:
        B, T = self.lang.blocks, len(self.lang.blocks)
        src = self.pos_states[(i, t, e)]
        trk = self.trk
        sym = lambda j: B[j - 1].symbol  # noqa: E731
        can_leave = True if i == 0 else trk[i]["ok"](t)
        if i >= 1:
            nt = trk[i]["next"](t)
            if nt is not None:
                for atoms, ne, kind in self.read_options(i, e):
                    self.edge(src, self.get_s(i, nt, ne), sym(i), atoms, self.read_why(i, kind, loop=True))
        if not can_leave:
            return
        j = i + 1
        while j <= T:
            nt = trk[j]["next"](0)
            if nt is not None:
                for g in self.leave_alts(i, e, j):
                    for atoms, ne, kind in self.read_options(j, 0):
                        self.edge(src, self.get_s(j, nt, ne), sym(j), g + atoms, self.read_why(j, kind, False, i, bool(g)))
            if not trk[j]["ok"](0):
                return  # el bloque j no puede valer 0: no se puede saltar
            j += 1
        for g in self.leave_alts(i, e, T + 1):
            self.end_moves.append((src, None, g))

    # =============================================== lenguajes CON grupo
    def get(self, i: int, ph: Optional[str]) -> str:
        key = (i, ph)
        if key not in self.pos_states:
            B = self.lang.blocks
            if i == 0:
                desc = "lectura: todavía no se ha leído ninguna letra de la cadena."
            else:
                b = B[i - 1]
                desc = f"la última letra leída es «{b.symbol}» (bloque {i}), que se cuenta en la pila {self.dn(self.S(i))} para {b.var}."
                if self.lang.group and ph:
                    g = self.lang.group
                    if g.first <= i <= g.last:
                        desc += f" Estamos en la {PH_NAME[ph]} del grupo."
                    else:
                        desc += " El grupo ya terminó."
            self.pos_states[key] = self.new_state(desc, "lectura")
            self.queue.append(key)
        return self.pos_states[key]

    def src_stack(self, i: int, ph: str) -> str:
        return self.S(i) if ph in ("r1", "E") else self.aux(self.S(i))

    def dst_stack(self, i: int, ph: str) -> str:
        return self.aux(self.S(i)) if ph == "E" else self.S(i)

    def reading_phase(self) -> None:
        self.phase_step(
            "init", "Fase 1 · Declarar las pilas y leer la cadena",
            "La primera transición crea una pila por cada variable. Después, cada letra leída se cuenta apilando en la pila de su bloque.",
        )
        q0 = self.new_state("estado inicial: todas las pilas están sin crear.", "init")
        self.states[0].initial = True
        self.declare_step(q0)
        s0 = self.get(0, None)
        self.phase = "init"
        self.edge(q0, s0, None, [self.a_init(n) for n in self.stacks], self.init_why())
        self.phase = "lectura"
        while self.queue:
            i, ph = self.queue.popleft()
            self.emit_moves(i, ph)

    def emit_moves(self, i: int, ph: Optional[str]) -> None:
        L, g, B = self.lang, self.lang.group, self.lang.blocks
        T = len(B)
        src = self.pos_states[(i, ph)]
        sym = lambda j: B[j - 1].symbol  # noqa: E731
        dn, S = self.dn, self.S

        if g is None or ph is None:  # antes del grupo, o sin grupo
            hi = T if g is None else g.first
            for j in range(max(i, 1), hi + 1):
                if g is not None and j == g.first:
                    R = self.occ_stack[g.occ]
                    dst = self.get(j, "r1")
                    self.edge(src, dst, sym(j), [self.a_push(S(j)), self.a_push(R)],
                              f"Al leer «{sym(j)}» entra al grupo: apila en {dn(S(j))} (cuenta {B[j-1].var}) y apila en {dn(R)} (cuenta la 1.ª repetición).")
                else:
                    dst = self.get(j, None)
                    skip = f" (se saltan los bloques {i + 1}..{j - 1}, que valen 0)" if j > max(i, 1) else ""
                    self.edge(src, dst, sym(j), [self.a_push(S(j))],
                              f"Al leer «{sym(j)}» apila en {dn(S(j))}: cuenta una letra más de {B[j-1].var}{skip}.")
            if g is None:
                self.end_moves.append((src, None, []))
            return

        first, last = g.first, g.last
        R = self.occ_stack[g.occ]
        ph_name = PH_NAME[ph]

        def guard(i_, ph_):
            return [] if ph_ == "r1" else [self.a_bot(self.src_stack(i_, ph_))]

        def guard_txt(i_, ph_):
            return "" if ph_ == "r1" else f" Antes comprueba que {dn(self.src_stack(i_, ph_))} quedó vacía (el bloque tenía exactamente esa cantidad)."

        if first <= i <= last:
            a = sym(i)
            if ph == "r1":
                self.edge(src, src, a, [self.a_push(S(i))],
                          f"Sigue leyendo «{a}»: apila en {dn(S(i))} ({B[i-1].var} se está contando en la 1.ª repetición).")
            else:
                s_, d_ = self.src_stack(i, ph), self.dst_stack(i, ph)
                self.edge(src, src, a, [self.a_pop(s_), self.a_push(d_)],
                          f"En la {ph_name}, cada «{a}» pasa de {dn(s_)} a {dn(d_)}: así se verifica que {B[i-1].var} se repite igual, sin perder la cuenta.")
            if i < last:
                j = i + 1
                dst = self.get(j, ph)
                if ph == "r1":
                    atoms = [self.a_push(S(j))]
                else:
                    atoms = guard(i, ph) + [self.a_pop(self.src_stack(j, ph)), self.a_push(self.dst_stack(j, ph))]
                self.edge(src, dst, sym(j), atoms,
                          f"Al leer «{sym(j)}» empieza el bloque {j} del grupo ({B[j-1].var})." + guard_txt(i, ph))
            if i == last:
                ph2 = "E" if ph in ("r1", "O") else "O"
                j = first
                dst = self.get(j, ph2)
                atoms = guard(i, ph) + [self.a_pop(self.src_stack(j, ph2)), self.a_push(self.dst_stack(j, ph2)), self.a_push(R)]
                self.edge(src, dst, sym(j), atoms,
                          f"Al leer «{sym(j)}» empieza una nueva repetición ({PH_NAME[ph2]}): apila en {dn(R)} (cuenta una repetición más de {g.var})." + guard_txt(i, ph))
                for j in range(last + 1, T + 1):
                    dst = self.get(j, ph)
                    self.edge(src, dst, sym(j), guard(i, ph) + [self.a_push(S(j))],
                              f"Al leer «{sym(j)}» el grupo terminó y empieza el bloque {j} ({B[j-1].var}); apila en {dn(S(j))}." + guard_txt(i, ph))
                self.end_moves.append((src, ph, guard(i, ph)))
            return

        for j in range(i, T + 1):
            dst = self.get(j, ph)
            skip = f" (se saltan los bloques {i + 1}..{j - 1}, que valen 0)" if j > i else ""
            self.edge(src, dst, sym(j), [self.a_push(S(j))],
                      f"Al leer «{sym(j)}» apila en {dn(S(j))}: cuenta una letra más de {B[j-1].var}{skip}.")
        self.end_moves.append((src, ph, []))

    # --------------------------------- fin de la entrada → verificación
    def end_phase(self) -> str:
        L = self.lang
        self.phase_step(
            "verificacion", "Fase 2 · Verificar las restricciones",
            "Cuando se acaba la cadena (símbolo vacío ϕ) ya no se lee nada: solo se desapila para comprobar las restricciones que faltan.",
        )
        head = self.new_state("la cadena se terminó; empieza la verificación de las restricciones.", "verificacion")
        canon = None
        if any(ph == "E" for _, ph, _ in self.end_moves):
            blocks = [b for b in L.blocks if b.in_group]
            sts = [self.new_state(f"devuelve a {self.dn(self.occ_stack[b.occ])} lo que quedó en {self.dn(self.aux(self.occ_stack[b.occ]))} (la última repetición fue par).", "verificacion") for b in blocks]
            for k, b in enumerate(blocks):
                s = self.occ_stack[b.occ]
                a = self.aux(s)
                nxt = sts[k + 1] if k + 1 < len(sts) else head
                self.edge(sts[k], sts[k], END, [self.a_pop(a), self.a_push(s)],
                          f"Pasa cada {self.dn(a)} de vuelta a {self.dn(s)}.")
                self.edge(sts[k], nxt, END, [self.a_bot(a)], f"{self.dn(a)} quedó vacía.")
            canon = sts[0]
        for src, ph, guard_atoms in self.end_moves:
            tgt = canon if ph == "E" else head
            txt = "Se terminó la cadena (ϕ)."
            if guard_atoms:
                txt += f" Comprueba el tope de {', '.join(self.dn(a.stack) for a in guard_atoms)} para confirmar que se cumple la relación entre los bloques."
            if ph == "E":
                txt += " Como la última repetición fue par, primero se devuelven los conteos a las pilas principales."
            self.edge(src, tgt, END, guard_atoms, txt)
        return head

    # ------------------------------------------------------- gadgets
    def mv(self, S: str, keep: set) -> List[Atom]:
        """Desapila de S; si S se necesitará después, lo desapilado se guarda en su auxiliar."""
        if S in keep:
            return [self.a_pop(S), self.a_push(self.aux(S))]
        return [self.a_pop(S)]

    def sv(self, S: str, keep: set) -> str:
        return f" (y lo guarda en {self.dn(self.aux(S))})" if S in keep else ""

    def restore_chain(self, pairs: List[Tuple[str, str]], nxt: str, text: str) -> str:
        sts = [self.new_state(f"restaura {self.dn(m)}: devuelve lo guardado en {self.dn(a)} ({text}).") for m, a in pairs]
        for k, (m, a) in enumerate(pairs):
            after = sts[k + 1] if k + 1 < len(sts) else nxt
            self.edge(sts[k], sts[k], END, [self.a_pop(a), self.a_push(m)],
                      f"Restaura: pasa cada {self.dn(a)} de vuelta a {self.dn(m)}, porque otra restricción volverá a usar {self.dn(m)}.")
            self.edge(sts[k], after, END, [self.a_bot(a)], f"{self.dn(a)} quedó vacía: {self.dn(m)} recuperó su cuenta.")
        return sts[0]

    def chain(self, stacks: List[str], keep: set, nxt: str, text: str) -> str:
        pairs = [(s, self.aux(s)) for s in stacks if s in keep]
        return self.restore_chain(pairs, nxt, text) if pairs else nxt

    def g_range(self, entry: str, text: str, g: dict, keep: set) -> str:
        S = self.vs(g["var"])
        lo, hi = g["lo"], g["hi"]
        inf = hi is None
        N = lo - 1 if inf else hi
        v = self.stacks[S].var
        sts = [entry] + [self.new_state(f"verifica «{text}»: ya desapiló {j} símbolo(s) de {self.dn(S)}.") for j in range(1, N + 1)]
        exits = [(N, "cnt")] if inf else [(j, "bot") for j in range(lo, hi + 1)]
        nxt = self.new_state(f"«{text}» verificada.")
        R = self.chain([S], keep, nxt, text) if any(j > 0 for j, _ in exits) else nxt
        for j, kind in exits:
            dst = nxt if j == 0 else R
            if kind == "cnt":
                self.edge(sts[j], dst, END, [self.a_cnt(S)],
                          f"«{text}»: la pila {self.dn(S)} todavía tiene un símbolo en el tope, así que {v} ≥ {lo}. Se cumple.")
            else:
                self.edge(sts[j], dst, END, [self.a_bot(S)],
                          f"«{text}»: {self.dn(S)} quedó vacía tras desapilar {j}, así que {v} = {j}, y {lo} ≤ {j} ≤ {hi}. Se cumple.")
        for j in range(N):
            self.edge(sts[j], sts[j + 1], END, self.mv(S, keep),
                      f"«{text}»: desapila un símbolo de {self.dn(S)}{self.sv(S, keep)} para contarlo.")
        return nxt

    def g_mod(self, entry: str, text: str, g: dict, keep: set) -> str:
        S, c, r = self.vs(g["var"]), g["c"], g["r"]
        v = self.stacks[S].var
        sts = [entry] + [self.new_state(f"verifica «{text}»: se han desapilado ≡ {j} (mod {c}) símbolos de {self.dn(S)}.") for j in range(1, c)]
        nxt = self.new_state(f"«{text}» verificada.")
        R = self.chain([S], keep, nxt, text)
        for j in range(c):
            self.edge(sts[j], sts[(j + 1) % c], END, self.mv(S, keep),
                      f"«{text}»: desapila un símbolo de {self.dn(S)}{self.sv(S, keep)} y alterna de estado: cuenta módulo {c}.")
        self.edge(sts[r], R, END, [self.a_bot(S)],
                  f"«{text}»: {self.dn(S)} se vació justo en el estado de residuo {r}, así que {v} ≡ {r} (mod {c}). Se cumple.")
        return nxt

    def g_cmp(self, entry: str, text: str, g: dict, keep: set) -> str:
        P, Q = self.vs(g["p"]), self.vs(g["q"])
        cmp, c = g["cmp"], g["c"]
        pv, qv = g["p"], g["q"]
        pre = [entry] + [self.new_state(f"verifica «{text}»: ya quitó {j} símbolo(s) de {self.dn(P)} (el desfase {c}).") for j in range(1, c + 1)]
        L = pre[c]
        nxt = self.new_state(f"«{text}» verificada.")
        R = self.chain([P, Q], keep, nxt, text)
        for j in range(c):
            self.edge(pre[j], pre[j + 1], END, self.mv(P, keep),
                      f"«{text}»: quita {j + 1} de {c} símbolos de {self.dn(P)} (el desfase de la restricción).")
            if cmp in ("<", "<="):
                self.edge(pre[j], R, END, [self.a_bot(P)],
                          f"«{text}»: {self.dn(P)} se vació antes de quitar el desfase, así que {pv} < {qv}+{c}. Se cumple.")
        self.edge(L, L, END, self.mv(P, keep) + self.mv(Q, keep),
                  f"«{text}»: compara {pv} con {qv} símbolo a símbolo: desapila uno de {self.dn(P)} y uno de {self.dn(Q)} a la vez.")
        sh = f"{qv}+{c}" if c else qv
        if cmp in ("=", "<=", ">="):
            self.edge(L, R, END, [self.a_bot(P), self.a_bot(Q)],
                      f"«{text}»: las dos pilas se vaciaron a la vez, así que {pv} = {sh}. Se cumple.")
        if cmp in (">", ">="):
            self.edge(L, R, END, [self.a_cnt(P), self.a_bot(Q)],
                      f"«{text}»: {self.dn(Q)} se vació primero y a {self.dn(P)} le quedan símbolos, así que {pv} > {sh}. Se cumple.")
        if cmp in ("<", "<="):
            self.edge(L, R, END, [self.a_bot(P), self.a_cnt(Q)],
                      f"«{text}»: {self.dn(P)} se vació primero y a {self.dn(Q)} le quedan símbolos, así que {pv} < {sh}. Se cumple.")
        return nxt

    def g_scale(self, entry: str, text: str, g: dict, keep: set) -> str:
        P, Q = self.vs(g["p"]), self.vs(g["q"])
        al, be = g["a"], g["b"]
        n = al + be
        sts = [entry] + [self.new_state(f"verifica «{text}»: va a mitad de una vuelta ({j}/{n}).") for j in range(1, n)]
        nxt = self.new_state(f"«{text}» verificada.")
        R = self.chain([P, Q], keep, nxt, text)
        for j in range(n):
            if j < be:
                self.edge(sts[j], sts[(j + 1) % n], END, self.mv(P, keep),
                          f"«{text}»: en cada vuelta quita {be} símbolo(s) de {self.dn(P)}{self.sv(P, keep)} (ahora quita uno).")
            else:
                self.edge(sts[j], sts[(j + 1) % n], END, self.mv(Q, keep),
                          f"«{text}»: en cada vuelta quita {al} símbolo(s) de {self.dn(Q)}{self.sv(Q, keep)} (ahora quita uno).")
        self.edge(sts[0], R, END, [self.a_bot(P), self.a_bot(Q)],
                  f"«{text}»: las dos pilas se vaciaron justo al terminar una vuelta completa, así que se cumple {al}·{g['p']} = {be}·{g['q']}.")
        return nxt

    def g_sum(self, entry: str, text: str, g: dict, keep: set) -> str:
        X = self.vs(g["x"])
        terms = [self.vs(t) for t in g["terms"]]
        c = g["c"]
        n = len(terms)
        loops = [entry] + [self.new_state(f"verifica «{text}»: ya consumió {g['terms'][k - 1]} y sigue con {g['terms'][k]}.") for k in range(1, n)]
        tail = [self.new_state(f"verifica «{text}»: ya consumió los sumandos; ahora quita la constante {c}.")]
        tail += [self.new_state(f"verifica «{text}»: quitando la constante ({j}/{c}).") for j in range(1, c + 1)]
        nxt = self.new_state(f"«{text}» verificada.")
        R = self.chain([X] + terms, keep, nxt, text)
        for k in range(n):
            self.edge(loops[k], loops[k], END, self.mv(X, keep) + self.mv(terms[k], keep),
                      f"«{text}»: desapila un símbolo de {self.dn(X)} y uno de {self.dn(terms[k])} a la vez.")
            after = loops[k + 1] if k + 1 < n else tail[0]
            self.edge(loops[k], after, END, [self.a_bot(terms[k])],
                      f"«{text}»: {self.dn(terms[k])} se vació; pasa al siguiente sumando.")
        for j in range(c):
            self.edge(tail[j], tail[j + 1], END, self.mv(X, keep),
                      f"«{text}»: quita un símbolo de {self.dn(X)} por la constante.")
        self.edge(tail[c], R, END, [self.a_bot(X)],
                  f"«{text}»: {self.dn(X)} quedó vacía justo después de consumir los sumandos, así que {g['x']} = {' + '.join(g['terms'])}{' + ' + str(c) if c else ''}. Se cumple.")
        return nxt

    def uses(self, g: dict) -> set:
        return {self.vs(n) for n in names_of(g)}

    def verification(self, head: str) -> str:
        todo = []
        for text, g, hidden in self.todo:
            if g["gadget"] == "trivial":
                self.steps.append({"kind": "info", "phase": "verificacion",
                                   "text": f"La restricción «{text}» siempre se cumple (las variables son naturales): no necesita transiciones."})
            else:
                todo.append((text, g, hidden))
        uses = [self.uses(g) for _, g, _ in todo]
        gad = {"range": self.g_range, "mod": self.g_mod, "cmp": self.g_cmp, "scale": self.g_scale, "sum": self.g_sum}
        cur = head
        for k, (text, g, hidden) in enumerate(todo):
            later = set().union(*uses[k + 1:]) if k + 1 < len(uses) else set()
            keep = uses[k] & later  # solo se restauran las pilas que otra restricción volverá a usar
            tag = "Igualdad entre dos apariciones de la misma variable" if hidden else "Restricción"
            extra = f" Se restaura {', '.join(self.dn(s) for s in sorted(keep))} porque se usa después." if keep else " Es el último uso de sus pilas: se consumen sin restaurar."
            self.steps.append({"kind": "constraint", "phase": "verificacion", "constraint": text,
                               "text": f"{tag} «{text}»: se verifica con el gadget «{g['gadget']}».{extra}"})
            cur = gad[g["gadget"]](cur, text, g, keep)
        return cur

    # --------------------------------------------------------- final
    def finish(self, final: str) -> None:
        self.phase_step(
            "vaciado", "Fase 3 · Vaciar las pilas y aceptar",
            "Si todas las restricciones se cumplen se llega al estado final. Si en alguna pila pueden quedar contadores, allí un rizo los desapila (el fondo nunca se toca): se acepta con la entrada terminada y las pilas reducidas a su fondo.",
        )
        st = next(s for s in self.states if s.id == final)
        st.final = True
        st.desc = "estado final: ya se cumplieron todas las restricciones."
        self.steps.append({"kind": "final", "state": final, "phase": "vaciado",
                           "text": f"{final} es el estado de aceptación: la máquina llega aquí cuando encuentra el vacío ϕ y las restricciones se cumplen."})
        for n in self.stacks:
            ids = self.edge(final, final, END, [self.a_drain(n)],
                            f"Rizo del estado final: desapila los contadores que queden en {self.dn(n)}; el fondo se conserva.")
            for i in ids:
                self.trans[i].drain = True

    def run(self) -> Machine:
        self.plan()
        if self.simple:
            self.declare_simple()
            self.reading_simple()
        else:
            self.declare_stacks()
            self.reading_phase()
        head = self.end_phase()
        final = self.verification(head)
        self.finish(final)
        return Machine(
            states=self.states, transitions=self.trans, stacks=self.stacks, alphabet=list(self.lang.alphabet),
            initial="q0", finals=[final], steps=self.steps,
            variables={o.occ: self.dn(self.occ_stack[o.occ]) for o in self.lang.occurrences if o.occ in self.occ_stack},
            spec_text=self.lang.source,
        )


def _prune_drains(m: Machine, lang: Language) -> None:
    """Deja solo los rizos de vaciado que de verdad hacen falta.

    Se prueba con palabras del lenguaje (valores pequeños de las variables): un rizo hace falta si alguna palabra
    del lenguaje solo se acepta gracias a él. Si al quitar los demás alguna palabra deja de aceptarse, se conservan todos."""
    from .simulator import simulate
    from .validator import solutions

    drains = {t.id: next(iter(t.pops)) for t in m.transitions if t.drain}
    if not drains:
        return
    try:
        sols, _ = solutions(lang, limit=40, bound=6)
    except Exception:
        return
    words = []
    for v in sols:
        w = lang.word(v)
        if len(w) <= 40 and w not in words:
            words.append(w)
    if not words:
        return
    needed: set = set()
    for w in words:
        r = simulate(m, w)
        if not r["accepted"]:
            return  # algo raro: se deja todo como está
        for st in r["steps"]:
            if st["transition"] in drains:
                needed.add(drains[st["transition"]])
    keep = [t for t in m.transitions if not t.drain or drains[t.id] in needed]
    if len(keep) == len(m.transitions):
        return
    old = m.transitions
    m.transitions = keep
    if any(not simulate(m, w)["accepted"] for w in words):
        m.transitions = old
        return
    remap = {t.id: k for k, t in enumerate(keep)}
    for t in keep:
        t.id = remap[t.id]
    for st in m.steps:
        if "transitions" in st:
            st["transitions"] = [remap[i] for i in st["transitions"] if i in remap]
    m.steps = [st for st in m.steps if st.get("kind") != "edge" or st["transitions"]]


def build(lang: Language) -> Machine:
    declared: set = set()
    for _ in range(4):
        b = Builder(lang, declared)
        m = b.run()
        if b.aux_used <= declared:
            _prune_drains(m, lang)
            complete_notation(m)
            for st in m.steps:  # las etiquetas de la construcción se recalculan con la notación final
                if "transitions" in st:
                    st["labels"] = [label(m.transitions[i], m.stacks) for i in st["transitions"]]
            return m
        declared |= b.aux_used
    raise RuntimeError("no se pudieron declarar las pilas auxiliares")