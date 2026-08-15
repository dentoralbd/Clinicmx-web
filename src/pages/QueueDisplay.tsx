import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Volume2, VolumeX, Settings, X, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  getQueueEntries,
  getQueueSettings,
  updateQueueSettings,
  todayQueueDate,
  subscribeToQueue,
  pollQueue,
  type QueueEntry,
  type QueueSettings,
} from '@/lib/queueApi'
import { sortQueueEntries, computePositions } from '@/lib/queueOrder'
import { calculateQueueEtas } from '@/lib/queueEstimation'
import { formatPatientDisplay, formatSpokenName } from '@/lib/queueDisplay'
import { announcePatientCall, unlockAudio, isAudioUnlocked } from '@/lib/audioChime'
import { isAppAuthenticated, getAppRole } from '@/lib/appSession'

interface QueueSlide {
  title: string
  href: string
  blurb: string
}

// Same fallback list as AGY's queue.html / admin.js (three copies now,
// unavoidable — this one's React/Tailwind, those are vanilla HTML/CSS with
// no shared build step to import from). Slides themselves are managed in
// one place: AGY's admin.html CMS, fetched cross-origin below (CORS is
// already open on that endpoint — it's public content, no credential
// involved). Falls back to this list before an admin has ever saved any.
const DEFAULT_QUEUE_SLIDES: QueueSlide[] = [
  { href: 'https://dentoralbd.com/brushing-flossing.html', title: 'Brushing & Flossing', blurb: 'The daily habits that keep your smile healthy between visits.' },
  { href: 'https://dentoralbd.com/orthodontic-retention.html', title: 'After Braces: Retention', blurb: 'Why wearing your retainer matters just as much as the braces did.' },
  { href: 'https://dentoralbd.com/retainer-instructions.html', title: 'Caring for Your Retainer', blurb: 'Simple steps to keep your retainer clean and lasting longer.' },
  { href: 'https://dentoralbd.com/general-dentistry.html', title: 'General Dentistry', blurb: 'Routine checkups and cleanings — the foundation of a healthy mouth.' },
]

/**
 * Staff/backroom display — behind normal auth, showing full operational
 * detail (assigned doctor, room, all statuses). This is NOT the
 * patient-facing board; that lives on dentoralbd.com/queue so ClinicMx
 * stays invisible to patients (see functions/api/queue-board.ts and the
 * AGY repo's queue.html). This screen is for a staff wall monitor, or for
 * testing the chime/announcement flow without leaving ClinicMx.
 *
 * Declared as a sibling of the DashboardLayout route tree (see App.tsx) —
 * DashboardLayout hard-wires `h-screen flex overflow-hidden` + sidebar +
 * header, so nothing rendered inside it can go true full-screen.
 */
export function QueueDisplay() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [settings, setSettings] = useState<QueueSettings | null>(null)
  const [queueDate, setQueueDate] = useState(todayQueueDate())
  const [audioUnlocked, setAudioUnlocked] = useState(isAudioUnlocked())
  const [showSettings, setShowSettings] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [slides, setSlides] = useState<QueueSlide[]>(DEFAULT_QUEUE_SLIDES)
  const [slideIndex, setSlideIndex] = useState(0)
  const announcedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isAppAuthenticated()) {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  const load = () => {
    getQueueEntries(queueDate).then(setEntries).catch(console.error)
    getQueueSettings().then(setSettings).catch(console.error)
  }

  useEffect(() => {
    load()
    const unsubscribe = subscribeToQueue(load)
    const stopPolling = pollQueue(load, 15000)
    return () => {
      unsubscribe()
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDate])

  // Midnight rollover — re-derive queueDate rather than the sandbox's
  // subscribe-once-with-[]-deps approach, which left an always-on screen
  // stuck on yesterday's filter forever.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = todayQueueDate()
      setQueueDate((prev) => (prev !== now ? now : prev))
    }, 60000)
    return () => window.clearInterval(id)
  }, [])

  const ordered = useMemo(() => sortQueueEntries(entries), [entries])
  const positions = useMemo(() => computePositions(entries), [entries])
  const etas = useMemo(() => calculateQueueEtas(entries), [entries])
  const etaById = useMemo(() => new Map(etas.map((e) => [e.id, e])), [etas])

  const serving = ordered.filter((e) => e.status === 'serving')
  const onHold = ordered.filter((e) => e.status === 'on_hold')
  const waiting = ordered.filter((e) => e.status === 'waiting')

  const privacyMode = settings?.privacy_mode ?? 'full'

  // Announce whenever an entry transitions into 'serving' that we haven't
  // already announced this session.
  useEffect(() => {
    for (const e of serving) {
      if (announcedIds.current.has(e.id)) continue
      announcedIds.current.add(e.id)
      announcePatientCall({
        patientName: formatSpokenName(e, privacyMode),
        roomNumber: e.room_number,
        serialNumber: e.serial_number,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serving.map((e) => e.id).join(','), privacyMode])

  const handleUnlock = async () => {
    const ok = await unlockAudio()
    setAudioUnlocked(ok)
  }

  const setPrivacyMode = async (mode: QueueSettings['privacy_mode']) => {
    setSettings((s) => (s ? { ...s, privacy_mode: mode } : s))
    await updateQueueSettings({ privacy_mode: mode })
  }

  // Slides are managed centrally in AGY's admin CMS, not duplicated here —
  // poll slowly (this screen can run for days) so an admin's edit shows up
  // without anyone reloading the display.
  useEffect(() => {
    const fetchSlides = () => {
      fetch('https://dentoralbd.com/api/cms-config', { cache: 'no-store' })
        .then((r) => r.json())
        .then((config) => {
          const raw: QueueSlide[] = Array.isArray(config.queueSlides) ? config.queueSlides : DEFAULT_QUEUE_SLIDES
          // admin.html stores relative hrefs meant for AGY's own domain
          // (e.g. "brushing-flossing.html") — resolve them against
          // dentoralbd.com so a link clicked on this ClinicMx-hosted screen
          // doesn't 404 against clinicmx-web.pages.dev instead.
          const resolved = raw.map((s) => ({
            ...s,
            href: /^https?:\/\//.test(s.href) ? s.href : `https://dentoralbd.com/${s.href.replace(/^\//, '')}`,
          }))
          setSlides(resolved)
        })
        .catch(() => {
          // Keep whatever slides are already showing — a fetch failure
          // shouldn't blank out a working carousel.
        })
    }
    fetchSlides()
    const id = window.setInterval(fetchSlides, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const infotainmentEnabled = settings?.infotainment_enabled ?? true
  const infotainmentIntervalSecs = settings?.infotainment_interval_secs ?? 12

  useEffect(() => {
    if (!infotainmentEnabled || slides.length <= 1) return
    const id = window.setInterval(() => {
      setSlideIndex((i) => (i + 1) % slides.length)
    }, Math.max(5, infotainmentIntervalSecs) * 1000)
    return () => window.clearInterval(id)
  }, [infotainmentEnabled, infotainmentIntervalSecs, slides.length])

  const role = getAppRole()
  const canEditSettings = role === 'admin'

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-10 flex flex-col gap-8">
      {!audioUnlocked && (
        <button
          onClick={handleUnlock}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center text-center"
        >
          <div>
            <Volume2 className="w-12 h-12 mx-auto mb-3 text-primary" />
            <p className="text-lg font-semibold">Tap anywhere to enable sound</p>
          </div>
        </button>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">ClinicMx — Queue (Staff Display)</h1>
        <div className="flex items-center gap-3">
          <span className={audioUnlocked ? 'text-emerald-400' : 'text-amber-400'}>
            {audioUnlocked ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </span>
          {/* Scan to open /queue on a phone instead of typing the local
              network address — same "Connect Devices" idea from the
              redesign sandbox this feature was ported from, just scoped to
              the one link staff actually asked for (reception's Queue
              Management page). Any staff viewing this screen can use it,
              not just admins — it's a shortcut, not a setting. */}
          <button onClick={() => setShowQr(true)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="Scan to open Queue Management">
            <QrCode className="w-5 h-5" />
          </button>
          {canEditSettings && (
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.3fr,1fr]">
        <div>
          <div className="text-sm uppercase tracking-widest text-emerald-400 font-bold mb-3">Now Serving</div>
          {serving.length === 0 && onHold.length === 0 ? (
            <div className="text-4xl font-black text-gray-600 py-16 text-center border-2 border-dashed border-gray-800 rounded-3xl">
              — Waiting for next patient —
            </div>
          ) : (
            <div className="space-y-4">
              {serving.map((e) => (
                <div key={e.id} className="bg-emerald-500/10 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl">
                  <div className="text-5xl font-black tracking-tight">{formatPatientDisplay(e, privacyMode)}</div>
                  <div className="mt-2 text-lg text-emerald-300 font-semibold">
                    {e.procedure_name || 'Consultation'} {e.room_number ? `· ${e.room_number}` : ''}
                  </div>
                </div>
              ))}
              {onHold.map((e) => (
                <div key={e.id} className="bg-amber-500/10 border border-amber-500/40 rounded-3xl p-5">
                  <div className="text-3xl font-bold">{formatPatientDisplay(e, privacyMode)}</div>
                  <div className="mt-1 text-amber-300 font-medium">{e.hold_reason} — in preparation</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm uppercase tracking-widest text-gray-400 font-bold mb-3">Next in Line</div>
          <div className="space-y-2">
            {waiting.length === 0 && <div className="text-gray-600 text-lg">Queue is empty</div>}
            {waiting.map((e) => {
              const eta = etaById.get(e.id)
              return (
                <div key={e.id} className="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-mono font-bold text-sm">
                      {positions.get(e.id)}
                    </span>
                    <div>
                      <div className="font-semibold">{formatPatientDisplay(e, privacyMode)}</div>
                      <div className="text-xs text-gray-400">{e.procedure_name || 'Consultation'}</div>
                    </div>
                  </div>
                  {eta && <div className="text-sm text-teal-300 font-mono">~{eta.etaMinutesFromNow}m</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {infotainmentEnabled && slides.length > 0 && slides[slideIndex] && (
        <a
          href={slides[slideIndex].href}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-white/10 bg-white/5 p-6 text-inherit no-underline hover:bg-white/[0.07] transition-colors"
        >
          <h3 className="text-lg font-bold text-teal-300">{slides[slideIndex].title}</h3>
          <p className="mt-1 text-sm text-gray-400">{slides[slideIndex].blurb}</p>
        </a>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Display Settings</h2>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Patient identification</div>
            <div className="space-y-1.5">
              {(['full', 'masked', 'token_only'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPrivacyMode(mode)}
                  className={`w-full text-left p-2 rounded-lg text-sm border ${
                    privacyMode === mode ? 'bg-primary/20 border-primary text-white' : 'border-gray-700 text-gray-300'
                  }`}
                >
                  {mode === 'full' ? 'Full name' : mode === 'masked' ? 'Masked (initial only)' : 'Token number only'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Saved server-side — persists across reloads and applies to every screen, including the patient-facing
              board on dentoralbd.com.
            </p>
          </div>
        </div>
      )}

      {showQr && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xs text-white text-center">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Scan to Open Queue</h2>
              <button onClick={() => setShowQr(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white rounded-xl p-4 inline-block">
              <QRCodeSVG value={`${window.location.origin}/queue`} size={200} />
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Scan with a phone's camera to open Queue Management directly — no need to type the address.
              Still requires logging in on that device.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
