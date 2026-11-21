"""Funciones puras que usa la API (se pueden probar sin levantar el servidor)."""
from __future__ import annotations

from typing import Dict, Optional

from . import exporters
from .builder import build
from .simulator import simulate
from .validator import compile_spec, word_from_values


def _check(alphabet: str, language: str) -> dict:
    return compile_spec(alphabet, language)


def validate(alphabet: str, language: str) -> dict:
    r = _check(alphabet, language)
    r.pop("language", None)
    return r


def build_machine(alphabet: str, language: str) -> dict:
    r = _check(alphabet, language)
    lang = r.pop("language", None)
    if not r["ok"]:
        return {**r, "automaton": None, "steps": [], "table": [], "formal": None}
    m = build(lang)
    return {
        **r,
        "automaton": exporters.automaton(m),
        "steps": m.steps,
        "table": exporters.table(m),
        "formal": exporters.formal(m),
    }


def run_word(alphabet: str, language: str, word: str) -> dict:
    r = _check(alphabet, language)
    lang = r.pop("language", None)
    if not r["ok"]:
        return {"ok": False, "errors": r["errors"]}
    bad = sorted({c for c in word if c not in r["alphabet"]})
    if bad:
        return {"ok": False, "errors": [
            "La cadena tiene símbolos que no están en el alfabeto: " + ", ".join(f"«{c}»" for c in bad) + "."
        ]}
    m = build(lang)
    return {"ok": True, **simulate(m, word)}


def make_word(alphabet: str, language: str, values: Dict[str, object]) -> dict:
    r = _check(alphabet, language)
    lang = r.pop("language", None)
    if not r["ok"]:
        return {"ok": False, "errors": r["errors"], "word": None, "violated": [], "values": {}, "auto": [], "notes": []}
    return word_from_values(lang, values)