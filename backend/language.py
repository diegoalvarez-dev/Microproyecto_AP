"""Lenguajes con variables: parser, evaluación y clasificación de restricciones.

Un lenguaje se escribe así (el mismo formato que usa la ingeniera):

    0^n 1^m 2^k | n>0, n par, m>n, m par, k=m/2
    (0^n 1^m)^k | n>0, m>1, k=n
    a^n b^n

  * Antes de «|» va el PATRÓN: bloques `símbolo^variable` (opcionalmente un
    único grupo entre paréntesis que se repite: `( ... )^variable`).
  * Después de «|» van las RESTRICCIONES separadas por coma o punto y coma.

Las restricciones soportadas (catálogo cerrado, cada una tiene su «gadget»
de verificación en el autómata):

    n > 0   n >= 2   n = 3   n <= 5          variable contra constante
    n par   n impar   n mod 3 = 1            paridad / módulo
    n múltiplo de 3
    m > n   m >= n   m = n   m < n           variable contra variable
    m = n + 2   m > n - 1                    con constante sumada
    k = m/2   k = 2n   2k = 3m               igualdad con razón entera
    k = n + m   k = n + m + 1                una variable igual a una suma
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from math import ceil, floor, gcd
from typing import Dict, List, Optional, Tuple

from .models import END, NOREAD, POP

# ---------------------------------------------------------------- utilidades
SUPER = {
    "ⁿ": "n", "ᵐ": "m", "ᵏ": "k", "ⁱ": "i", "ʲ": "j", "ˣ": "x", "ʸ": "y", "ᶻ": "z",
    "ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᵖ": "p", "ʳ": "r", "ˢ": "s", "ᵗ": "t", "ᵘ": "u",
    "ᵛ": "v", "ʷ": "w", "ᵈ": "d", "ᵉ": "e", "ᶠ": "f", "ᵍ": "g", "ʰ": "h", "ˡ": "l", "ᵒ": "o",
}
FLIP = {"<": ">", "<=": ">=", ">": "<", ">=": "<=", "=": "="}
CMP_RE = re.compile(r"(<=|>=|==|=|<|>)")
RESERVED_ALPHABET = set("()^{}|,;:=<>+-*/ ") | {END, POP, NOREAD}


class LangError(Exception):
    def __init__(self, errors):
        self.errors = [errors] if isinstance(errors, str) else list(errors)
        super().__init__("; ".join(self.errors))


def normalize_text(s: str) -> str:
    s = s.replace("∣", "|").replace("≤", "<=").replace("≥", ">=").replace("−", "-")
    s = s.replace("·", "*").replace("×", "*").replace("÷", "/")
    return "".join("^" + SUPER[ch] if ch in SUPER else ch for ch in s)


def lcm(a: int, b: int) -> int:
    return a * b // gcd(a, b)


# ------------------------------------------------------------------ alfabeto
def parse_alphabet(text: str) -> List[str]:
    t = (text or "").strip()
    t = re.sub(r"^\s*(Σ|Sigma|sigma|alfabeto)\s*=?\s*", "", t, flags=re.I).strip()
    if t.startswith("{") and t.endswith("}"):
        t = t[1:-1].strip()
    if not t:
        raise LangError("El alfabeto está vacío: escribe al menos un símbolo, por ejemplo Σ = {0, 1}.")
    tokens = [x for x in re.split(r"[,;\s]+", t) if x] if re.search(r"[,;\s]", t) else list(t)
    errors, out = [], []
    for tk in tokens:
        if len(tk) != 1:
            errors.append(f"El símbolo «{tk}» no es válido: cada símbolo del alfabeto debe ser un solo carácter.")
        elif tk in RESERVED_ALPHABET:
            errors.append(f"El carácter «{tk}» está reservado y no puede ser parte del alfabeto.")
        elif tk in out:
            errors.append(f"El símbolo «{tk}» está repetido en el alfabeto.")
        else:
            out.append(tk)
    if errors:
        raise LangError(errors)
    return out


# ------------------------------------------------------------- restricciones
@dataclass
class Constraint:
    text: str
    kind: str  # "linear" | "mod"
    lin: Dict[str, Fraction] = field(default_factory=dict)
    const: Fraction = Fraction(0)
    cmp: str = "="
    mod: Optional[Tuple[str, int, int]] = None  # (variable, módulo, residuo)
    hidden: bool = False  # igualdad interna entre apariciones repetidas de una variable

    def variables(self) -> List[str]:
        if self.kind == "mod":
            return [self.mod[0]]
        return [v for v, k in self.lin.items() if k != 0]

    def holds(self, vals: Dict[str, int]) -> bool:
        if self.kind == "mod":
            v, c, r = self.mod
            return vals[v] % c == r
        total = self.const + sum(k * vals[v] for v, k in self.lin.items())
        return {
            "=": total == 0, "<": total < 0, "<=": total <= 0, ">": total > 0, ">=": total >= 0,
        }[self.cmp]


def _parse_side(side: str) -> Tuple[Dict[str, Fraction], Fraction]:
    s = side.replace(" ", "")
    if not s:
        raise LangError("Falta un lado de la restricción.")
    lin: Dict[str, Fraction] = {}
    const = Fraction(0)
    for term in re.findall(r"[+-]?[^+-]+", s):
        sign = -1 if term.startswith("-") else 1
        body = term.lstrip("+-")
        tokens = re.findall(r"\d+|[A-Za-z]|\*|/", body)
        if "".join(tokens) != body or not tokens:
            raise LangError(f"No entiendo «{term}» en la restricción.")
        coef, var, op = Fraction(1), None, "*"
        for tk in tokens:
            if tk in "*/":
                op = tk
                continue
            if tk.isdigit():
                if op == "/":
                    if int(tk) == 0:
                        raise LangError("No se puede dividir entre cero.")
                    coef /= int(tk)
                else:
                    coef *= int(tk)
            else:
                if op == "/":
                    raise LangError("No se puede dividir entre una variable.")
                if var is not None:
                    raise LangError(f"«{term}» multiplica dos variables: solo se admiten relaciones lineales.")
                var = tk
            op = "*"
        if var is None:
            const += sign * coef
        else:
            lin[var] = lin.get(var, Fraction(0)) + sign * coef
    return lin, const


def parse_constraint(text: str) -> Constraint:
    t = text.strip()
    if not t:
        raise LangError("Hay una restricción vacía.")
    m = re.match(r"^([A-Za-z])\s*(?:∈|in)\s*(?:ℕ|N|Z\+|ℕ₀)\s*$", t)
    if m:  # n ∈ ℕ: siempre cierto, se guarda como n >= 0
        return Constraint(text=t, kind="linear", lin={m.group(1): Fraction(1)}, cmp=">=")
    m = re.match(r"^([A-Za-z])\s+(?:es\s+)?(par|impar)$", t, re.I)
    if m:
        return Constraint(text=t, kind="mod", mod=(m.group(1), 2, 0 if m.group(2).lower() == "par" else 1))
    m = re.match(r"^([A-Za-z])\s+(?:es\s+)?m[uú]ltiplo\s+de\s+(\d+)$", t, re.I)
    if m:
        c = int(m.group(2))
        if c < 2:
            raise LangError(f"«{t}»: el módulo debe ser al menos 2.")
        return Constraint(text=t, kind="mod", mod=(m.group(1), c, 0))
    m = re.match(r"^([A-Za-z])\s*(?:mod|%)\s*(\d+)\s*=\s*(\d+)$", t, re.I)
    if m:
        c, r = int(m.group(2)), int(m.group(3))
        if c < 2 or r >= c:
            raise LangError(f"«{t}»: el módulo debe ser ≥ 2 y el residuo menor que el módulo.")
        return Constraint(text=t, kind="mod", mod=(m.group(1), c, r))
    parts = CMP_RE.split(t)
    if len(parts) != 3:
        raise LangError(
            f"«{t}» no es una restricción válida: debe tener exactamente un comparador (=, <, >, <=, >=) "
            "o ser de la forma «n par», «n impar», «n mod 3 = 1»."
        )
    left, op, right = parts
    op = "=" if op == "==" else op
    ll, lc = _parse_side(left)
    rl, rc = _parse_side(right)
    lin: Dict[str, Fraction] = dict(ll)
    for v, k in rl.items():
        lin[v] = lin.get(v, Fraction(0)) - k
    lin = {v: k for v, k in lin.items() if k != 0}
    return Constraint(text=t, kind="linear", lin=lin, const=lc - rc, cmp=op)


PHRASES = [
    (r"\bmayor\s+o\s+igual\s+(?:que|a)\b", ">="),
    (r"\bmenor\s+o\s+igual\s+(?:que|a)\b", "<="),
    (r"\bmayor\s+(?:que|a)\b", ">"),
    (r"\bmenor\s+(?:que|a)\b", "<"),
    (r"\bigual\s+(?:que|a|al)\b", "="),
    (r"\b(?:la\s+)?mitad\s+de\s+([A-Za-z])\b", r"\1/2"),
    (r"\b(?:el\s+)?doble\s+de\s+([A-Za-z])\b", r"2\1"),
    (r"\b(?:el\s+)?triple\s+de\s+([A-Za-z])\b", r"3\1"),
    (r"\b([A-Za-z])\s+positivo\b", r"\1>0"),
    (r"\bpares\b", "par"),
    (r"\bimpares\b", "impar"),
    (r"\bes\s+", ""),
]


def _prep(p: str) -> str:
    """Pasa una frase como «n es mayor que 0» a la forma que entiende el parser: «n > 0»."""
    p = p.strip().rstrip(".")
    for pat, rep in PHRASES:
        p = re.sub(pat, rep, p, flags=re.I)
    return re.sub(r"\s+", " ", p).strip()


def _looks_like_constraint(p: str) -> bool:
    return bool(CMP_RE.search(p) or re.search(r"\b(par|impar|mod)\b|m[uú]ltiplo|∈", p, re.I))


def split_constraints(text: str) -> List[str]:
    out: List[str] = []
    for piece in re.split(r"[,;\n]", text):
        p = _prep(piece)
        if not p:
            continue
        # «n>0 y m>n» / «n>0 ∧ m>n» son dos restricciones
        parts = re.split(r"\s+y\s+|\s*[∧&]+\s*", p)
        pieces = parts if len(parts) > 1 and all(_looks_like_constraint(x) for x in parts) else [p]
        for p in pieces:
            p = p.strip()
            # «n > 0 y par»: el «par» se refiere a la misma variable que la restricción anterior
            if re.fullmatch(r"(par|impar)", p, re.I) and out:
                subj = re.search(r"[A-Za-z]", out[-1])
                if subj:
                    out.append(f"{subj.group(0)} {p.lower()}")
                    continue
            # «m>n par» = «m>n» y «m par» (la paridad es de la variable de la izquierda)
            m = re.match(r"^(.+?)\s+(par|impar)$", p, re.I)
            if m and CMP_RE.search(m.group(1)):
                left = m.group(1).strip()
                subj = re.search(r"[A-Za-z]", left)
                out.append(left)
                if subj:
                    out.append(f"{subj.group(0)} {m.group(2).lower()}")
                continue
            out.append(p)
    return out


def classify(c: Constraint) -> dict:
    """Decide qué «gadget» del autómata verifica la restricción.

    Devuelve {"gadget": "range"|"mod"|"cmp"|"scale"|"sum"|"trivial"|"false", ...}
    o lanza LangError si la restricción no está en el catálogo soportado.
    """
    if c.kind == "mod":
        v, cc, r = c.mod
        return {"gadget": "mod", "var": v, "c": cc, "r": r}

    lin = {v: k for v, k in c.lin.items() if k != 0}
    den = 1
    for k in list(lin.values()) + [c.const]:
        den = lcm(den, Fraction(k).denominator)
    lin = {v: int(k * den) for v, k in lin.items()}
    const = int(c.const * den)
    cmp = c.cmp
    vs = list(lin)

    def truth(a, op, b):
        return {"=": a == b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[op]

    unsupported = LangError(
        f"La restricción «{c.text}» no está en el catálogo soportado. Formas válidas: "
        "n>0 · n par · n mod 3 = 1 · m>n · m = n + 2 · k = m/2 · k = 2n · k = n + m."
    )

    if not vs:
        return {"gadget": "trivial" if truth(const, cmp, 0) else "false"}

    if len(vs) == 1:
        v = vs[0]
        a = lin[v]
        t = Fraction(-const, a)
        op = cmp if a > 0 else FLIP[cmp]
        lo, hi = 0, None
        if op == "=":
            if t.denominator != 1 or t < 0:
                return {"gadget": "false"}
            lo = hi = int(t)
        elif op == ">":
            lo = floor(t) + 1
        elif op == ">=":
            lo = ceil(t)
        elif op == "<":
            hi = ceil(t) - 1
        else:  # <=
            hi = floor(t)
        lo = max(lo, 0)
        if hi is not None and hi < lo:
            return {"gadget": "false"}
        if hi is None and lo == 0:
            return {"gadget": "trivial"}
        return {"gadget": "range", "var": v, "lo": lo, "hi": hi}

    if len(vs) == 2:
        a, b = lin[vs[0]], lin[vs[1]]
        if a * b > 0:
            raise unsupported
        (P, al), (Q, be) = ((vs[0], a), (vs[1], -b)) if a > 0 else ((vs[1], b), (vs[0], -a))
        # al*P  cmp  be*Q - const
        if al == be:
            t = Fraction(-const, al)  # P - Q  cmp  t
            if t.denominator == 1:
                op2, cc = cmp, int(t)
            elif cmp == "=":
                return {"gadget": "false"}
            elif cmp in (">", ">="):
                op2, cc = ">=", ceil(t)
            else:
                op2, cc = "<=", floor(t)
            if cc < 0:
                P, Q, op2, cc = Q, P, FLIP[op2], -cc
            return {"gadget": "cmp", "p": P, "q": Q, "cmp": op2, "c": cc}
        if cmp == "=" and const == 0:
            g = gcd(al, be)
            return {"gadget": "scale", "p": P, "a": al // g, "q": Q, "b": be // g}
        raise unsupported

    # 3 o más variables: solo «x = t1 + t2 + ... + c»
    if cmp != "=":
        raise unsupported
    pos = [v for v in vs if lin[v] > 0]
    neg = [v for v in vs if lin[v] < 0]
    if len(neg) == 1 and len(pos) >= 2:
        lin = {v: -k for v, k in lin.items()}
        const = -const
        pos, neg = neg, pos
    if len(pos) == 1 and len(neg) >= 2 and lin[pos[0]] == 1 and all(lin[v] == -1 for v in neg):
        cc = -const
        if cc < 0:
            raise unsupported
        return {"gadget": "sum", "x": pos[0], "terms": neg, "c": cc}
    raise unsupported


# ------------------------------------------------------------------- patrón
@dataclass
class Block:
    index: int  # 1..T
    symbol: str
    var: str  # variable (nombre original)
    occ: str  # nombre único de esta aparición (n, n', n'', ...)
    in_group: bool


@dataclass
class Group:
    first: int
    last: int
    var: str
    occ: str


@dataclass
class Occurrence:
    occ: str
    var: str
    primary: bool
    kind: str  # "block" | "repeat"
    block: Optional[int]


@dataclass
class Language:
    alphabet: List[str]
    blocks: List[Block]
    group: Optional[Group]
    constraints: List[Constraint]
    hidden: List[Constraint]
    occurrences: List[Occurrence]
    variables: List[str]  # variables distintas en orden de aparición
    source: str
    pattern_text: str

    def exponent_vars(self) -> List[str]:
        return self.variables

    def word(self, vals: Dict[str, int]) -> str:
        out, i, T = [], 0, len(self.blocks)
        while i < T:
            b = self.blocks[i]
            if self.group and b.in_group:
                g = self.group
                unit = "".join(x.symbol * vals[x.var] for x in self.blocks[g.first - 1:g.last])
                out.append(unit * vals[g.var])
                i = g.last
            else:
                out.append(b.symbol * vals[b.var])
                i += 1
        return "".join(out)


def _read_var(s: str, pos: int) -> Tuple[str, int]:
    if pos >= len(s):
        raise LangError("Falta el nombre de la variable después de «^».")
    if s[pos] == "{":
        end = s.find("}", pos)
        if end == -1:
            raise LangError("Falta cerrar «}» en el exponente.")
        name = s[pos + 1:end].strip()
        if not name:
            raise LangError("El exponente entre llaves está vacío.")
        return name, end + 1
    if s[pos].isalpha():
        return s[pos], pos + 1
    raise LangError(f"El exponente debe ser una variable (una letra como n, m, k), no «{s[pos]}».")


def _parse_pattern(raw: str):
    s = re.sub(r"\s+", "", raw)
    if not s:
        raise LangError("El patrón del lenguaje está vacío. Ejemplo: 0^n 1^m")
    items, grp, pos = [], None, 0
    while pos < len(s):
        c = s[pos]
        if c == "(":
            if grp is not None:
                raise LangError("Los grupos anidados no están soportados: usa un solo grupo repetido.")
            grp, pos = [], pos + 1
        elif c == ")":
            if grp is None:
                raise LangError("Hay un «)» sin su «(».")
            if not grp:
                raise LangError("El grupo entre paréntesis está vacío.")
            pos += 1
            if pos >= len(s) or s[pos] != "^":
                raise LangError("Al grupo le falta su exponente, por ejemplo (0^n 1^m)^k.")
            var, pos = _read_var(s, pos + 1)
            items.append(("group", grp, var))
            grp = None
        elif c in "^{}|":
            raise LangError(f"Carácter inesperado «{c}» en el patrón.")
        else:
            sym, pos = c, pos + 1
            if pos >= len(s) or s[pos] != "^":
                raise LangError(f"A «{sym}» le falta el exponente: escribe {sym}^n (una variable).")
            var, pos = _read_var(s, pos + 1)
            (grp if grp is not None else items).append(("block", sym, var) if grp is None else (sym, var))
    if grp is not None:
        raise LangError("Falta cerrar el grupo con «)^variable».")
    return items


def parse_language(text: str, alphabet: List[str]) -> Language:
    src = (text or "").strip()
    if not src:
        raise LangError("Escribe el lenguaje. Ejemplo: 0^n 1^m 2^k | n>0, n par, m>n, m par, k=m/2")
    t = normalize_text(src)
    t = re.sub(r"^\s*L\s*=\s*", "", t)
    if t.startswith("{") and t.rstrip().endswith("}"):
        t = t.strip()[1:-1]
    if "|" not in t:
        pieces = re.split(r"\s+(?:tal\s+que|donde|con)\s+|\s*:\s*", t, maxsplit=1, flags=re.I)
        if len(pieces) == 2:
            t = pieces[0] + "|" + pieces[1]
    pat, cons = (t.split("|", 1) + [""])[:2] if "|" in t else (t, "")
    pat = pat.replace("*", "")  # «0ⁿ·1ᵐ» o «0^n * 1^m»
    if "|" not in t and CMP_RE.search(pat):
        raise LangError("Separa el patrón de las restricciones con «|». Ejemplo: 0^n 1^m | n>0, m>n")

    items = _parse_pattern(pat)
    groups = [it for it in items if it[0] == "group"]
    if len(groups) > 1:
        raise LangError("Solo se admite un grupo repetido por lenguaje.")

    blocks: List[Block] = []
    occs: List[Occurrence] = []
    seen: Dict[str, int] = {}
    variables: List[str] = []
    group: Optional[Group] = None

    def new_occ(var: str, kind: str, block: Optional[int]) -> str:
        cnt = seen.get(var, 0)
        seen[var] = cnt + 1
        name = var + "'" * cnt
        if cnt == 0:
            variables.append(var)
        occs.append(Occurrence(name, var, cnt == 0, kind, block))
        return name

    for it in items:
        if it[0] == "block":
            _, sym, var = it
            idx = len(blocks) + 1
            blocks.append(Block(idx, sym, var, new_occ(var, "block", idx), False))
        else:
            _, gb, gvar = it
            first = len(blocks) + 1
            for sym, var in gb:
                idx = len(blocks) + 1
                blocks.append(Block(idx, sym, var, new_occ(var, "block", idx), True))
            group = Group(first, len(blocks), gvar, new_occ(gvar, "repeat", None))

    constraints = [parse_constraint(p) for p in split_constraints(cons)]

    hidden: List[Constraint] = []
    for o in occs:
        if not o.primary:
            base = o.var
            hidden.append(
                Constraint(text=f"{o.occ} = {base}", kind="linear", lin={o.occ: Fraction(1), base: Fraction(-1)},
                           cmp="=", hidden=True)
            )

    def show_item(it):
        if it[0] == "block":
            return f"{it[1]}^{it[2]}"
        return "(" + " ".join(f"{s}^{v}" for s, v in it[1]) + f")^{it[2]}"

    return Language(
        alphabet=list(alphabet), blocks=blocks, group=group, constraints=constraints, hidden=hidden,
        occurrences=occs, variables=variables, source=src, pattern_text=" ".join(show_item(i) for i in items),
    )
