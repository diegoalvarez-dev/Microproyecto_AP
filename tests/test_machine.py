"""Pruebas del autómata multi-pila contra verificadores independientes.

Dos tipos de verificación:

  1. EXHAUSTIVA: para cada lenguaje se prueban TODAS las cadenas sobre Σ hasta una
     longitud dada. La máquina debe aceptar exactamente las palabras que genera la
     fuerza bruta (todas las asignaciones de las variables que cumplen las restricciones).

  2. A MANO: para los tres lenguajes de referencia (los de la ingeniera) se escribe
     el predicado directamente en Python, sin pasar por el parser ni por los gadgets.
"""
from itertools import groupby, product

import pytest

from backend.builder import build
from backend.simulator import simulate
from backend.validator import compile_spec

# (alfabeto, lenguaje, longitud máxima para la prueba exhaustiva)
CASES = [
    ("{a,b}", "a^n b^n", 12),
    ("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2", 10),
    ("{0,1}", "(0^n 1^m)^k | n>0, m>1, k=n", 14),
    ("{a,b,c}", "a^n b^m c^n | m>0", 9),
    ("{a,b,c}", "a^n b^m c^k | k = n + m, n>0", 9),
    ("{a,b,c}", "a^n b^m c^k | n + m = k", 9),
    ("{a,b,c}", "a^n b^m c^k | k = n + m + 2", 9),
    ("{a,b}", "a^n b^m | m = 2n", 12),
    ("{a,b}", "a^n b^m | 2n = 3m", 12),
    ("{0,1}", "0^n 1^m | n mod 3 = 1, m >= 2", 12),
    ("{a,b}", "a^n b^m a^k | n = k", 11),
    ("{a,b}", "a^n b^m | m = n + 2", 12),
    ("{a,b}", "a^n b^m | n > m", 12),
    ("{a,b}", "a^n b^m | n <= m", 12),
    ("{a,b}", "a^n b^m | n >= 2, m <= 3", 12),
    ("{a,b}", "a^n b^m | n = m - 1", 12),
    ("{a,b,c}", "(a^n b^m)^k c^p | n>0, m>0, k=2, p=n", 10),
    ("{a,b,c}", "(a^n b^m)^k c^p | n>0, m>0, k=3, p>0", 11),
    ("{a,b,c}", "c^p (a^n b^m)^k | n>0, m>0, k>0, k=n", 11),
    ("{a}", "(a^n)^k | n>1, k>1", 16),
    ("{a,b}", "(a^n b^m)^k | n>0, m>0, k>0, n=m", 14),
    # optimizaciones: restricciones unarias con estados, igualdades al leer, pilas compartidas
    ("{a,b,c}", "a^n b^n c^n", 9),
    ("{a,b,c}", "a^n b^m c^p | n = m, m = p", 9),
    ("{a,b,c}", "a^n b^m c^k | n = k, m = k", 9),
    ("{a,b,c}", "a^n b^m c^n | n>0, m>0, n par", 11),
    ("{a,b}", "a^n b^n | n>0", 12),
    ("{a,b}", "a^n b^m | n<=2, m>=n", 12),
    ("{0,1}", "0^n 1^m | n>0, n<=3, m par", 12),
    ("{a}", "a^n a^m | n>0, m = n + 1", 13),
    ("{a,b}", "a^n b^m | n mod 3 = 1, m mod 2 = 1, m > n", 12),
        # relaciones al leer con una sola pila (desfases, sentido invertido, pila propia)
    ("{0,1}", "0^n 1^m | n>0 par, m>n", 13),
    ("{0,1}", "0^n 1^m | m>n", 12),
    ("{0,1}", "0^n 1^m | m>=n", 12),
    ("{0,1}", "0^n 1^m | m<n", 12),
    ("{0,1}", "0^n 1^m | m<=n", 12),
    ("{0,1}", "0^n 1^m | n>m, m>0", 12),
    ("{0,1}", "0^n 1^m | m>n+1", 12),
    ("{0,1}", "0^n 1^m | m=n+2", 12),
    ("{0,1}", "0^n 1^m | m<n+2", 12),
    ("{0,1}", "0^n 1^m | n<m+1, n>0", 12),
    ("{0,1,2}", "0^n 1^m 2^k | m>n, k>m", 12),
    ("{0,1,2}", "0^n 1^m 2^k | m>n, k=n", 12),
    ("{0,1,2}", "0^n 1^m 2^k | m>=n, k<=m", 12),
]


def oracle_words(lang, max_len):
    """Todas las palabras del lenguaje de longitud <= max_len, por fuerza bruta."""
    out = set()
    for vals in product(range(max_len + 1), repeat=len(lang.variables)):
        d = dict(zip(lang.variables, vals))
        if all(c.holds(d) for c in lang.constraints):
            w = lang.word(d)
            if len(w) <= max_len:
                out.add(w)
    return out


def all_strings(alphabet, max_len):
    for n in range(max_len + 1):
        for tup in product(alphabet, repeat=n):
            yield "".join(tup)


def compile_ok(alpha, src):
    r = compile_spec(alpha, src)
    assert r["ok"], r["errors"]
    return r["language"]


@pytest.mark.parametrize("alpha,src,max_len", CASES, ids=[c[1] for c in CASES])
def test_exhaustivo(alpha, src, max_len):
    lang = compile_ok(alpha, src)
    machine = build(lang)
    valid = oracle_words(lang, max_len)
    wrong = []
    for w in all_strings(lang.alphabet, max_len):
        got = simulate(machine, w)["accepted"]
        if got != (w in valid):
            wrong.append((w, "acepta de más" if got else "rechaza de menos"))
            if len(wrong) >= 5:
                break
    assert not wrong, f"{src}: {wrong}"
    assert valid, "el lenguaje no tiene palabras en ese rango: la prueba no demuestra nada"


@pytest.mark.parametrize("alpha,src,max_len", CASES, ids=[c[1] for c in CASES])
def test_palabras_largas_validas(alpha, src, max_len):
    """Palabras válidas bastante más largas que las del exhaustivo deben aceptarse."""
    lang = compile_ok(alpha, src)
    machine = build(lang)
    L = max_len + 14
    words = sorted(oracle_words(lang, L), key=len)
    longest = [w for w in words if len(w) > max_len][-12:]
    assert longest, "no hay palabras largas para probar"
    for w in longest:
        assert simulate(machine, w)["accepted"], f"{src}: debería aceptar {w!r}"


# --------------------------------------------------- predicados escritos a mano
def runs(w):
    return [(c, len(list(g))) for c, g in groupby(w)]


def ref_ejemplo_ingeniera_1(w):
    """L = { 0^n 1^m 2^k | n>0 par, m>n par, k=m/2 }"""
    r = runs(w)
    if [c for c, _ in r] != ["0", "1", "2"]:
        return False
    n, m, k = (x for _, x in r)
    return n > 0 and n % 2 == 0 and m > n and m % 2 == 0 and k == m // 2


def ref_pizarra(w):
    """L = { (0^n 1^m)^k | n>0, m>1, k=n }"""
    r = runs(w)
    if not r or len(r) % 2 or any(c != "01"[i % 2] for i, (c, _) in enumerate(r)):
        return False
    ns, ms = {x for i, (_, x) in enumerate(r) if i % 2 == 0}, {x for i, (_, x) in enumerate(r) if i % 2 == 1}
    if len(ns) != 1 or len(ms) != 1:
        return False
    n, m, k = ns.pop(), ms.pop(), len(r) // 2
    return n > 0 and m > 1 and k == n


def ref_anbn(w):
    h = len(w) // 2
    return len(w) % 2 == 0 and w == "a" * h + "b" * h


@pytest.mark.parametrize(
    "alpha,src,ref,max_len",
    [
        ("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2", ref_ejemplo_ingeniera_1, 11),
        ("{0,1}", "(0^n 1^m)^k | n>0, m>1, k=n", ref_pizarra, 16),
        ("{a,b}", "a^n b^n", ref_anbn, 14),
    ],
)
def test_contra_predicado_a_mano(alpha, src, ref, max_len):
    machine = build(compile_ok(alpha, src))
    bad = [w for w in all_strings(alpha.strip("{}").split(","), max_len) if simulate(machine, w)["accepted"] != ref(w)]
    assert not bad, bad[:5]


def test_palabras_de_la_ingeniera():
    m = build(compile_ok("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2"))
    assert simulate(m, "00111122")["accepted"]
    m = build(compile_ok("{0,1}", "(0^n 1^m)^k | n>0, m>1, k=n"))
    assert simulate(m, "011")["accepted"]  # n=1, m=2, k=1
    assert simulate(m, "0" * 3 + "1" * 4 + "0" * 3 + "1" * 4 + "0" * 3 + "1" * 4)["accepted"]  # n=3, m=4, k=3


def test_vaciado_final():
    """Al aceptar, todas las pilas quedan vacías y la entrada consumida."""
    m = build(compile_ok("{0,1}", "(0^n 1^m)^k | n>0, m>1, k=n"))
    r = simulate(m, "0" * 3 + "1" * 4 + "0" * 3 + "1" * 4 + "0" * 3 + "1" * 4)
    last = r["steps"][-1]
    assert last["remaining"] == "" and all(not v for v in last["stacks"].values())
    assert last["state"] in m.finals


def test_determinismo_del_estado_final():
    from backend.exporters import is_deterministic

    for alpha, src, _ in CASES[:3]:
        assert is_deterministic(build(compile_ok(alpha, src)))


def n_pilas(alpha, src):
    return len(build(compile_ok(alpha, src)).stacks)


def test_minimo_de_pilas():
    """La plataforma elige el menor número de pilas razonable."""
    assert n_pilas("{a,b}", "a^n b^n") == 1  # el diseño clásico: apila las a, desapila con las b
    assert n_pilas("{a,b,c}", "a^n b^m c^n | m>0") == 1
    assert n_pilas("{0,1}", "0^n 1^m | n>0, n par, m>1") == 1  # solo restricciones unarias: sin pilas útiles
    assert n_pilas("{0,1}", "0^n 1^m | n>0 par, m>n") == 1  # m>n se compara al leer: una sola pila
    assert n_pilas("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2") <= 3
    # el ejemplo de la pizarra: X, X_A, Y, Y_A, Z
    assert n_pilas("{0,1}", "(0^n 1^m)^k | n>0, m>1, k=n") == 5


def test_estados_cortos():
    assert len(build(compile_ok("{a,b}", "a^n b^n")).states) <= 5
    assert len(build(compile_ok("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2")).states) <= 13
