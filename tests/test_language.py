"""El sistema debe entender las indicaciones escritas de distintas formas."""
import pytest

from backend.validator import compile_spec

IGUALES = [
    "0^n 1^m 2^k | n>0 par, m>n par, k=m/2",
    "0ⁿ1ᵐ2ᵏ | n>0 par, m>n par, k=m/2",
    "L = { 0ⁿ·1ᵐ·2ᵏ : n > 0, n par; m > n, m par; k = m/2 }",
    "0ⁿ1ᵐ2ᵏ | n es mayor que 0 y par, m mayor que n, m par, k es igual a la mitad de m",
    "0^n 1^m 2^k tal que n>0 ∧ n par ∧ m>n ∧ m par ∧ k=m/2",
]


@pytest.mark.parametrize("texto", IGUALES)
def test_mismas_indicaciones_escritas_distinto(texto):
    r = compile_spec("{0,1,2}", texto)
    assert r["ok"], r["errors"]
    assert r["pattern"] == "0^n 1^m 2^k"
    assert [c["text"].replace(" ", "") for c in r["constraints"]] == ["n>0", "npar", "m>n", "mpar", "k=m/2"]
    assert r["examples"][0]["word"] == "00111122"


def test_frases_con_doble_y_mayor_o_igual():
    r = compile_spec("{0,1,2}", "0^n 1^m 2^k tal que n mayor o igual que 2, m igual al doble de n, k = n + m")
    assert r["ok"], r["errors"]
    assert [c["text"] for c in r["constraints"]] == ["n >= 2", "m = 2n", "k = n + m"]


def test_grupo_con_conjunciones():
    r = compile_spec("{0,1}", "(0ⁿ1ᵐ)ᵏ | n>0 ∧ m>1 ∧ k=n")
    assert r["ok"], r["errors"]
    assert r["pattern"] == "(0^n 1^m)^k"


@pytest.mark.parametrize("texto", ["0^n 1^m | n>>0", "0^n 1 | n>0", "0^n 1^m | n*m = 3", "(0^n (1^m)^k)^j"])
def test_errores_claros(texto):
    r = compile_spec("{0,1}", texto)
    assert not r["ok"] and r["errors"]
