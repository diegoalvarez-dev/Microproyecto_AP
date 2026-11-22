"""Punto de entrada único (serverless) del backend.

Local:   python -m uvicorn api.index:app --reload --port 8000
Vercel:  detecta `app` en api/index.py y lo despliega junto al frontend.
"""
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import APIRouter, FastAPI  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from backend import service  # noqa: E402


class SpecBody(BaseModel):
    alphabet: str = ""  # p. ej. "{0, 1, 2}"
    language: str = ""  # p. ej. "0^n 1^m 2^k | n>0 par, m>n par, k=m/2"


class WordBody(SpecBody):
    word: str = ""


class ValuesBody(SpecBody):
    values: Dict[str, Any] = {}  # valores escritos (n, m, k...); los que falten se calculan solos

class GenBody(BaseModel):
    level: str = "medio"  # facil | medio | dificil
    avoid: str = ""


class HandBody(BaseModel):
    alphabet: str = ""
    states: List[Dict[str, Any]] = []
    transitions: List[Dict[str, Any]] = []


class HandWordBody(HandBody):
    word: str = ""


class HandCheckBody(HandBody):
    language: str = ""

app = FastAPI(title="Microproyecto AP - Autómatas de pila")
router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/validate")
def validate(body: SpecBody):
    return service.validate(body.alphabet, body.language)


@router.post("/build")
def build_machine(body: SpecBody):
    return service.build_machine(body.alphabet, body.language)


@router.post("/word")
def make_word(body: ValuesBody):
    """Palabra que resulta de los valores elegidos para n, m, k..."""
    return service.make_word(body.alphabet, body.language, body.values)


@router.post("/simulate")
def simulate_word(body: WordBody):
    return service.run_word(body.alphabet, body.language, body.word.strip())


@router.post("/generate")
def generate_exercise(body: GenBody):
    return service.generate_exercise(body.level, body.avoid)


@router.post("/hand/validate")
def hand_validate(body: HandBody):
    return service.hand_validate(body.model_dump())


@router.post("/hand/simulate")
def hand_simulate(body: HandWordBody):
    return service.hand_simulate(body.model_dump(), body.word)


@router.post("/hand/check")
def hand_check(body: HandCheckBody):
    return service.hand_check(body.model_dump(), body.alphabet, body.language)
    
app.include_router(router)
