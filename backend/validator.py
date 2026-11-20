"""Validación del alfabeto y del lenguaje (RF-01, RF-02, RF-04) y generación de palabras.

Además de revisar la sintaxis, se comprueba que las indicaciones tengan sentido:
  * todos los símbolos del patrón pertenecen al alfabeto (RF-04);
  * todas las variables de las restricciones aparecen en el patrón;
  * las restricciones no se contradicen (existe al menos una palabra);
  * dentro de un grupo repetido ningún exponente puede valer 0 (si no, las
    repeticiones serían invisibles y el conteo de k no se podría verificar).
"""
from __future__ import annotations

from itertools import product
from typing import Dict, List, Optional, Tuple

from .language import LangError, Language, classify, parse_alphabet, parse_language

MAX_STATES_HINT = 60  # constantes grandes (n > 50) generan una cadena de estados enorme
MAX_NODES = 1_500_000


def _bound(lang: Language) -> int:
    big = 0
    for c in lang.constraints:
        if c.kind == "mod":
            big = max(big, c.mod[1] + c.mod[2])
        else:
            big = max(big, int(abs(c.const)), *(int(abs(k)) for k in c.lin.values()), 0)
    return 10 + 2 * big


def solutions(lang: Language, limit: Optional[int] = None, fixed: Optional[Dict[str, int]] = None,
              bound: Optional[int] = None) -> Tuple[List[Dict[str, int]], bool]:
    """Busca asignaciones de las variables (0..bound) que cumplen TODAS las restricciones.

    Devuelve (lista de asignaciones, completo) donde `completo` es False si se cortó
    por `limit` o por el límite de trabajo.
    """
    bound = _bound(lang) if bound is None else bound
    vars_ = lang.variables
    cons = lang.constraints
    # cada restricción se evalúa en cuanto sus variables ya tienen valor
    ready: List[List] = [[] for _ in vars_]
    for c in cons:
        idx = max(vars_.index(v) for v in c.variables()) if c.variables() else 0
        ready[idx].append(c)
    out: List[Dict[str, int]] = []
    nodes = 0
    complete = True
    vals: Dict[str, int] = {}

    def rec(i: int) -> bool:
        nonlocal nodes, complete
        if i == len(vars_):
            out.append(dict(vals))
            return limit is not None and len(out) >= limit
        v = vars_[i]
        rng = [fixed[v]] if fixed and v in fixed else range(bound + 1)
        for x in rng:
            nodes += 1
            if nodes > MAX_NODES:
                complete = False
                return True
            vals[v] = x
            if all(c.holds(vals) for c in ready[i]):
                if rec(i + 1):
                    return True
        vals.pop(v, None)
        return False

    stopped = rec(0)
    if stopped and limit is not None and len(out) >= limit:
        complete = False
    return out, complete


def word_from_values(lang: Language, values: Dict[str, int]) -> dict:
    """La palabra que corresponde a unos valores elegidos, o qué restricciones se violan."""
    errors: List[str] = []
    vals: Dict[str, int] = {}
    for v in lang.variables:
        raw = values.get(v)
        if raw is None or str(raw).strip() == "":
            errors.append(f"Falta el valor de {v}.")
            continue
        try:
            x = int(raw)
        except (TypeError, ValueError):
            errors.append(f"El valor de {v} debe ser un número entero.")
            continue
        if x < 0:
            errors.append(f"El valor de {v} no puede ser negativo.")
            continue
        vals[v] = x
    if errors:
        return {"ok": False, "word": None, "errors": errors, "violated": []}
    violated = [c.text for c in lang.constraints if not c.holds(vals)]
    if violated:
        return {"ok": False, "word": None, "errors": [], "violated": violated, "values": vals}
    return {"ok": True, "word": lang.word(vals), "errors": [], "violated": [], "values": vals}


def compile_spec(alphabet_text: str, language_text: str) -> dict:
    """Valida y compila los datos de entrada.

    Devuelve {"ok", "errors", "warnings", "alphabet", "language", "variables", "constraints", "examples"}.
    `language` es el objeto Language (solo para uso interno del backend).
    """
    result = {
        "ok": False, "errors": [], "warnings": [], "alphabet": [], "language": None,
        "pattern": "", "variables": [], "constraints": [], "examples": [],
    }
    try:
        alphabet = parse_alphabet(alphabet_text)
    except LangError as e:
        result["errors"] += e.errors
        alphabet = None
    if alphabet is not None:
        result["alphabet"] = alphabet

    try:
        lang = parse_language(language_text, alphabet or [])
    except LangError as e:
        result["errors"] += e.errors
        return result
    if alphabet is None:
        return result

    errors: List[str] = result["errors"]
    warnings: List[str] = result["warnings"]
    result["pattern"] = lang.pattern_text
    result["variables"] = lang.variables

    # RF-04: todos los símbolos del lenguaje pertenecen al alfabeto
    used = []
    for b in lang.blocks:
        if b.symbol not in used:
            used.append(b.symbol)
    missing = [s for s in used if s not in alphabet]
    if missing:
        errors.append(
            "Los símbolos " + ", ".join(f"«{s}»" for s in missing)
            + " del lenguaje no pertenecen al alfabeto Σ = {" + ", ".join(alphabet) + "}."
        )
    unused = [s for s in alphabet if s not in used]
    if unused:
        warnings.append("Los símbolos " + ", ".join(f"«{s}»" for s in unused)
                        + " del alfabeto no se usan en el lenguaje (el autómata rechazará cualquier cadena que los tenga).")

    # restricciones: variables conocidas y soportadas
    gadgets = []
    for c in lang.constraints:
        unknown = [v for v in c.variables() if v not in lang.variables]
        if unknown:
            errors.append(
                f"La restricción «{c.text}» usa la variable {', '.join(unknown)}, que no aparece como exponente en el lenguaje."
            )
            continue
        try:
            g = classify(c)
        except LangError as e:
            errors += e.errors
            continue
        if g["gadget"] == "false":
            errors.append(f"La restricción «{c.text}» no la puede cumplir ningún valor natural.")
        if g["gadget"] == "trivial":
            warnings.append(f"La restricción «{c.text}» siempre se cumple (las variables son naturales): no genera transiciones.")
        size = g.get("hi") or g.get("lo") or 0
        if g["gadget"] == "range" and size > MAX_STATES_HINT:
            errors.append(f"La constante de «{c.text}» es demasiado grande ({size}): el autómata necesitaría más de {MAX_STATES_HINT} estados.")
        elif g["gadget"] == "range" and size > 12:
            warnings.append(f"La constante de «{c.text}» es grande ({size}): el diagrama tendrá muchos estados seguidos.")
        gadgets.append({"text": c.text, "gadget": g["gadget"]})
    result["constraints"] = gadgets
    if errors:
        return result

    # ¿las indicaciones se contradicen?
    sols, complete = solutions(lang, limit=1)
    if not sols:
        if complete:
            errors.append("Las restricciones se contradicen: no existe ninguna combinación de valores que las cumpla todas.")
        else:
            warnings.append("No se pudo comprobar si las restricciones se contradicen (el espacio de búsqueda es muy grande).")
    elif lang.group:
        g = lang.group
        gvars = [b.var for b in lang.blocks if b.in_group] + [g.var]
        for v in dict.fromkeys(gvars):
            zero, _ = solutions(lang, limit=1, fixed={v: 0})
            if zero:
                what = "el número de repeticiones del grupo" if v == g.var else "el exponente dentro del grupo repetido"
                errors.append(
                    f"{v} puede valer 0 ({what}). Agrega la restricción {v}>0 para que las repeticiones sean visibles."
                )

    if errors:
        return result

    result["ok"] = True
    result["language"] = lang
    # ejemplos: las palabras más cortas del lenguaje
    allsols, _ = solutions(lang, limit=400)
    seen, ex = set(), []
    for s in sorted(allsols, key=lambda s: (len(lang.word(s)), sorted(s.items()))):
        w = lang.word(s)
        if w in seen:
            continue
        seen.add(w)
        ex.append({"values": s, "word": w})
        if len(ex) >= 6:
            break
    result["examples"] = ex
    return result
