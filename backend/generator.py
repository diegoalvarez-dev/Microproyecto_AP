"""Generador de ejercicios aleatorios para practicar (fácil / medio / difícil)."""
from __future__ import annotations

import random
from typing import Callable, Dict, List, Optional

from .validator import compile_spec

LEVELS = ("facil", "medio", "dificil")
LEVEL_NAMES = {"facil": "Fácil", "medio": "Medio", "dificil": "Difícil"}
SYMBOL_SETS = [list("012345"), list("abcdef"), list("xyzwuv")]
MAX_EXAMPLE_LEN = 40  # la palabra más corta del ejercicio no debe ser enorme (para poder simularla)


def builder_text(b: dict) -> str:
    """El mismo texto que arma el constructor del frontend (builderToText)."""
    blocks = [x for x in b["blocks"] if x["sym"] and x["v"]]
    items = [f"{x['sym']}^{x['v']}" for x in blocks]
    g = b.get("group")
    if g:
        pattern = " ".join(items[: g["from"]] + [f"({' '.join(items[g['from']: g['to'] + 1])})^{g['v']}"] + items[g["to"] + 1:])
    else:
        pattern = " ".join(items)
    cons = [c.strip() for c in b["cons"] if c.strip()]
    return f"{pattern} | {', '.join(cons)}" if cons else pattern


Template = Callable[[random.Random], dict]


def _t(vars_: List[str], cons: List[str], group: Optional[dict] = None) -> dict:
    return {"vars": vars_, "cons": cons, "group": group}


def _easy() -> List[Template]:
    return [
        lambda r: _t(["n", "n"], ["n>0"]),
        lambda r: _t(["n", "m"], ["n>0", f"m=n+{r.choice([1, 2, 3])}"]),
        lambda r: _t(["n", "m"], ["n>0", "m>n"]),
        lambda r: _t(["n", "m"], ["n>0", f"m={r.choice([2, 3])}n"]),
        lambda r: _t(["n", "m"], ["n>0", "n par", "m=n"]),
        lambda r: _t(["n", "m"], ["n>0", f"m>{r.choice([1, 2])}", r.choice(["m par", "m impar"])]),
        lambda r: _t(["n", "m"], [f"n>{r.choice([1, 2])}", "m=n-1"]),
        lambda r: _t(["n", "m"], ["n>0", "m<n"]),
    ]


def _medium() -> List[Template]:
    return [
        lambda r: _t(["n", "m", "k"], ["n>0", "n par", "m>n", "m par", "k=m/2"]),
        lambda r: _t(["n", "m", "k"], ["n>0", f"m=n+{r.choice([1, 2])}", "k=n+m"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m>n", "k=n+m"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m=2n", "k=n"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m>n", "k=m-n"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "n impar", "m=n+1", "k=m/2"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m>n", "k>m", "k par"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m=n", "k=2n"]),
        lambda r: _t(["n", "m", "k"], ["n>0", f"m>{r.choice([1, 2])}", "k=m", "k impar"]),
        lambda r: _t(["n", "m", "k"], ["n>0", "m par", "m>n", "k=n"]),
    ]


def _hard() -> List[Template]:
    return [
        lambda r: _t(["n", "m"], ["n>0", "m>1", r.choice(["k=n", "k=m", "k=n+1"])], {"from": 0, "to": 1, "v": "k"}),
        lambda r: _t(["n", "m"], ["n>0", "m>n", "k par", "k>1"], {"from": 0, "to": 1, "v": "k"}),
        lambda r: _t(["n", "m", "k", "p"], ["n>0", "m>n", "k=n+m", "p=k/2"]),
        lambda r: _t(["n", "m", "k", "p"], ["n>0", "n par", "m=2n", "k=n+m", "p=m/2"]),
        lambda r: _t(["n", "m", "k"], [f"n mod {r.choice([2, 3])} = 1", "m=2n", "k>m"]),
        lambda r: _t(["n", "m", "p"], ["n>0", "m>n", "k=2", "p=k+n"], {"from": 0, "to": 1, "v": "k"}),
        lambda r: _t(["n", "m", "k", "p"], ["n>0", "m=n+1", "k=m", "p=n+k"]),
        lambda r: _t(["n", "m"], ["n>0", "m>n", "m par", "k=n"], {"from": 0, "to": 1, "v": "k"}),
    ]


TEMPLATES: Dict[str, List[Template]] = {"facil": _easy(), "medio": _medium(), "dificil": _hard()}


def _make(level: str, rng: random.Random) -> dict:
    t = rng.choice(TEMPLATES[level])(rng)
    syms_pool = rng.choice(SYMBOL_SETS)
    n_blocks = len(t["vars"])
    syms = rng.sample(syms_pool[:4] if rng.random() < 0.6 else syms_pool, n_blocks)
    if rng.random() < 0.75:  # lo más común en clase: símbolos en orden (0, 1, 2 / a, b, c)
        syms = sorted(syms, key=syms_pool.index)
    blocks = [{"sym": s, "v": v} for s, v in zip(syms, t["vars"])]
    group = dict(t["group"]) if t["group"] else None
    alphabet = "{" + ", ".join(syms) + "}"
    return {"alphabet": alphabet, "builder": {"blocks": blocks, "group": group, "cons": list(t["cons"])}}


def generate(level: str = "medio", seed: Optional[int] = None, avoid: str = "") -> dict:
    """Un ejercicio válido del nivel pedido. `avoid` es el lenguaje anterior (para no repetirlo seguido)."""
    level = level if level in LEVELS else "medio"
    rng = random.Random(seed)
    last = None
    for _ in range(80):
        ex = _make(level, rng)
        text = builder_text(ex["builder"])
        r = compile_spec(ex["alphabet"], text)
        if not r["ok"] or not r["examples"]:
            continue
        if len(r["examples"][0]["word"]) > MAX_EXAMPLE_LEN:
            continue
        last = {**ex, "language": text}
        if text == avoid:
            continue
        break
    if last is None:  # no debería pasar: ejercicio seguro
        b = {"blocks": [{"sym": "a", "v": "n"}, {"sym": "b", "v": "n"}], "group": None, "cons": ["n>0"]}
        last = {"alphabet": "{a, b}", "builder": b, "language": builder_text(b)}
    r = compile_spec(last["alphabet"], last["language"])
    return {
        "level": level,
        "level_name": LEVEL_NAMES[level],
        "alphabet": last["alphabet"],
        "builder": last["builder"],
        "language": last["language"],
        "variables": r["variables"],
        "example": r["examples"][0]["word"] if r["examples"] else "",
    }