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
  category?: string
  theme?: 'teal' | 'purple' | 'orange' | 'blue'
}

// Card background per theme — matches AGY queue.html's SLIDE_THEMES and
// the redesign sandbox's per-category gradient palette this was modeled on.
const SLIDE_THEME_CLASSES: Record<string, string> = {
  teal: 'from-teal-600 to-teal-800',
  purple: 'from-violet-600 to-fuchsia-500',
  orange: 'from-orange-600 to-red-600',
  blue: 'from-blue-600 to-sky-500',
}

// Same fallback list as AGY's queue.html / admin.js (three copies now,
// unavoidable — this one's React/Tailwind, those are vanilla HTML/CSS with
// no shared build step to import from). Slides themselves are managed in
// one place: AGY's admin.html CMS, fetched cross-origin below (CORS is
// already open on that endpoint — it's public content, no credential
// involved). Falls back to this list before an admin has ever saved any.
const DEFAULT_QUEUE_SLIDES: QueueSlide[] = [
  { href: 'https://dentoralbd.com/brushing-flossing.html', title: 'Brushing & Flossing', blurb: 'The daily habits that keep your smile healthy between visits.', category: 'Dental Hygiene', theme: 'blue' },
  { href: 'https://dentoralbd.com/orthodontics.html', title: 'Specialized Orthodontics', blurb: 'Straightening smiles at every age, from early intervention to adult treatment.', category: 'Orthodontics', theme: 'purple' },
  { href: 'https://dentoralbd.com/orthodontic-retention.html', title: 'After Braces: Retention', blurb: 'Why wearing your retainer matters just as much as the braces did.', category: 'Orthodontics', theme: 'teal' },
  { href: 'https://dentoralbd.com/retainer-instructions.html', title: 'Caring for Your Retainer', blurb: 'Simple steps to keep your retainer clean and lasting longer.', category: 'Orthodontics', theme: 'orange' },
  { href: 'https://dentoralbd.com/general-dentistry.html', title: 'General Dentistry', blurb: 'Routine checkups and cleanings — the foundation of a healthy mouth.', category: 'General Dentistry', theme: 'blue' },
  { href: 'https://dentoralbd.com/cosmetic-dentistry.html', title: 'Cosmetic Dentistry', blurb: 'Whitening, veneers, and smile makeovers designed to fit your face.', category: 'Aesthetic Dentistry', theme: 'purple' },
  { href: 'https://dentoralbd.com/prosthodontics.html', title: 'Prosthodontics', blurb: 'Crowns, bridges, and dentures that restore both function and confidence.', category: 'Advanced Treatment', theme: 'orange' },
  { href: 'https://dentoralbd.com/for-children.html', title: 'Dental Care for Children', blurb: 'Gentle, age-appropriate checkups that build healthy habits early.', category: "Children's Dentistry", theme: 'teal' },
  { href: 'https://dentoralbd.com/types-of-braces.html', title: 'Types of Braces', blurb: 'Metal, ceramic, or clear aligners — find the right fit for your treatment.', category: 'Orthodontics', theme: 'blue' },
  { href: 'https://dentoralbd.com/faqs.html', title: 'Frequently Asked Questions', blurb: 'Answers to the questions patients ask us most.', category: 'Patient Info', theme: 'purple' },
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
  const [notices, setNotices] = useState<string[]>([])
  const [ticker, setTicker] = useState('')
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
          setNotices(Array.isArray(config.clinicNotices) ? config.clinicNotices.filter(Boolean) : [])
          setTicker(typeof config.announcementTicker === 'string' ? config.announcementTicker.trim() : '')
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

      <div className="grid gap-8 lg:grid-cols-[1.2fr,1fr] items-start">
        <div className="flex flex-col gap-8">
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

        <div className="flex flex-col gap-8">
          {infotainmentEnabled && slides.length > 0 && slides[slideIndex] && (
            <div
              className={`relative min-h-[9.5rem] rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br ${
                SLIDE_THEME_CLASSES[slides[slideIndex].theme ?? 'teal']
              }`}
            >
              {/* key={slideIndex} forces remount on rotation so the fade-in
                  animation replays each time, rather than a single element's
                  text just changing in place with no transition. */}
              <a
                key={slideIndex}
                href={slides[slideIndex].href}
                target="_blank"
                rel="noreferrer"
                className="block p-7 pb-10 text-inherit no-underline hover:brightness-110 transition-all animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                {slides[slideIndex].category && (
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wide text-white bg-white/20 px-2.5 py-1 rounded-full mb-3">
                    {slides[slideIndex].category}
                  </span>
                )}
                <h3 className="text-xl font-bold text-white max-w-[75%]">{slides[slideIndex].title}</h3>
                <p className="mt-1 text-sm text-white/85 leading-relaxed max-w-[75%]">{slides[slideIndex].blurb}</p>
                <span className="absolute top-6 right-7 text-white/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-9 h-9">
                    <path d="M12 5c-2.5 0-4.5 2-4.5 4.5 0 3 1.5 4 1.5 7.5 0 1 .5 2 1.5 2s1.5-1 1.5-2c0-1 .3-1.5 1-1.5s1 .5 1 1.5c0 1 .5 2 1.5 2s1.5-1 1.5-2c0-3.5 1.5-4.5 1.5-7.5C16.5 7 14.5 5 12 5z" />
                  </svg>
                </span>
                <span className="absolute bottom-3.5 right-7 text-[11px] font-semibold text-white/55">DentOral BD</span>
              </a>
              {slides.length > 1 && (
                <div className="absolute bottom-4 left-7 flex gap-1.5">
                  {slides.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        i === slideIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/35'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {notices.length > 0 && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
              <div className="text-sm uppercase tracking-widest text-gray-400 font-bold mb-4">Clinic Notices</div>
              <ul className="space-y-3">
                {notices.map((n, i) => (
                  <li key={i} className="relative pl-4 text-sm leading-relaxed text-gray-200">
                    <span className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-teal-400" />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {ticker && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 py-3 overflow-hidden whitespace-nowrap">
          <div
            className="inline-block font-bold text-sm text-amber-300"
            style={{ paddingLeft: '100%', animation: 'queue-ticker-scroll 26s linear infinite' }}
          >
            {ticker}
          </div>
          <style>{`
            @keyframes queue-ticker-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
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
