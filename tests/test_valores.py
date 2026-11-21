"""Los valores que no se escriben en la tabla de variables se calculan solos."""
from backend.service import make_word

EX1 = ("{0,1,2}", "0^n 1^m 2^k | n>0 par, m>n par, k=m/2")


def test_division_se_calcula():
    r = make_word(*EX1, {"n": 2, "m": 4})
    assert r["ok"] and r["values"] == {"n": 2, "m": 4, "k": 2}
    assert r["auto"] == ["k"] and r["word"] == "00111122"


def test_suma_se_calcula():
    r = make_word("{a,b,c}", "a^n b^m c^k | k = n + m", {"n": 3, "m": 4})
    assert r["ok"] and r["values"]["k"] == 7 and r["word"] == "aaabbbbccccccc"


def test_resta_y_multiplicacion_por_constante():
    r = make_word("{a,b}", "a^n b^m | m = n - 1", {"n": 5})
    assert r["ok"] and r["values"]["m"] == 4
    r = make_word("{a,b}", "a^n b^m | m = 3 * n", {"m": 12})
    assert r["ok"] and r["values"]["n"] == 4


def test_valores_grandes():
    r = make_word(*EX1, {"n": 20, "m": 100})
    assert r["ok"] and r["values"]["k"] == 50


def test_varias_opciones_usa_la_menor_y_avisa():
    r = make_word(*EX1, {"m": 6})
    assert r["ok"] and r["values"]["n"] == 2 and r["notes"]


def test_valores_que_no_cumplen():
    r = make_word(*EX1, {"n": 1})
    assert not r["ok"] and r["violated"] == ["n par"]
    r = make_word("{a,b,c}", "a^n b^m c^k | k = n + m", {"n": 1, "m": 1, "k": 9})
    assert not r["ok"] and r["violated"]


def test_sin_solucion_para_lo_que_falta():
    r = make_word("{a,b}", "a^n b^m | n>m, m>n", {"n": 3})
    assert not r["ok"]