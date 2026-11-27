"""Autómatas de pila DIBUJADOS A MANO por el estudiante.

El frontend manda los estados (círculos) y, por cada flecha, las líneas de transición escritas con la misma
notación que usa la plataforma (ver notation.py):

      leído, tope, apila   ·   varias pilas separadas por « ; »   ·   X₀X ; Y₀Y  (primera transición)
      El fondo (X₀) es el nombre de la pila: nunca se apila ni se desapila; solo se apilan y desapilan contadores X.

Aquí se traduce ese texto a un `Machine`, se simula con el MISMO simulador de la plataforma y se
verifica contra el lenguaje (palabras que SÍ y que NO pertenecen).

Símbolos de pila: una letra mayúscula (X, Y, Z...); con 0 es el fondo (X₀); X_A / X_A₀ son los de la auxiliar.
Casos especiales: ∅ = la pila todavía no existe (debe estar vacía), ε = desapilar, ϕ = fin de la entrada, λ = no lee.
"""
from __future__ import annotations

import re
import time
from collections import deque
from itertools import product
from typing import Dict, List, Optional, Set, Tuple

from . import exporters
from .language import LangError, parse_alphabet
from .models import END, Machine, State, Transition, make_stack
from .notation import label
from .simulator import simulate
from .validator import compile_spec, solutions

TOKEN = r"[A-Z](?:_A)?0?"
_TOK = re.compile(TOKEN)
_INIT = re.compile(r"([A-Z])(_A)?0(?:([A-Z])(_A)?)?")
_SYM = re.compile(r"([A-Z])(_A)?(0)?")
EMPTY_ALIASES = {"∅", "Ø", "ø"}
END_ALIASES = {"ϕ", "φ", "ᵩ", "phi", "fi", "vacio", "vacío"}
LAMBDA_ALIASES = {"λ", "lambda"}
POP_ALIASES = {"ε", "eps", "epsilon", "desapilo", "desapila"}


class HandError(Exception):
    def __str__(self) -> str:  # los mensajes muestran X₀ y no X0
        return re.sub(r"\b([A-Z](?:_A)?)0\b", r"\1₀", super().__str__())


def _norm(s: str) -> str:
    s = s.replace("₀", "0").replace("＿", "_").strip()
    return re.sub(r"(?<![A-Za-z_])([A-Z](?:_A)?)o(?![a-z])", r"\g<1>0", s)  # «Xo» se entiende como X₀


def _stack_of(tok: str) -> Tuple[str, bool]:
    """'X' -> ('X', False)   'X0' -> ('X', True)   'X_A' -> ('XA', False)   'X_A0' -> ('XA', True)"""
    m = _SYM.fullmatch(tok)
    if not m:
        raise HandError(f"«{tok}» no es un símbolo de pila válido (usa X, X₀, Y, Y₀… o X_A, X_A₀ para la auxiliar).")
    return m.group(1) + ("A" if m.group(2) else ""), bool(m.group(3))


def _sym_id(tok: str) -> Tuple[str, str]:
    name, bottom = _stack_of(tok)
    return name, name + ("0" if bottom else "")


def _tokens(text: str, what: str) -> List[str]:
    flat = re.sub(r"\s+", "", text)
    toks = _TOK.findall(flat)
    if not toks or "".join(toks) != flat:
        raise HandError(f"No entiendo «{text.strip()}» en {what}: escribe símbolos como X, X₀, Y₀… separados por espacio.")
    return toks


def parse_line(text: str, alphabet: List[str]) -> dict:
    """Una línea de transición -> {"read", "pops", "pushes", "empties", "init"}. Lanza HandError si no se entiende."""
    raw = _norm(text)
    if not raw:
        raise HandError("La transición está vacía.")
    parts = [p.strip() for p in raw.split(";") if p.strip()]
    if not parts:
        raise HandError("La transición está vacía.")

    pops: Dict[str, str] = {}
    pushes: Dict[str, List[str]] = {}
    empties: List[str] = []
    reads = set()
    all_init = True
    swapped = False

    for p in parts:
        if "," not in p and (p in alphabet or p in END_ALIASES or p in LAMBDA_ALIASES):
            # solo se lee algo y no se toca ninguna pila:  ϕ   o   0   o   λ
            all_init = False
            reads.add(END if p in END_ALIASES else "λ" if p in LAMBDA_ALIASES else p)
            continue
        if "," not in p:  # forma corta de la primera transición:  X₀X
            m = _INIT.fullmatch(re.sub(r"\s+", "", p))
            if not m:
                raise HandError(f"No entiendo «{p}». Usa «leído, tope, apila» (p. ej. 0, X₀, X₀X) o «X₀X» para declarar una pila.")
            stack = m.group(1) + ("A" if m.group(2) else "")
            if m.group(3) and (m.group(3) + ("A" if m.group(4) else "")) != stack:
                raise HandError(f"En «{p}» el fondo y el símbolo deben ser de la misma pila (X₀X, Y₀Y…).")
            if stack in pushes:
                raise HandError(f"La pila {stack} aparece dos veces en la misma transición.")
            pushes[stack] = [stack + "0"]
            empties.append(stack)
            reads.add("λ")
            continue

        all_init = False
        fields = [f.strip() for f in p.split(",")]
        if len(fields) != 3:
            raise HandError(f"«{p}» debe tener 3 partes separadas por coma: leído, tope, apila.")
        read, top, push = fields
        if read not in alphabet and read not in END_ALIASES and read not in LAMBDA_ALIASES \
                and (top in alphabet or top in END_ALIASES or top in LAMBDA_ALIASES) \
                and (top not in EMPTY_ALIASES and (read in EMPTY_ALIASES or _SYM.fullmatch(read))):
            read, top = top, read  # orden antiguo (tope, leído, apila): se entiende, pero se avisa
            swapped = True

        # ---- leído
        if read in END_ALIASES:
            read = END
        elif read in LAMBDA_ALIASES:
            read = "λ"
        elif read in POP_ALIASES or read in EMPTY_ALIASES:
            raise HandError(f"En «{p}» lo leído no puede ser «{read}»: usa un símbolo del alfabeto, ϕ (fin de la entrada) o λ (no lee).")
        elif read not in alphabet:
            raise HandError(f"En «{p}» lo leído, «{read}», no está en el alfabeto Σ = {{{', '.join(alphabet)}}} (ni es ϕ ni λ).")
        reads.add(read)

        # ---- apila
        pop_push = push in POP_ALIASES
        push_toks = [] if pop_push else _tokens(push, f"«{p}» (lo que se apila)")

        # ---- tope
        if top in EMPTY_ALIASES:
            if pop_push:
                raise HandError(f"En «{p}»: con ∅ (pila sin crear) tienes que apilar algo, no ε.")
            stack = _stack_of(push_toks[0])[0]
            empties.append(stack)
        else:
            if not _SYM.fullmatch(top):
                raise HandError(f"En «{p}» el tope «{top}» no es válido: usa X, X₀, Y… o ∅ si la pila todavía no existe.")
            stack, sid = _sym_id(top)
            pops_id = sid
        for t in push_toks:
            if _stack_of(t)[0] != stack:
                raise HandError(f"En «{p}» mezclas símbolos de dos pilas ({stack} y {_stack_of(t)[0]}). Cada parte separada por « ; » es de UNA sola pila.")
        # el apilado se escribe de ABAJO hacia ARRIBA (X₀X: la X queda sobre el fondo); también se tolera el orden inverso
        if len(push_toks) > 1 and not _stack_of(push_toks[0])[1] and _stack_of(push_toks[-1])[1]:
            push_toks = push_toks[::-1]
        bottoms_in = [i for i, t in enumerate(push_toks) if _stack_of(t)[1]]
        if bottoms_in and bottoms_in != [0]:
            raise HandError(f"En «{p}» el fondo solo puede ir al principio de lo que se apila (X₀X: primero el fondo, después lo que queda encima).")
        top_is_bottom = top not in EMPTY_ALIASES and _stack_of(top)[1]
        if pop_push and top_is_bottom:
            raise HandError(f"En «{p}» no se puede desapilar el fondo {top}: el fondo es el nombre de la pila y nunca se apila ni se desapila. "
                            f"Para no hacer nada en esa pila escribe «leído, {top}, {top}».")
        if top not in EMPTY_ALIASES and top_is_bottom and (not bottoms_in):
            raise HandError(f"En «{p}» el fondo {top} no puede cambiarse: déjalo y apila encima ({top}X) o escribe «leído, {top}, {top}».")
        if top not in EMPTY_ALIASES and not top_is_bottom and bottoms_in:
            raise HandError(f"En «{p}» el fondo no se vuelve a apilar: solo se escribe cuando la pila se crea (∅ o la primera transición X₀X).")
        if top in EMPTY_ALIASES and not bottoms_in:
            raise HandError(f"En «{p}» una pila que todavía no existe se crea con su fondo (leído, ∅, X₀).")
        if stack in pushes or stack in pops:
            raise HandError(f"La pila {stack} aparece dos veces en la misma transición.")
        if top not in EMPTY_ALIASES:
            pops[stack] = pops_id
        pushes[stack] = [_sym_id(t)[1] for t in reversed(push_toks)]  # internamente: primero = tope

    if len(reads) > 1:
        raise HandError("Todas las partes de una transición deben leer lo mismo (cada una repite el símbolo leído).")
    read = reads.pop()
    return {
        "read": None if read == "λ" else read,
        "pops": pops, "pushes": pushes, "empties": empties,
        "init": all_init, "swapped": swapped,
    }


def _public_stacks(names: List[str]):
    out = {}
    for n in sorted(names, key=lambda x: (x[0], len(x))):
        if n.endswith("A") and len(n) == 2:
            out[n] = make_stack(n, n[0], "aux", n[0])
        else:
            out[n] = make_stack(n, n, "count")
    return out


def compile_hand(payload: dict, alphabet: List[str]) -> Tuple[Optional[Machine], List[dict], List[str], Dict[int, dict]]:
    """Devuelve (máquina | None, errores, avisos, meta). meta[id_transición] = {"edge", "line"}."""
    errors: List[dict] = []
    warnings: List[str] = []
    meta: Dict[int, dict] = {}

    states = payload.get("states") or []
    ids = [s.get("id") for s in states]
    if not states:
        errors.append({"message": "Dibuja al menos un estado."})
    if len(set(ids)) != len(ids):
        errors.append({"message": "Hay dos estados con el mismo nombre."})
    initials = [s["id"] for s in states if s.get("initial")]
    if states and len(initials) != 1:
        errors.append({"message": "Marca exactamente un estado inicial." if not initials else "Hay más de un estado inicial."})
    finals = [s["id"] for s in states if s.get("final")]
    if states and not finals:
        warnings.append("No hay estados finales: ninguna cadena podrá aceptarse.")

    old_order = False
    trans: List[Transition] = []
    used_stacks: Dict[str, None] = {}
    for k, t in enumerate(payload.get("transitions") or [], start=1):
        src, dst = t.get("src"), t.get("dst")
        if src not in ids or dst not in ids:
            continue
        try:
            p = parse_line(t.get("text", ""), alphabet)
        except HandError as e:
            errors.append({"edge": t.get("edge"), "line": t.get("line"), "message": str(e)})
            continue
        if p.get("swapped"):
            old_order = True
        for s in list(p["pops"]) + list(p["pushes"]) + list(p["empties"]):
            used_stacks[s] = None
        trans.append(Transition(id=k, src=src, dst=dst, read=p["read"], pops=p["pops"], pushes=p["pushes"], empties=p["empties"]))
        meta[k] = {"edge": t.get("edge"), "line": t.get("line")}
    if errors:
        return None, errors, warnings, meta
    if old_order:
        warnings.append("Algunas transiciones están escritas en el orden antiguo (tope, leído, apila). Se entendieron, "
                        "pero escríbelas como «leído, tope, apila» (p. ej. 0, X₀, X₀X).")

    # una pila auxiliar X_A solo tiene sentido junto a su principal, pero no se obliga
    stacks = _public_stacks(list(used_stacks))
    m = Machine(
        states=[State(id=s["id"], desc="", phase="", initial=bool(s.get("initial")), final=bool(s.get("final"))) for s in states],
        transitions=trans, stacks=stacks, alphabet=alphabet, initial=initials[0], finals=finals, steps=[], variables={},
    )
    return m, errors, warnings, meta


def _alphabet(text: str) -> Tuple[List[str], List[dict]]:
    try:
        return parse_alphabet(text), []
    except LangError as e:
        return [], [{"message": m} for m in e.errors]


def validate(payload: dict) -> dict:
    alphabet, errs = _alphabet(payload.get("alphabet", ""))
    if errs:
        return {"ok": False, "errors": errs, "warnings": [], "parsed": []}
    m, errors, warnings, meta = compile_hand(payload, alphabet)
    parsed = []
    if m:
        for t in m.transitions:
            parsed.append({"edge": meta[t.id]["edge"], "line": meta[t.id]["line"], "label": label(t, m.stacks)})
    return {"ok": not errors, "errors": errors, "warnings": warnings, "parsed": parsed}


def simulate_hand(payload: dict, word: str) -> dict:
    alphabet, errs = _alphabet(payload.get("alphabet", ""))
    if errs:
        return {"ok": False, "errors": errs}
    bad = sorted({c for c in word if c not in alphabet})
    if bad:
        return {"ok": False, "errors": [{"message": "La cadena tiene símbolos que no están en el alfabeto: " + ", ".join(f"«{c}»" for c in bad) + "."}]}
    m, errors, warnings, _ = compile_hand(payload, alphabet)
    if errors:
        return {"ok": False, "errors": errors}
    r = simulate(m, word, max_configs=100_000)
    return {"ok": True, "warnings": warnings, "stacks": [d.public() for d in m.stacks.values()], **r}


# --------------------------------------------------------------- verificación
# --------------------------------------------------------------- validación
MAX_TEST_LEN = 12      # tope del largo de las cadenas que se prueban TODAS (así se sabe con certeza si pertenecen o no)
MAX_STRINGS = 3500     # tope de cadenas a probar (depende del tamaño del alfabeto)
TIME_BUDGET = 5.0      # segundos: la validación no debe colgar el servidor
MAX_FAILS = 40         # se deja de probar cuando ya hay suficientes errores para explicar


def _pretty_vals(vals: Dict[str, int]) -> str:
    return ", ".join(f"{k}={v}" for k, v in vals.items())


def _decompose(lang, word: str) -> Optional[Dict[str, int]]:
    """Valores de las variables con los que el patrón produce exactamente `word` (sin mirar restricciones)."""
    vs = lang.variables
    if len(vs) > 5:
        return None
    for vals in product(range(len(word) + 1), repeat=len(vs)):
        d = dict(zip(vs, vals))
        if lang.word(d) == word:
            return d
    return None


_SUP = {"n": "ⁿ", "m": "ᵐ", "k": "ᵏ", "i": "ⁱ", "j": "ʲ", "p": "ᵖ", "r": "ʳ", "q": "ᵠ"}


def _pretty_pattern(text: str) -> str:
    return re.sub(r"\^\{?([a-z])\}?", lambda mo: _SUP.get(mo.group(1), mo.group(0)), text).replace(" ", "")


def explain_non_member(lang, word: str) -> str:
    """Por qué una cadena NO pertenece al lenguaje (para decirle al estudiante qué está pasando)."""
    shown = f"«{word}»" if word else "La cadena vacía"
    d = _decompose(lang, word)
    if d is None:
        return (f"{shown} no tiene la forma {_pretty_pattern(lang.pattern_text)}: los bloques van en ese orden y los que comparten "
                "variable deben tener la misma cantidad de símbolos.")
    bad = [c.text for c in lang.constraints if not c.holds(d)]
    return f"{shown} tiene la forma del lenguaje con {_pretty_vals(d)}, pero no cumple: {', '.join(bad) if bad else 'las restricciones'}."


def static_diagnostics(m: Machine) -> List[dict]:
    """Problemas que se ven en el dibujo sin simular nada."""
    out: List[dict] = []
    by: Dict[str, List[Transition]] = {}
    for t in m.transitions:
        by.setdefault(t.src, []).append(t)
    seen: Set[str] = {m.initial}
    queue = deque([m.initial])
    while queue:
        cur = queue.popleft()
        for t in by.get(cur, []):
            if t.dst not in seen:
                seen.add(t.dst)
                queue.append(t.dst)
    lost = [s.id for s in m.states if s.id not in seen]
    if lost:
        out.append({"level": "warn", "message": "No se puede llegar desde el estado inicial a: " + ", ".join(lost) + ". Revisa que estén conectados con flechas."})
    if not any(f in seen for f in m.finals):
        out.append({"level": "error", "message": "Ningún estado final se puede alcanzar desde el estado inicial: el autómata nunca aceptará una cadena."})
    stuck = [s.id for s in m.states if s.id in seen and not by.get(s.id) and s.id not in m.finals]
    if stuck:
        out.append({"level": "warn", "message": "Estados sin flechas de salida que no son finales: " + ", ".join(stuck) + "."})
    for name, d in m.stacks.items():
        pushed = any(d.counter in t.pushes.get(name, []) for t in m.transitions)
        popped = any(t.pops.get(name) == d.counter and d.counter not in t.pushes.get(name, []) for t in m.transitions)
        if pushed and not popped:
            out.append({"level": "warn", "message": f"En la pila {d.show_counter} se apilan {d.show_counter} pero ninguna transición los desapila (X, leído, ε): solo se acepta si al final queda únicamente el fondo {d.show_bottom}."})
        created = any(d.bottom in t.pushes.get(name, []) and (name in t.empties) for t in m.transitions)
        if not created:
            out.append({"level": "warn", "message": f"Ninguna transición crea la pila {d.show_counter} (por ejemplo con {d.show_bottom}{d.show_counter} o ∅, leído, {d.show_bottom}): sus transiciones nunca podrán aplicarse."})
    if m.stacks and not any(t.read == END for t in m.transitions):
        out.append({"level": "warn", "message": "Ninguna transición lee ϕ (fin de la entrada). La transición que llega al estado final suele leer ϕ (por ejemplo X₀, ϕ, X₀)."})
    return out


def check_hand(payload: dict, alphabet_text: str, language_text: str) -> dict:
    """Registra y valida el autómata dibujado contra el lenguaje.

    Se prueban TODAS las cadenas del alfabeto hasta un largo L (el mayor posible dentro del presupuesto) más varias
    palabras más largas del lenguaje. Como todas se clasifican con certeza (pertenece / no pertenece), se puede decir
    exactamente qué palabras acepta de más o rechaza de menos, y por qué.
    """
    t0 = time.monotonic()
    spec = compile_spec(alphabet_text, language_text)
    if not spec["ok"]:
        msgs = [{"message": e} for e in spec["errors"]] or [{"message": "Primero escribe o genera un alfabeto y un lenguaje válidos a la izquierda."}]
        return {"ok": False, "errors": msgs}
    lang = spec["language"]
    alphabet = spec["alphabet"]
    m, errors, warnings, _ = compile_hand({**payload, "alphabet": alphabet_text}, alphabet)
    if errors:
        return {"ok": False, "errors": errors}

    # largo L tal que todas las cadenas de largo <= L caben en el presupuesto
    a = max(1, len(alphabet))
    L, total = 0, 1
    while L < MAX_TEST_LEN and total + a ** (L + 1) <= MAX_STRINGS:
        L += 1
        total += a ** L
    L = max(L, 4)
    sols_short, _ = solutions(lang, bound=L)
    member = {lang.word(s) for s in sols_short}

    # palabras del lenguaje más largas que L (para comprobar que escala), repartidas
    sols_long, _ = solutions(lang, limit=800, bound=max(16, L))
    long_words = sorted({lang.word(s) for s in sols_long if L < len(lang.word(s)) <= 40}, key=lambda w: (len(w), w))
    if len(long_words) > 12:
        step = len(long_words) / 12
        long_words = [long_words[int(i * step)] for i in range(12)]

    tests: List[Tuple[str, bool]] = [("", "" in member)]
    for n in range(1, L + 1):
        for tup in product(alphabet, repeat=n):
            w = "".join(tup)
            tests.append((w, w in member))
    tests += [(w, True) for w in long_words]

    missed: List[dict] = []
    extra: List[dict] = []
    tested = ok_members = ok_rejects = 0
    inconclusive = 0
    truncated = False
    for w, expected in tests:
        if time.monotonic() - t0 > TIME_BUDGET or len(missed) + len(extra) >= MAX_FAILS:
            truncated = True
            break
        r = simulate(m, w, max_configs=20_000)
        tested += 1
        got = r["accepted"]
        if got == expected:
            ok_members += expected
            ok_rejects += (not expected)
            continue
        if expected:  # debía aceptar y rechazó
            d = _decompose(lang, w) if len(w) <= MAX_TEST_LEN else None
            missed.append({"word": w, "values": d or {}, "reason": r["reason"], "limit": r["limit_reached"]})
        else:  # debía rechazar y aceptó
            extra.append({"word": w, "why": explain_non_member(lang, w)})
        if r["limit_reached"] and expected:
            inconclusive += 1

    all_ok = not missed and not extra and not truncated
    diagnostics = static_diagnostics(m)
    return {
        "ok": True, "warnings": warnings, "diagnostics": diagnostics,
        "all_ok": all_ok, "tested": tested, "total": len(tests), "max_len": L,
        "long_tested": len([1 for w in long_words]),
        "accepted_members": ok_members, "rejected_nonmembers": ok_rejects,
        "missed": missed[:10], "missed_total": len(missed),
        "extra": extra[:10], "extra_total": len(extra),
        "truncated": truncated, "inconclusive": inconclusive,
        "stacks": [d.public() for d in m.stacks.values()],
        # lo que necesita el visor del autómata registrado (diagrama, tabla, definición formal, ejemplos)
        "view": {
            "automaton": exporters.automaton(m),
            "table": exporters.table(m),
            "formal": exporters.formal(m),
            "steps": [],
            "examples": spec["examples"],
            "variables": spec["variables"],
            "pattern": spec["pattern"],
        },
    }