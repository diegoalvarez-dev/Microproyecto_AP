"""Modelo de datos del autómata multi-pila.

Convenciones (las mismas de la clase):
  * Cada variable del lenguaje (n, m, k...) tiene su propia pila: X, Y, Z...
  * Cada pila tiene un símbolo de fondo (X₀) y un símbolo contador (X).
  * Algunas pilas tienen una pila AUXILIAR (X_A) donde se guarda temporalmente
    lo desapilado, para poder restaurarlo después.
  * ϕ  = «vacío»: la entrada ya se terminó (no se consume nada).
  * ε  = «desapilar»: al apilar ε solo se quita el tope.
  * λ  = «no leer»: transición que no mira la entrada (solo la inicial).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

END = "ϕ"  # vacío: fin de la entrada
POP = "ε"  # desapilar
NOREAD = "λ"  # no lee entrada

_SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


@dataclass
class StackDef:
    name: str  # id interno: "X", "XA"
    var: str  # variable que cuenta
    role: str  # "count" | "aux"
    owner: Optional[str]  # para una auxiliar: nombre de la pila principal
    bottom: str  # id del símbolo de fondo, p. ej. "X0"
    counter: str  # id del símbolo contador, p. ej. "X"
    show_bottom: str  # cómo se dibuja el fondo: "X₀"
    show_counter: str  # cómo se dibuja el contador: "X" / "X_A"

    def public(self) -> dict:
        return {
            "name": self.name,
            "display": self.show_counter,
            "var": self.var,
            "role": self.role,
            "owner": self.owner,
            "bottom": self.bottom,
            "counter": self.counter,
            "show_bottom": self.show_bottom,
            "show_counter": self.show_counter,
        }


def make_stack(name: str, var: str, role: str = "count", owner: Optional[str] = None) -> StackDef:
    if role == "aux":
        shown = f"{owner}_A"
    else:
        shown = name
    return StackDef(
        name=name,
        var=var,
        role=role,
        owner=owner,
        bottom=f"{name}0",
        counter=name,
        show_bottom=shown + "0".translate(_SUB),
        show_counter=shown,
    )


@dataclass
class Transition:
    id: int
    src: str
    dst: str
    read: Optional[str]  # terminal | END | None (λ)
    pops: Dict[str, str] = field(default_factory=dict)  # pila -> símbolo que debe estar en el tope
    pushes: Dict[str, List[str]] = field(default_factory=dict)  # pila -> símbolos apilados (primero = nuevo tope)
    phase: str = ""
    note: str = ""
    drain: bool = False  # rizo de vaciado del estado final: el orden entre pilas no importa
    empties: List[str] = field(default_factory=list)  # pilas que deben estar VACÍAS (∅); solo en autómatas dibujados a mano
    stay: Dict[str, str] = field(default_factory=dict)  # pila -> símbolo en el tope donde «no se hace nada» (solo para mostrar la notación completa)


@dataclass
class State:
    id: str
    desc: str
    phase: str
    initial: bool = False
    final: bool = False


@dataclass
class Machine:
    states: List[State]
    transitions: List[Transition]
    stacks: Dict[str, StackDef]  # en orden de declaración
    alphabet: List[str]
    initial: str
    finals: List[str]
    steps: List[dict]
    variables: Dict[str, str]  # variable -> pila principal
    spec_text: str = ""

    def state(self, sid: str) -> State:
        for s in self.states:
            if s.id == sid:
                return s
        raise KeyError(sid)