/**
 * Web Audio chime + Bengali speech-synthesis announcement engine for the
 * Patient Queue System. No MP3, no external asset, no CORS, no network
 * latency — a 2-tone oscillator chime (D5 -> A5) followed by a queued
 * Bengali SpeechSynthesisUtterance.
 *
 * IMPORTANT for callers: `announcePatientCall({ patientName, ... })` speaks
 * exactly the string it's given. Always pass it through the same display
 * formatter the board renders with (queueDisplay's formatPatientDisplay,
 * driven by queue_settings.privacy_mode) — never the raw patient_name. The
 * sandbox this was ported from called it with the raw name directly, so
 * even its "Token Only" privacy mode still spoke the patient's full name
 * aloud; the privacy setting only ever affected the on-screen text.
 */

let audioCtx: AudioContext | null = null
let isUnlocked = false
const unlockListeners: Array<(unlocked: boolean) => void> = []

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  return audioCtx
}

/** Whether the AudioContext is running / permitted by the browser's autoplay policy. */
export function isAudioUnlocked(): boolean {
  const ctx = getAudioContext()
  if (!ctx) return false
  return ctx.state === 'running' && isUnlocked
}

/** Attempts to unlock AudioContext on user interaction (tap-to-unlock banner on TV browsers). */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)

    isUnlocked = true
    unlockListeners.forEach((fn) => fn(true))
    return true
  } catch (err) {
    console.warn('Audio unlock failed:', err)
    return false
  }
}

export function onAudioUnlockChange(callback: (unlocked: boolean) => void): () => void {
  unlockListeners.push(callback)
  return () => {
    const index = unlockListeners.indexOf(callback)
    if (index > -1) unlockListeners.splice(index, 1)
  }
}

/** Plays a 2-tone harmonic chime (airport/hospital style: D5 -> A5). */
export function playDingDongChime(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext()
    if (!ctx) {
      resolve()
      return
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    try {
      const now = ctx.currentTime
      const masterGain = ctx.createGain()
      masterGain.connect(ctx.destination)
      masterGain.gain.setValueAtTime(0.35, now)

      // Tone 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.8, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

      osc1.connect(gain1)
      gain1.connect(masterGain)
      osc1.start(now)
      osc1.stop(now + 0.5)

      // Tone 2: A5 (880.00 Hz) — starts slightly after tone 1
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880.0, now + 0.22)
      gain2.gain.setValueAtTime(0, now)
      gain2.gain.setValueAtTime(0.9, now + 0.22)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85)

      osc2.connect(gain2)
      gain2.connect(masterGain)
      osc2.start(now + 0.22)
      osc2.stop(now + 0.85)

      setTimeout(() => resolve(), 750)
    } catch (e) {
      console.warn('Failed to play chime:', e)
      resolve()
    }
  })
}

// FIFO queue for SpeechSynthesis so two near-simultaneous calls (two doctors
// calling patients within a few seconds of each other) don't talk over one
// another — each announcement fully finishes before the next starts.
const speechQueue: Array<() => Promise<void>> = []
let isSpeaking = false

async function processSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return
  isSpeaking = true
  const task = speechQueue.shift()
  if (task) {
    try {
      await task()
    } catch (e) {
      console.error('Speech queue task error:', e)
    }
  }
  isSpeaking = false
  processSpeechQueue()
}

/**
 * Announces a patient call in Bengali with an optional chime.
 * `patientName` is spoken verbatim — see the module-level note on privacy.
 */
export function announcePatientCall({
  patientName,
  roomNumber,
  serialNumber,
  playChime = true,
}: {
  patientName: string
  roomNumber?: string | null
  serialNumber?: number | null
  playChime?: boolean
}): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

  speechQueue.push(async () => {
    if (playChime) {
      await playDingDongChime()
    }

    return new Promise<void>((resolve) => {
      let text = `রোগী ${patientName}`
      if (serialNumber) {
        text = `টোকেন নম্বর ${serialNumber}, রোগী ${patientName}`
      }
      if (roomNumber) {
        text += `, অনুগ্রহ করে ${roomNumber} এ আসুন।`
      } else {
        text += `, অনুগ্রহ করে ডাক্তারের রুমে যান।`
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'bn-BD'
      utterance.rate = 0.88
      utterance.pitch = 1.05

      const voices = window.speechSynthesis.getVoices()
      const bnVoice = voices.find((v) => v.lang.toLowerCase().includes('bn'))
      if (bnVoice) {
        utterance.voice = bnVoice
      }

      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()

      window.speechSynthesis.speak(utterance)

      // Fallback timer in case onend never fires (seen on some Android WebViews).
      setTimeout(() => resolve(), 6000)
    })
  })

  processSpeechQueue()
}
