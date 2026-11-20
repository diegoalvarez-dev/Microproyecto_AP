import { useCallback, useEffect, useState } from 'react'

/** Reproductor de pasos: idx va de 0 a max; avanza solo mientras `playing`. */
export function usePlayer(max, delay = 900) {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (!playing) return undefined
    if (idx >= max) {
      setPlaying(false)
      return undefined
    }
    const t = setTimeout(() => setIdx((i) => Math.min(max, i + 1)), delay / speed)
    return () => clearTimeout(t)
  }, [playing, idx, max, speed, delay])

  const reset = useCallback((start = 0, play = false) => {
    setIdx(start)
    setPlaying(play)
  }, [])

  return { idx, setIdx, playing, setPlaying, speed, setSpeed, reset, max }
}
