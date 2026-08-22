import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Volume2, VolumeX, Settings, X, QrCode, Activity, Clock, CheckCircle2 } from 'lucide-react'
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
  icon?: string
  subtitle?: string
}

// Card background per theme — matches AGY queue.html's SLIDE_THEMES and
// the redesign sandbox's per-category gradient palette this was modeled on.
const SLIDE_THEME_CLASSES: Record<string, string> = {
  teal: 'from-teal-600 to-teal-800',
  purple: 'from-violet-600 to-fuchsia-500',
  orange: 'from-orange-600 to-red-600',
  blue: 'from-blue-600 to-sky-500',
}

// Per-slide emoji (2026-08-22, matches the redesign sandbox's per-category
// icon). Resolution order: the slide's own `icon` (set in AGY's admin.html
// → Queue Board Slides) → this category lookup → the generic tooth
// fallback. Kept in sync with the same map in AGY's queue.html and
// admin.js — three copies, no shared build step between them.
const CATEGORY_EMOJI: Record<string, string> = {
  'Dental Hygiene': '✨',
  'Orthodontics': '🦷',
  'General Dentistry': '🪥',
  'Aesthetic Dentistry': '💎',
  'Advanced Treatment': '🛡️',
  "Children's Dentistry": '🧸',
  'Patient Info': 'ℹ️',
  'Preventive Care': '🛡️',
}
const FALLBACK_SLIDE_EMOJI = '🦷'
function slideEmoji(s: QueueSlide): string {
  return s.icon || (s.category && CATEGORY_EMOJI[s.category]) || FALLBACK_SLIDE_EMOJI
}

// Same fallback list as AGY's queue.html / admin.js (three copies now,
// unavoidable — this one's React/Tailwind, those are vanilla HTML/CSS with
// no shared build step to import from). Slides themselves are managed in
// one place: AGY's admin.html CMS, fetched cross-origin below (CORS is
// already open on that endpoint — it's public content, no credential
// involved). Falls back to this list before an admin has ever saved any.
const DEFAULT_QUEUE_SLIDES: QueueSlide[] = [
  { href: 'https://dentoralbd.com/brushing-flossing.html', title: 'Brushing & Flossing', blurb: 'The daily habits that keep your smile healthy between visits.', category: 'Dental Hygiene', theme: 'blue', icon: '✨' },
  { href: 'https://dentoralbd.com/orthodontics.html', title: 'Specialized Orthodontics', blurb: 'Straightening smiles at every age, from early intervention to adult treatment.', category: 'Orthodontics', theme: 'purple', icon: '🦷' },
  { href: 'https://dentoralbd.com/orthodontic-retention.html', title: 'After Braces: Retention', blurb: 'Why wearing your retainer matters just as much as the braces did.', category: 'Orthodontics', theme: 'teal', icon: '🦷' },
  { href: 'https://dentoralbd.com/retainer-instructions.html', title: 'Caring for Your Retainer', blurb: 'Simple steps to keep your retainer clean and lasting longer.', category: 'Orthodontics', theme: 'orange', icon: '🦷' },
  { href: 'https://dentoralbd.com/general-dentistry.html', title: 'General Dentistry', blurb: 'Routine checkups and cleanings — the foundation of a healthy mouth.', category: 'General Dentistry', theme: 'blue', icon: '🪥' },
  { href: 'https://dentoralbd.com/cosmetic-dentistry.html', title: 'Cosmetic Dentistry', blurb: 'Whitening, veneers, and smile makeovers designed to fit your face.', category: 'Aesthetic Dentistry', theme: 'purple', icon: '💎' },
  { href: 'https://dentoralbd.com/prosthodontics.html', title: 'Prosthodontics', blurb: 'Crowns, bridges, and dentures that restore both function and confidence.', category: 'Advanced Treatment', theme: 'orange', icon: '🛡️' },
  { href: 'https://dentoralbd.com/for-children.html', title: 'Dental Care for Children', blurb: 'Gentle, age-appropriate checkups that build healthy habits early.', category: "Children's Dentistry", theme: 'teal', icon: '🧸' },
  { href: 'https://dentoralbd.com/types-of-braces.html', title: 'Types of Braces', blurb: 'Metal, ceramic, or clear aligners — find the right fit for your treatment.', category: 'Orthodontics', theme: 'blue', icon: '🦷' },
  { href: 'https://dentoralbd.com/faqs.html', title: 'Frequently Asked Questions', blurb: 'Answers to the questions patients ask us most.', category: 'Patient Info', theme: 'purple', icon: 'ℹ️' },
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
  const [clockNow, setClockNow] = useState(new Date())
  const announcedIds = useRef<Set<string>>(new Set())

  // Header clock — display-only, doesn't drive any queue logic.
  useEffect(() => {
    const id = window.setInterval(() => setClockNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

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
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10 flex flex-col gap-8">
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

      <div className="flex items-center justify-between bg-slate-900/90 backdrop-blur-lg border border-slate-800/80 rounded-3xl px-6 py-4 shadow-lg">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain rounded-xl bg-white/5 p-1 border border-white/10" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white tracking-tight">ClinicMx</h1>
              <span className="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Live Queue
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Staff Display</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
            {audioUnlocked ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-amber-400" />}
            <span className={audioUnlocked ? 'text-emerald-400' : 'text-amber-400'}>{audioUnlocked ? 'Audio Active' : 'Tap for Audio'}</span>
          </div>
          {/* Scan to open /queue on a phone instead of typing the local
              network address — same "Connect Devices" idea from the
              redesign sandbox this feature was ported from, just scoped to
              the one link staff actually asked for (reception's Queue
              Management page). Any staff viewing this screen can use it,
              not just admins — it's a shortcut, not a setting. */}
          <button
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-slate-200 text-xs font-semibold transition-colors shadow-sm"
            title="Scan to open Queue Management"
          >
            <QrCode className="w-4 h-4 text-teal-400" />
            Connect Devices
          </button>
          {canEditSettings && (
            <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          )}
          <div className="hidden md:block pl-3 border-l border-slate-800 text-right">
            <div className="text-xl font-bold font-mono tracking-tight text-white">
              {clockNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              {clockNow.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr,1fr] items-start">
        <div className="flex flex-col gap-8">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                Now Serving <span className="text-slate-500 normal-case font-medium">/ এখন ডাকা হচ্ছে</span>
              </div>
            </div>
            {serving.length === 0 && onHold.length === 0 ? (
              <div className="h-44 bg-slate-900/60 rounded-3xl border border-slate-800/80 flex flex-col items-center justify-center text-slate-500 p-6 backdrop-blur-sm">
                <Activity className="w-10 h-10 mb-2 opacity-40 text-teal-400" />
                <div className="text-lg font-semibold text-slate-400">No Patient Currently in Consultation</div>
                <p className="text-xs text-slate-500 mt-1">Next waiting patient will be called shortly</p>
              </div>
            ) : (
              <div className="space-y-4">
                {serving.map((e) => (
                  <div key={e.id} className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-r from-teal-900/90 via-slate-900/90 to-emerald-950/90 border-2 border-emerald-500/50 shadow-2xl shadow-emerald-950/50">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10">
                      <div className="text-5xl font-black tracking-tight">{formatPatientDisplay(e, privacyMode)}</div>
                      <div className="mt-2 text-lg text-emerald-300 font-semibold">
                        {e.procedure_name || 'Consultation'} {e.room_number ? `· ${e.room_number}` : ''}
                      </div>
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
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Next in Line <span className="text-slate-500 normal-case font-medium">/ পরবর্তী রোগীগণ</span>
                {waiting.length > 0 && (
                  <span className="text-[10px] font-bold text-teal-300 bg-teal-950/60 border border-teal-500/30 px-2 py-0.5 rounded-lg normal-case tracking-normal">
                    AI Smart ETAs
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 font-medium">{waiting.length} patient{waiting.length === 1 ? '' : 's'} waiting</span>
            </div>
            <div className="space-y-2">
              {waiting.length === 0 && (
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center text-slate-500 py-8 backdrop-blur-sm">
                  <CheckCircle2 className="w-7 h-7 mb-2 opacity-50 text-teal-400" />
                  <div className="text-sm font-semibold text-slate-400">Waiting Lounge is Clear</div>
                  <p className="text-xs text-slate-500 mt-0.5">All arriving patients have been attended</p>
                </div>
              )}
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
              className={`relative min-h-[13.75rem] rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br ${
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
                {slides[slideIndex].subtitle && (
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-white/80 mb-1">
                    {slides[slideIndex].subtitle}
                  </span>
                )}
                <h3 className="text-xl font-bold text-white max-w-[75%]">{slides[slideIndex].title}</h3>
                <p className="mt-1 text-sm text-white/85 leading-relaxed max-w-[75%]">{slides[slideIndex].blurb}</p>
                <span className="absolute top-6 right-7 text-xl leading-none">{slideEmoji(slides[slideIndex])}</span>
                <span className="absolute -bottom-8 -right-8 text-8xl opacity-15 pointer-events-none select-none leading-none">
                  {slideEmoji(slides[slideIndex])}
                </span>
                {/* Footer band, pinned near the card's bottom edge like the
                    watermark always was — the taller card (2026-08-22)
                    leaves empty space between the blurb and this band
                    rather than the two touching, matching the redesign
                    sandbox. Positioned the same way .slide-dots below is
                    (independent absolute element at a matching bottom
                    offset), since the dots are a single set shared across
                    every slide, not duplicated per slide. */}
                <div className="absolute left-7 right-7 bottom-6 flex justify-end pt-3 border-t border-white/20">
                  <span className="text-[11px] font-semibold text-white/55">DentOral BD</span>
                </div>
              </a>
              {slides.length > 1 && (
                <div className="absolute bottom-6 left-7 flex gap-1.5">
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
