import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { CameraOff, QrCode, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { parsePrescriptionQr } from '@/lib/prescriptionQr'

const SCANNER_REGION_ID = 'qr-search-scanner-region'

export function QrSearch() {
  const navigate = useNavigate()
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_REGION_ID)
    let stopped = false

    const stopScanner = async () => {
      if (stopped) return
      stopped = true
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        // scanner was never started or already stopped
      }
    }

    const onDecoded = async (decodedText: string) => {
      if (busyRef.current || stopped) return
      busyRef.current = true
      try {
        const parsed = parsePrescriptionQr(decodedText)
        if (!parsed) {
          setScanMessage('This does not look like a prescription QR code from this app. Try again.')
          return
        }
        if (parsed.patientId) {
          await stopScanner()
          navigate(`/patients/${parsed.patientId}`)
          return
        }
        if (parsed.patientCode) {
          setScanMessage(`Looking up ${parsed.patientCode}…`)
          const { data, error } = await supabase
            .from('patients')
            .select('id')
            .eq('patient_code', parsed.patientCode)
            .maybeSingle()
          if (error || !data) {
            setScanMessage(`No patient found for code ${parsed.patientCode}. Try again.`)
            return
          }
          await stopScanner()
          navigate(`/patients/${data.id}`)
        }
      } finally {
        busyRef.current = false
      }
    }

    setCameraError(null)
    setScanMessage(null)
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => { void onDecoded(text) },
        () => { /* no QR detected in this frame — keep scanning */ }
      )
      .catch((err: unknown) => {
        if (stopped) return
        const detail = String((err as { name?: string; message?: string })?.name || (err as Error)?.message || err || '')
        if (detail.includes('NotAllowed') || detail.includes('Permission')) {
          setCameraError('Camera access was denied. Allow camera access for this site in your browser, then try again.')
        } else if (detail.includes('NotFound') || detail.includes('Overconstrained')) {
          setCameraError('No camera was found on this device.')
        } else {
          setCameraError('Could not start the camera. Make sure no other app is using it, then try again.')
        }
      })

    return () => {
      void stopScanner()
    }
  }, [navigate, restartKey])

  return (
    <div className="space-y-6 page-fade-in">
      <div>
        <h1 className="text-2xl font-bold">QR Search</h1>
        <p className="text-text-secondary mt-1">
          Scan the QR code on a printed prescription to open the patient's profile
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-elevation-low border border-gray-200 p-6 max-w-lg mx-auto">
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
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-text-secondary mb-3">
              <QrCode className="w-4 h-4" />
              <span>Point the camera at the prescription QR code</span>
            </div>
          </div>
        )}
        <div id={SCANNER_REGION_ID} className={`overflow-hidden rounded-xl ${cameraError ? 'hidden' : ''}`} />
        {!cameraError && scanMessage && (
          <p className="text-sm text-center text-orange-600 mt-3">{scanMessage}</p>
        )}
      </div>
    </div>
  )
}
