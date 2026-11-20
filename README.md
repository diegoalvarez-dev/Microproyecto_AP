# Autómatas de pila · Microproyecto AP

Diseña un autómata de pila (multi-pila) a partir de un alfabeto y un lenguaje con variables.

    Σ = {0, 1, 2}
    L = 0^n 1^m 2^k | n>0 par, m>n par, k=m/2

## Cómo se minimizan las pilas

- Las restricciones sobre una sola variable (`n>0`, `n par`) se verifican con los estados: sin pila.
- Una variable solo lleva pila si participa en una relación (`m>n`, `k=m/2`, `k=n+m`).
- Una igualdad entre bloques (`aⁿbⁿ`) apila en uno y desapila en el otro: una sola pila.
- La pila auxiliar solo existe si hay que restaurar una pila que otra restricción volverá a usar.
- Con un grupo repetido `(0ⁿ1ᵐ)ᵏ` se usan X, X_A, Y, Y_A, Z como en clase.

## Backend (Python, listo y probado)

    backend/models.py      pilas, transiciones, máquina
    backend/language.py    parser del lenguaje y de las restricciones
    backend/validator.py   RF-04, contradicciones, palabras de ejemplo
    backend/builder.py     construcción: pilas, grupo repetido, gadgets, vaciado
    backend/notation.py    formato de las transiciones (tope, leído, apila)
    backend/simulator.py   BFS de configuraciones; acepta con pilas vacías
    backend/exporters.py   definición formal, tabla, aristas del diagrama
    api/index.py           FastAPI: /api/validate, /build, /word, /simulate

## Pruebas

    pip install pytest
    python -m pytest -q        # 68+ pruebas, ~80 s

Cada lenguaje se prueba con TODAS las cadenas hasta cierta longitud contra un verificador
de fuerza bruta independiente, más predicados escritos a mano para los 3 lenguajes de referencia.

## Frontend (React + Vite + Tailwind, animaciones con CSS)

    src/App.jsx                     pestañas y estado (RF-12: recuerda lo último escrito)
    src/components/SpecInput.jsx    entrada: alfabeto + constructor visual / texto del lenguaje
    src/components/Diagram.jsx      diagrama SVG (layout.js + PanZoom.jsx, del proyecto de autómatas)
    src/components/StacksView.jsx   pilas lado a lado con animación de apilar / desapilar
    src/components/ConstructionPanel.jsx   construcción paso a paso
    src/components/SimulatorPanel.jsx      cadena de prueba, cinta, pilas y veredicto
    src/components/TablePanel.jsx   tabla de transición y definición formal

## Local

    pip install -r requirements.txt
    python -m uvicorn api.index:app --reload --port 8000   # backend
    npm install && npm run dev                              # frontend en :5173 (proxy /api -> :8000)

## Despliegue en Vercel

Un solo proyecto: Vercel construye el frontend (`npm run build` -> `dist`) y sirve `api/index.py`
como función Python. `vercel.json` redirige `/api/*` a esa función.
