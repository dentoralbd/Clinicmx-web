# UI-UX.md — Design System & UI Standards

How ClinicMx looks and behaves. Sources of truth: `tailwind.config.cjs` (tokens), `src/index.css` (global/base/print styles), `src/components/ui/` (primitives). Mobile is a first-class target — the dentist uses the app chairside on a phone.

---

## 1. Color tokens (`tailwind.config.cjs`)

Use the semantic Tailwind classes, never raw hex in components.

| Token | Hex | Use |
|---|---|---|
| `primary` / `primary-hover` | `#0D9488` / `#0F766E` | Teal brand — primary buttons, active nav, links, focus rings, spinners |
| `highlight` / `highlight-hover` | `#E91E8C` / `#C7186F` | Pink — key CTAs and accents that must pop against the teal |
| `accent` | `#F2876B` | Coral — secondary accents, chips |
| `success` | `#2E9E83` | Positive states, paid, completed |
| `warning` | `#E8A33D` | Dues, low stock, offline/reminder banners |
| `error` | `#D2554A` | Errors, destructive actions, overdue |
| `background` | `#F0FDFB` | App page background (pale teal) |
| `card` / `card-hover` | `#FFFFFF` / `#FAFDFD` | Card/panel surfaces |
| `surface-subtle` / `surface-glass` | `#F6FCFA` / `rgba(255,255,255,.85)` | Recessed fields, glass-panel backgrounds |
| `primary-light` / `primary-surface` | `#E6F4F1` / `#F2FAF8` | Soft teal tints (banners, active-row highlight) |
| `highlight-light` | `#FCE4EC` | Soft pink tint |
| `accent-light` | `#FFF0ED` | Soft coral tint |
| `border` | `#E2E8F0` | Default border (applied globally via `* { @apply border-border }`) |
| `text-primary` / `text-secondary` / `text-muted` | `#0B1F26` / `#51707B` / `#839EAA` | Body text / muted text / faint text |

These are also the PWA manifest colors (theme `#0D9488`, background `#F0FDFB`) when M1 lands. Light theme only — there is no dark mode.

## 2. Typography & iconography

- Fonts: **Inter** (`sans`, body/UI text) and **Space Grotesk** (`font-display`, headings) — both bundled via `@fontsource/*` and imported in `main.tsx` (weights 400/500/600/700). No CDN/Google Fonts link; everything is self-hosted so the APK WebView doesn't depend on network fonts.
- Print layouts intentionally switch to **Times New Roman** (serif) to match the physical prescription pad and formal invoices.
- Icons: **lucide-react** exclusively; sizes 16–20px inline, consistent stroke.
- Currency: BDT (৳); prescriptions render clinical fields in **Bengali** where translated (`medicationBengali.ts`).

## 3. Elevation & shape

- Shadows: `shadow-elevation-low` (cards at rest) → `elevation-md` (hover/dropdowns) → `elevation-high` (modals, FAB). Also `shadow-glass` (soft ambient shadow for glass panels) and `shadow-glow-primary` (teal glow for emphasis, used sparingly). Defined in the Tailwind config; don't invent ad-hoc shadows.
- Radius: rounded cards/inputs (`rounded-lg`/`rounded-xl` prevail); pill badges for statuses.

## 4. Layout

- **Shell:** `DashboardLayout` = fixed `Sidebar` (collapsible; hidden on mobile) + top `Header` (page title, notification bell, logout) + scrollable content on the `background` tint. Mobile navigation is a bottom bar / drawer pattern with 44px targets.
- **Cards on a tinted canvas:** content lives in white cards; the pale-teal page background provides separation.
- **Patient Profile** is the flagship layout: smart header (`PatientHeader` — identity, code, quick stats), tab bar (Visits, Treatments, Prescriptions, Files, Dental Chart, Billing…), an `ActivityTimeline`, and a quick-add **FAB** for common actions.
- Billing invoice cards use **per-patient color accents** for scanability (2026-07-16 redesign).

## 5. Mobile & touch rules (`index.css`, enforced globally)

- Minimum touch target **44px** for buttons and links; icon-only buttons use `.icon-button` (44×44 inline-flex) so they don't stretch layouts.
- All inputs/selects/textareas ≥ **16px font-size** — prevents iOS focus zoom.
- `-webkit-overflow-scrolling: touch` on scroll areas.
- Modals: on ≤640px, `.modal-content` goes full-width with `max-height: calc(100vh - 2rem)` and internal scroll. Every modal must have a visible close (X) button (standardized 2026-07-17).
- Tables/rows must not overflow horizontally on phones — recurring bug class; test at 375px width.
- **Non-wrapping flex control bars and hard `grid-cols-N` are the other recurring mobile bug class (2026-08-01):** a modal's top control bar (title + action buttons) needs `flex-col sm:flex-row` (or `flex-wrap`), not a bare `flex items-center justify-between` — otherwise a wrapping title and a button row fight for the same horizontal space and visually overlap once the title exceeds one line. Summary/stat grids need to step down column count below `sm:` (e.g. `grid-cols-2 sm:grid-cols-4`), not stay fixed at 3–4 columns, or currency values collide into unreadable overlapping text on a phone width. Found in the Clinic Revenue Statement print modal; check any new modal/report header against this pattern.

## 6. Motion & feedback

- `.page-fade-in` (0.28s) / `.section-fade-in` (0.22s) — **opacity-only on purpose**: animating transform on a wrapper turns it into the containing block for `position:fixed` descendants (modals, bottom nav) and breaks them, permanently in background tabs. Don't "upgrade" these to slide/scale.
- `.spinner` / `.spinner-sm` — teal-top border spinner; `.skeleton` — shimmer placeholder blocks for loading lists.
- `.shake` (0.4s) — invalid input/login feedback.
- Loading states: full-page spinner on first load; skeletons in lists; button-level spinners on submit.

## 7. Print & PDF standards

- Print flows render a hidden overlay (`.prescription-print-overlay`, `.invoice-print-overlay`) and `@media print` hides everything else (`visibility` trick). Blocks use `break-inside: avoid`.
- Prescription print matches the clinic's physical pad: 3-column letterhead with logo, Rx body, footer pinned to the page bottom (fixed positioning), QR code, Bengali medication lines, Times New Roman.
- Invoices offer **Detailed** and **Receipt** formats, plus combined statements and list prints.
- **Only the prescription PDF** is generated by rasterizing the live DOM — `domToPdf.ts`'s `buildPdfFromElement()` (html2canvas) captures `#prescription-print-root` at a **forced desktop width** (`DESKTOP_CAPTURE_WIDTH = 768`, hard-coded to match `PrescriptionPrint.tsx`'s `max-w-3xl`) so a phone-shared prescription is identical to the printed page — this exists because jsPDF's default fonts have no Bengali glyphs and the QR code is an inline SVG. Any change to that width class must update the constant too, or the shared PDF silently mis-lays out. All other PDFs (invoices, statements, treatment plans/estimates, analytics reports) are **drawn directly with jsPDF/jspdf-autotable** — they don't screenshot a print component, so restyling those print components' *markup* doesn't affect their PDF output (only their `sharePdf()`-routed drawing code does). Any print-layout change must still be checked in three modes: browser print, downloaded PDF, WhatsApp-shared PDF.
- **Every PDF "download" must go through `sharePdf()` (`src/lib/sharePdf.ts`), never a raw `jsPDF.save()` (2026-08-01):** the app also runs as a native Android APK (`Clinicmx-web-apk`, sibling Capacitor project — bare WebView pointed at the live site, no bundled build). `jsPDF.save()` relies on the browser's native `<a download>` + blob-URL mechanism, which silently does nothing in that WebView. `sharePdf()` tries the Web Share API first (`navigator.share` with a real `File`), which the Capacitor WebView *does* support and opens the native OS share sheet; falls back to download+alert only when Web Share isn't available. Every PDF generator should **return** the `jsPDF` document rather than calling `.save()` on it internally, so the caller can route it through `sharePdf()` — found three call sites (Doctor Analytics, Clinic Analytics, Staff Analytics) that skipped this and silently failed in the app. For a generic "just give me the file" download with no specific recipient, omit `channel`/`email`/`waNumber` from `SharePdfInfo` — the fallback shows a plain "downloaded" alert instead of trying to open a mail/WhatsApp compose window.

## 8. UX conventions

- **Search:** one unified patient search behavior everywhere (name / phone / patient code; phone digits normalized) — reuse the shared logic in `lib/patients.ts`, don't fork it (false-positive bugs were fixed by unifying it site-wide).
- **Destructive actions:** confirm dialogs; deletes are snapshot-logged and restorable from the Admin zone; delete/revert visibility follows permissions (`canDelete`/`canRevert`).
- **Empty states:** friendly prompt + primary action (e.g. "Add your first patient").
- **Errors:** inline near the action; `ErrorBoundary` catches render crashes; failed saves keep form state.
- **Dates/times:** `date-fns`, local clinic time, no timezone display.
- **Forms:** modals for create/edit; patients creatable inline wherever a patient is selected (appointments, prescriptions) — never dead-end a flow to another page.
- **Language:** UI chrome in English; clinical output (prescriptions) bilingual English/Bengali.

## 9. Accessibility

Pragmatic baseline: semantic buttons/labels, 44px targets, visible focus states on inputs, sufficient text contrast on the pale background (text-primary on card ≈ 14:1). No formal WCAG audit has been done; screen-reader support is untested — flag regressions but don't gold-plate.
