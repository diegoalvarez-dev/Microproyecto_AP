// Cliente del backend. En local Vite redirige /api a FastAPI (8000); en Vercel es el mismo dominio.
async function post(path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. ¿Está encendido el backend?')
  }
  if (!res.ok) throw new Error(`El servidor respondió con error ${res.status}.`)
  return res.json()
}

export const validate = (alphabet, language) => post('/validate', { alphabet, language })
export const buildMachine = (alphabet, language) => post('/build', { alphabet, language })
export const simulate = (alphabet, language, word) => post('/simulate', { alphabet, language, word })
export const makeWord = (alphabet, language, values) => post('/word', { alphabet, language, values })
export const generateExercise = (level, avoid = '') => post('/generate', { level, avoid })
export const handValidate = (payload) => post('/hand/validate', payload)
export const handSimulate = (payload, word) => post('/hand/simulate', { ...payload, word })
export const handCheck = (payload, language) => post('/hand/check', { ...payload, language })
