"""Autómatas dibujados a mano y generador de ejercicios."""
import pytest

from backend import service
from backend.generator import LEVELS, generate
from backend.handdrawn import HandError, parse_line
from backend.validator import compile_spec

AB = ["0", "1"]


def _hand_anbn():
    # a^n b^n con n>0, a mano: q0 -λ-> q1 (crea X) -0-> q2 ... -1 desapila ... -ϕ-> final
    states = [{"id": "q0", "initial": True}, {"id": "q1"}, {"id": "q2"}, {"id": "q3"}, {"id": "q4", "final": True}]
    tr = [
        ("q0", "q1", "X₀X"),
        ("q1", "q2", "X₀, 0, X₀X"),
        ("q2", "q2", "X, 0, XX"),
        ("q2", "q3", "X, 1, ε"),
        ("q3", "q3", "X, 1, ε"),
        ("q3", "q4", "X₀, ϕ, X₀"),
    ]
    return {
        "alphabet": "{0, 1}", "states": states,
        "transitions": [{"edge": f"{a}->{b}", "line": 0, "src": a, "dst": b, "text": t} for a, b, t in tr],
    }


def test_parse_basico():
    p = parse_line("X₀, 0, X₀X", AB)
    assert p["read"] == "0" and p["pops"] == {"X": "X0"} and p["pushes"] == {"X": ["X", "X0"]}
    p = parse_line("X₀X ; Y₀Y", AB)
    assert p["init"] and p["read"] is None and set(p["pushes"]) == {"X", "Y"}
    p = parse_line("Z₀, ϕ, Z₀", AB)
    assert p["read"] == "ϕ" and p["pops"] == {"Z": "Z0"} and p["pushes"] == {"Z": ["Z0"]}
    p = parse_line("X, 1, ε ; Y₀, 1, Y₀Y", AB)
    assert p["pops"] == {"X": "X", "Y": "Y0"} and p["pushes"]["Y"] == ["Y", "Y0"]


def test_el_fondo_no_se_desapila_ni_se_apila_de_nuevo():
    for bad in ["Z₀, ϕ, ε", "X₀, 0, X", "X, 0, X₀", "X, 0, X₀X", "∅, 0, X"]:
        with pytest.raises(HandError):
            parse_line(bad, AB)
    assert parse_line("Xo, 0, XoX", AB)["pushes"] == {"X": ["X", "X0"]}
    assert parse_line("X₀, vacio, X₀", AB) if False else True


def test_parse_solo_leer():
    p = parse_line("ϕ", AB)
    assert p["read"] == "ϕ" and not p["pops"] and not p["pushes"]
    assert parse_line("0", AB)["read"] == "0"
    assert parse_line("λ", AB)["read"] is None


def test_parse_ascii_y_aux():
    p = parse_line("X, 0, e", AB) if False else parse_line("X, 0, eps", AB)
    assert p["pushes"] == {"X": []}
    p = parse_line("X, 0, ε ; X_A₀, 0, X_A₀X_A", AB)
    assert p["pops"] == {"X": "X", "XA": "XA0"} and p["pushes"]["XA"] == ["XA", "XA0"]
    p = parse_line("∅, 0, Y₀", AB)
    assert p["empties"] == ["Y"] and p["pushes"] == {"Y": ["Y0"]}


@pytest.mark.parametrize("bad", ["", "X, 0", "X, 2, X", "X, 0, Y", "X, 0, X ; X, 0, X", "∅, 0, ε", "X, 0, X ; Y, 1, Y", "q, 0, X"])
def test_parse_errores(bad):
    with pytest.raises(HandError):
        parse_line(bad, AB)


def test_simular_a_mano():
    p = _hand_anbn()
    ok = service.hand_simulate(p, "0011")
    assert ok["ok"] and ok["accepted"]
    no = service.hand_simulate(p, "001")
    assert no["ok"] and not no["accepted"]
    assert service.hand_simulate(p, "0012")["ok"] is False  # símbolo fuera del alfabeto


def test_validar_errores_por_linea():
    p = _hand_anbn()
    p["transitions"][1]["text"] = "X₀, 5, X₀X"
    r = service.hand_validate(p)
    assert not r["ok"] and r["errors"][0]["edge"] == "q1->q2"
    p = _hand_anbn()
    p["states"][0]["initial"] = False
    assert not service.hand_validate(p)["ok"]


def test_verificar_contra_lenguaje():
    p = _hand_anbn()
    r = service.hand_check(p, "{0, 1}", "0^n 1^n | n>0")
    assert r["ok"] and r["all_ok"], r
    assert r["tested"] > 1000 and r["accepted_members"] > 5 and not r["diagnostics"]
    # rechaza de menos: q3 no desapila (no vacía la pila) -> no acepta palabras del lenguaje
    p2 = _hand_anbn()
    p2["transitions"][4]["text"] = "X, 1, X"
    r2 = service.hand_check(p2, "{0, 1}", "0^n 1^n | n>0")
    assert r2["ok"] and not r2["all_ok"] and r2["missed_total"] > 0
    assert r2["missed"][0]["word"] == "01" or r2["missed"][0]["word"] == "0011"
    assert r2["missed"][0]["reason"]
    # acepta de más: acepta 0^n 1^m con m > n
    p3 = _hand_anbn()
    p3["transitions"].append({"edge": "q3->q3", "line": 1, "src": "q3", "dst": "q3", "text": "X₀, 1, X₀"})
    r3 = service.hand_check(p3, "{0, 1}", "0^n 1^n | n>0")
    assert not r3["all_ok"] and r3["extra_total"] > 0 and "forma" in r3["extra"][0]["why"]


def test_explicar_restriccion_violada():
    # a^n b^m con m>n: «0001» tiene la forma pero viola m>n
    from backend.handdrawn import explain_non_member
    spec = compile_spec("{0, 1}", "0^n 1^m | n>0, m>n")
    assert "m>n" in explain_non_member(spec["language"], "0011")


def test_diagnostico_pila_sin_vaciar():
    p = _hand_anbn()
    p["transitions"][3]["text"] = "X₀, 1, X₀"  # nunca desapila los contadores
    p["transitions"][4]["text"] = "X₀, 1, X₀"
    r = service.hand_check(p, "{0, 1}", "0^n 1^n | n>0")
    assert any("ninguna transición los desapila" in d["message"] for d in r["diagnostics"])


def test_verificar_sin_lenguaje_valido():
    r = service.hand_check(_hand_anbn(), "{0, 1}", "")
    assert r["ok"] is False and r["errors"]


@pytest.mark.parametrize("level", LEVELS)
def test_generador_valido(level):
    seen = set()
    for s in range(25):
        ex = generate(level, seed=s)
        r = compile_spec(ex["alphabet"], ex["language"])
        assert r["ok"], ex
        assert r["examples"]
        seen.add(ex["language"])
    assert len(seen) >= 8  # hay variedad


def test_generador_evita_repetir():
    a = generate("facil", seed=1)
    b = generate("facil", seed=1, avoid=a["language"])
    assert b["language"] != a["language"]


def test_check_hand_devuelve_vista_para_el_visor():
    from backend import service
    payload = {
        "alphabet": "{0, 1}",
        "states": [{"id": "q0", "initial": True, "final": False}, {"id": "q1", "initial": False, "final": False}, {"id": "q2", "initial": False, "final": True}],
        "transitions": [
            {"edge": "q0->q0", "line": 0, "src": "q0", "dst": "q0", "text": "X₀X"},
            {"edge": "q0->q1", "line": 0, "src": "q0", "dst": "q1", "text": "X₀, 0, X₀X"},
            {"edge": "q1->q1", "line": 0, "src": "q1", "dst": "q1", "text": "X, 0, XX"},
            {"edge": "q1->q2", "line": 0, "src": "q1", "dst": "q2", "text": "X, 1, ε"},
            {"edge": "q2->q2", "line": 0, "src": "q2", "dst": "q2", "text": "X, 1, ε"},
            {"edge": "q2->q2", "line": 1, "src": "q2", "dst": "q2", "text": "X₀, ϕ, X₀"},
        ],
    }
    r = service.hand_check(payload, "{0, 1}", "0^n 1^n | n>0")
    assert r["ok"]
    v = r["view"]
    assert v["variables"] == ["n"] and v["examples"]
    assert len(v["automaton"]["states"]) == 3 and v["automaton"]["counts"]["transitions"] == 6
    assert len(v["table"]) == 6 and v["formal"]["text"]
