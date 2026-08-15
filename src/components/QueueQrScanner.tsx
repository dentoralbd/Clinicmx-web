import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CameraOff, QrCode, RefreshCw, X } from 'lucide-react'
import { parsePrescriptionQr } from '@/lib/prescriptionQr'

interface QueueQrScannerProps {
  onScan: (patientId: string | null, patientCode: string | null) => void
  onClose: () => void
}

export function QueueQrScanner({ onScan, onClose }: QueueQrScannerProps) {
  // React's useId() rather than Math.random() — guaranteed unique per mount,
  // no possibility of a short/empty random suffix colliding with another
  // scanner instance's DOM id.
  const scannerRegionId = 'queue-qr-' + useId().replace(/:/g, '')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const busyRef = useRef(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    let mounted = true
    let stopped = false

    const stopScanner = async () => {
      if (stopped) return
      stopped = true
      try {
        if (scannerRef.current?.isScanning) await scannerRef.current.stop()
        scannerRef.current?.clear()
      } catch {
        // ignore
      }
    }

    // html5-qrcode needs the target DOM node to exist before construction;
    // a short timeout lets the region div mount first (matches the pattern
    // used elsewhere in this codebase for QR readers).
    const initTimer = setTimeout(() => {
      if (!mounted) return

      const el = document.getElementById(scannerRegionId)
      if (el) el.innerHTML = ''

      scannerRef.current = new Html5Qrcode(scannerRegionId)

      const onDecoded = async (decodedText: string) => {
        if (busyRef.current || stopped) return
        busyRef.current = true
        try {
          const parsed = parsePrescriptionQr(decodedText)
          if (!parsed) {
            setScanMessage('This does not look like a patient QR code. Try again.')
            return
          }
          await stopScanner()
          onScan(parsed.patientId || null, parsed.patientCode || null)
        } finally {
          busyRef.current = false
        }
      }

      setCameraError(null)
      setScanMessage(null)

      scannerRef.current
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            void onDecoded(text)
          },
          () => {
            /* no QR detected this frame */
          }
        )
        .catch((err: unknown) => {
          if (stopped) return
          const detail = String(
            (err as { name?: string; message?: string })?.name || (err as Error)?.message || err || ''
          )
          if (detail.includes('NotAllowed') || detail.includes('Permission')) {
            setCameraError('Camera access was denied.')
          } else if (detail.includes('NotFound') || detail.includes('Overconstrained')) {
            setCameraError('No camera was found on this device.')
          } else {
            setCameraError('Could not start the camera.')
          }
        })
    }, 100)

    return () => {
      mounted = false
      clearTimeout(initTimer)
      void stopScanner()
    }
  }, [onScan, restartKey, scannerRegionId])

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-elevation-lg border border-gray-200 w-full max-w-md overflow-hidden relative">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            Scan Patient QR
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {cameraError ? (
            <div className="text-center py-10">
              <CameraOff className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-text-secondary mb-4">{cameraError}</p>
              <button
                onClick={() => setRestartKey((k) => k + 1)}
                className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : (
            <div className="text-center mb-4">
              <p className="text-sm text-text-secondary">Point camera at patient QR code</p>
            </div>
          )}

          <div id={scannerRegionId} className={`overflow-hidden rounded-xl bg-black ${cameraError ? 'hidden' : ''}`} />

          {!cameraError && scanMessage && <p className="text-sm text-center text-orange-600 mt-4">{scanMessage}</p>}
        </div>
      </div>
    </div>
  )
}
