import { useCallback, useEffect, useRef, useState } from 'react'

/** A finished recording and its length. */
export interface Recording {
  blob: Blob
  seconds: number
}

/** True when this browser can record from the microphone. */
export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** The message for a failed microphone start. */
function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return 'The microphone is blocked. Allow it in the browser, or type your answer.'
  if (name === 'NotFoundError') return 'No microphone found. Connect one, or type your answer.'
  return 'Could not start the microphone. Try again, or type your answer.'
}

/** Records from the microphone, stops by itself at `maxSeconds` and hands the result to `onDone`. */
export function useRecorder(maxSeconds: number, onDone: (recording: Recording) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const dropped = useRef(false)
  const timer = useRef<number | null>(null)
  const done = useRef(onDone)
  done.current = onDone

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  /** Stops without handing the recording on: nothing is kept. */
  const cancel = useCallback(() => {
    dropped.current = true
    stop()
  }, [stop])

  /** Clears the timer and frees the microphone. */
  const release = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
    setStream(null)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setError(micError(err))
      return
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const began = performance.now()
    const elapsed = () => (performance.now() - began) / 1000
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      release()
      recorder.current = null
      setRecording(false)
      if (dropped.current) return
      done.current({ blob: new Blob(chunks, { type: rec.mimeType }), seconds: Math.min(elapsed(), maxSeconds) })
    }
    recorder.current = rec
    dropped.current = false
    setStream(stream)
    rec.start()
    setSeconds(0)
    setRecording(true)
    timer.current = window.setInterval(() => {
      const now = elapsed()
      setSeconds(now)
      if (now >= maxSeconds) stop()
    }, 200)
  }, [maxSeconds, release, stop])

  // Leaving the page must not keep the microphone on.
  useEffect(
    () => () => {
      if (recorder.current) {
        recorder.current.onstop = null
        if (recorder.current.state === 'recording') recorder.current.stop()
      }
      release()
    },
    [release],
  )

  return { recording, seconds, error, stream, start, stop, cancel }
}
