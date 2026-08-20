// The print stylesheet pins the invoice/prescription footer with position:fixed (so it can never
// add height to the document and spill a trailing blank page — see index.css) and reserves space
// for it via the --clinicmx-print-footer-h custom property, read as a padding-bottom on the print
// container. Call this right before window.print() so that reserve matches the footer's actual
// rendered height instead of a guessed constant that goes stale as the footer's content changes
// (e.g. the QR block being present or not).
export function applyPrintFooterReserve() {
  const footer = document.querySelector<HTMLElement>('.prescription-print-footer, .invoice-print-footer')
  if (!footer) return
  document.documentElement.style.setProperty('--clinicmx-print-footer-h', `${Math.ceil(footer.offsetHeight) + 24}px`)
}
