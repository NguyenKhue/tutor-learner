import { useEffect, useState } from 'react'

/**
 * The loudness of the microphone over the last `count` moments, each 0–1, newest last.
 * Returns null where the browser cannot measure it (no Web Audio): the caller shows a plain animation instead.
 */
export function useMicLevels(stream: MediaStream | null, count: number): number[] | null {
  const [levels, setLevels] = useState<number[] | null>(null)

  useEffect(() => {
    const Ctx = typeof window !== 'undefined' ? window.AudioContext : undefined
    if (!stream || !Ctx) {
      setLevels(null)
      return
    }
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let history = new Array<number>(count).fill(0)
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 60) return // about 16 updates a second is smooth enough
      last = now
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += ((v - 128) / 128) ** 2
      const rms = Math.sqrt(sum / samples.length)
      history = [...history.slice(1), Math.min(1, Math.sqrt(rms) * 1.6)] // speech sits near 0.02–0.25 rms: the root spreads it out
      setLevels(history)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      void ctx.close()
    }
  }, [stream, count])

  return levels
}
