import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  MessageSquare,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import {
  generateDynamicBanglaQr,
  getStoredMerchantQrTemplate,
  extractMerchantInfo,
} from '@/lib/banglaQr'
import { parsePaymentSms, parseVerifiedSenderSms, type ParsedPaymentSms } from '@/lib/smsParsers'
import { isNativeSmsAvailable, hasSmsPermission, requestSmsPermission, readRecentSms } from '@/lib/nativeSms'
import { recordInvoicePayment } from '@/lib/payments'
import { logActivity } from '@/lib/activityLog'
import { logBillingError, getFriendlySupabaseErrorMessage } from '@/lib/billing'

export interface BanglaQrPaymentSuccess {
  paymentId: string | null
  amount: number
  dateIso: string
  notes: string | null
}

interface BanglaQrPaymentModalProps {
  invoiceId: string
  invoiceNumber?: string | null
  invoiceTotal: number
  invoicePaid: number
  initialAmount?: number
  patientId?: string | null
  patientName?: string | null
  patientPhone?: string | null
  onClose: () => void
  onSaved: () => void
  onPrintReceipt?: (payment: BanglaQrPaymentSuccess) => void
}

export function BanglaQrPaymentModal({
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  invoicePaid,
  initialAmount,
  patientId,
  patientName,
  patientPhone,
  onClose,
  onSaved,
  onPrintReceipt,
}: BanglaQrPaymentModalProps) {
  // Total remaining invoice balance
  const invoiceDue = useMemo(() => Math.max(invoiceTotal - invoicePaid, 0), [invoiceTotal, invoicePaid])

  // Intended payment amount for this specific QR code (defaults to entered initialAmount or full invoice due)
  const defaultPayAmount = useMemo(() => {
    if (initialAmount && initialAmount > 0) return String(initialAmount)
    return invoiceDue > 0 ? String(invoiceDue) : '0'
  }, [initialAmount, invoiceDue])

  const [qrAmount, setQrAmount] = useState<string>(defaultPayAmount)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [activeTab, setActiveTab] = useState<'sms' | 'manual'>('sms')

  // SMS Paste state
  const [smsText, setSmsText] = useState('')
  const [parsedSms, setParsedSms] = useState<ParsedPaymentSms | null>(null)
  // True only when the current smsText came from the device's own SMS inbox (native
  // auto-capture), not a manual paste — gates gatewayStatus: 'sms_auto_verified' below.
  // Reset on every manual edit so a subsequently-edited text isn't mislabeled as verified.
  const [isNativeVerified, setIsNativeVerified] = useState(false)

  // ── Native SMS auto-capture (Android APK only — src/lib/nativeSms.ts) ──
  const nativeAvailable = useMemo(() => isNativeSmsAvailable(), [])
  const [nativeSmsStatus, setNativeSmsStatus] = useState<'requesting' | 'watching' | 'found' | 'unavailable'>('requesting')

  // Manual verify state
  const [manualAmount, setManualAmount] = useState<string>(defaultPayAmount)
  const [manualTxnId, setManualTxnId] = useState('')
  const [manualMethod, setManualMethod] = useState('Pubali Bank Bangla QR')

  // Action / Saving state
  const [saving, setSaving] = useState(false)
  const [successData, setSuccessData] = useState<{
    paymentId: string | null
    amount: number
    dateIso: string
    notes: string | null
    transactionId?: string | null
    providerLabel: string
    timestamp: string
  } | null>(null)

  const numQrAmount = parseFloat(qrAmount) || 0
  const remainingAfterPayment = Math.max(invoiceDue - numQrAmount, 0)

  const merchantTemplate = useMemo(() => getStoredMerchantQrTemplate(), [])
  const merchantInfo = useMemo(() => extractMerchantInfo(merchantTemplate), [merchantTemplate])

  // Dynamic QR is generated for the exact requested payment amount
  const dynamicQr = useMemo(() => {
    if (numQrAmount <= 0) return null
    return generateDynamicBanglaQr(merchantTemplate, numQrAmount, invoiceNumber || undefined)
  }, [merchantTemplate, numQrAmount, invoiceNumber])

  // Auto parse pasted SMS
  useEffect(() => {
    if (!smsText.trim()) {
      setParsedSms(null)
      return
    }
    const parsed = parsePaymentSms(smsText)
    setParsedSms(parsed)
  }, [smsText])

  // Watch the device's SMS inbox (Android APK only) for a sender-verified bank/MFS
  // confirmation and auto-fill the Paste SMS tab the instant one arrives.
  useEffect(() => {
    if (!nativeAvailable) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    const watchStartMs = Date.now() - 5000 // small backward buffer for clock skew

    async function start() {
      setNativeSmsStatus('requesting')
      if (!hasSmsPermission()) {
        requestSmsPermission()
        for (let i = 0; i < 6 && !cancelled; i++) {
          await new Promise((resolve) => setTimeout(resolve, 700))
          if (hasSmsPermission()) break
        }
      }
      if (cancelled) return
      if (!hasSmsPermission()) {
        setNativeSmsStatus('unavailable')
        return
      }
      setNativeSmsStatus('watching')
      intervalId = setInterval(() => {
        const messages = readRecentSms(watchStartMs)
        for (const msg of messages) {
          const match = parseVerifiedSenderSms(msg.sender, msg.body)
          if (match) {
            setSmsText(match.rawText)
            setIsNativeVerified(true)
            setActiveTab('sms')
            setNativeSmsStatus('found')
            if (intervalId) clearInterval(intervalId)
            break
          }
        }
      }, 3000)
    }

    start()
    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
    // Runs once per modal mount — deliberately not re-run on prop/state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAvailable])

  // Computed amounts & mismatch flags
  const smsPaidAmount = parsedSms?.amount ?? null
  const numManualAmount = parseFloat(manualAmount) || 0

  const activePaidAmount = activeTab === 'sms'
    ? (smsPaidAmount !== null && smsPaidAmount > 0 ? smsPaidAmount : numQrAmount)
    : numManualAmount

  // Compare SMS against the requested QR amount
  const isSmsMismatch = parsedSms !== null && parsedSms.amount > 0 && Math.abs(parsedSms.amount - numQrAmount) > 0.01
  const isManualMismatch = activeTab === 'manual' && numManualAmount > 0 && Math.abs(numManualAmount - numQrAmount) > 0.01

  function handleCopyPayload() {
    if (!dynamicQr?.payload) return
    navigator.clipboard.writeText(dynamicQr.payload)
    setCopiedPayload(true)
    setTimeout(() => setCopiedPayload(false), 2000)
  }

  async function handleDownloadQr() {
    const svg = document.getElementById('bangla-qr-code-svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    const fileName = `BanglaQR_${invoiceNumber || 'Payment'}_${numQrAmount}BDT.png`
    img.onload = async () => {
      canvas.width = img.width + 40
      canvas.height = img.height + 40
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 20, 20)

      canvas.toBlob(async (blob) => {
        if (!blob) return
        const file = new File([blob], fileName, { type: 'image/png' })

        // Web Share API with files first — a plain <a download> click
        // silently does nothing in the Capacitor Android WebView the app
        // also ships as (see CLAUDE.md's sharePdf() rule).
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName })
            return
          } catch (error) {
            if ((error as { name?: string })?.name === 'AbortError') return
            console.error('Native share failed, falling back to download:', error)
          }
        }

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.download = fileName
        a.href = url
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  async function handleConfirmPayment(mode: 'sms' | 'manual') {
    // The button that calls this is already disabled without a real parsed match, but
    // never trust that alone for a path that writes a real payment — a null parsedSms
    // here means the pasted text wasn't actually recognized as a payment confirmation.
    if (mode === 'sms' && !parsedSms) {
      alert('No payment details could be read from that text. Paste the actual bank/MFS confirmation SMS, or use Manual Verification instead.')
      return
    }

    const amountToRecord = mode === 'sms'
      ? (smsPaidAmount !== null && smsPaidAmount > 0 ? smsPaidAmount : numQrAmount)
      : numManualAmount

    if (amountToRecord <= 0) {
      alert('Payment amount must be greater than 0')
      return
    }

    if (amountToRecord > invoiceDue) {
      if (!confirm(`Warning: The payment amount (${formatBDT(amountToRecord)}) is greater than the remaining invoice balance (${formatBDT(invoiceDue)}). Continue recording overpayment?`)) {
        return
      }
    }

    setSaving(true)
    try {
      const nowIso = new Date().toISOString()
      const txnId = mode === 'sms' ? parsedSms?.transactionId : manualTxnId.trim() || undefined
      const provider =
        mode === 'sms'
          ? parsedSms?.provider || 'bank_sms'
          : manualMethod.includes('bKash')
            ? 'bkash_sms'
            : manualMethod.includes('Nagad')
              ? 'nagad_sms'
              : 'pubali_bank'

      const providerLabel = mode === 'sms' ? parsedSms?.providerLabel || 'Bangla QR SMS' : manualMethod
      const gatewayRef = txnId ? `${provider}:${txnId}` : null
      const notes = txnId ? `${providerLabel} TrxID: ${txnId}` : `${providerLabel} Payment`

      const result = await recordInvoicePayment({
        invoiceId,
        amount: amountToRecord,
        invoiceTotal,
        invoicePaid,
        method: 'Transfer',
        paymentDateIso: nowIso,
        notes,
        patientId,
        patientName,
        gatewayProvider: provider,
        gatewayReference: gatewayRef,
        gatewayTransactionId: txnId || null,
        gatewayStatus: mode === 'sms' ? (isNativeVerified ? 'sms_auto_verified' : 'sms_verified') : 'manual_verified',
      })

      if (result.paymentStored) {
        logActivity({
          action: 'create',
          entityType: 'payment',
          entityLabel: invoiceNumber ?? null,
          patientId: patientId ?? null,
          patientName: patientName ?? null,
          details: `${formatBDT(amountToRecord)} via ${providerLabel}${txnId ? ` (TrxID ${txnId})` : ''} against invoice ${invoiceNumber || invoiceId.slice(0, 8)}`,
        })
      }

      setSuccessData({
        paymentId: result.paymentId,
        amount: amountToRecord,
        dateIso: nowIso,
        notes,
        transactionId: txnId || null,
        providerLabel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    } catch (error: any) {
      logBillingError('Failed to record Bangla QR payment', error, { invoiceId, amount: amountToRecord })
      if (error?.message?.includes('idx_payments_gateway_reference_unique') || error?.code === '23505') {
        alert('Duplicate Payment Detected: This transaction reference / SMS has already been recorded.')
      } else {
        alert(`Failed to record payment: ${getFriendlySupabaseErrorMessage(error)}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleSendWhatsAppReceipt() {
    if (!patientPhone || !successData) return
    const cleanPhone = patientPhone.replace(/[^\d+]/g, '')
    const msg = `Dear ${patientName || 'Patient'}, payment of ${formatBDT(successData.amount)} for Invoice #${invoiceNumber || 'INV'} has been successfully received at Dental Clinic. Thank you!`
    const url = `https://wa.me/${cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('880') ? cleanPhone : '880' + cleanPhone.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      {/* ── 1. SUCCESS SCREEN (iOS-Style Scalloped Checkmark Modal) ── */}
      {successData ? (
        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-center mb-4">
            {/* Scalloped green badge container */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-20 h-20 text-emerald-100 fill-current drop-shadow-sm">
                <path d="M50 0 C60 10 65 10 75 5 C85 0 90 5 95 15 C100 25 100 30 105 40 C110 50 105 55 105 65 C105 75 100 80 95 90 C90 100 85 105 75 100 C65 95 60 95 50 105 C40 95 35 95 25 100 C15 105 10 100 5 90 C0 80 0 75 0 65 C-5 55 0 50 5 40 C0 30 0 25 5 15 C10 5 15 0 25 5 C35 10 40 10 50 0 Z" transform="scale(0.85) translate(8, 8)" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
                  <Check className="w-7 h-7 stroke-[3]" />
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Payment Successful</h3>
          <p className="text-sm text-gray-500 mt-1">
            {patientName ? `${patientName} • ` : ''}Invoice #{invoiceNumber || 'INV'}
          </p>

          <div className="my-5 p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100/80">
            <div className="text-3xl font-extrabold text-emerald-700 tracking-tight">
              {formatBDT(successData.amount)}
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-800 font-medium mt-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{successData.providerLabel} Verified</span>
              {successData.transactionId && (
                <span className="bg-emerald-200/60 px-1.5 py-0.5 rounded text-[11px] font-mono">
                  #{successData.transactionId}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Received today at {successData.timestamp}
            </div>
          </div>

          <div className="space-y-2">
            {patientPhone && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSendWhatsAppReceipt}
                className="w-full flex items-center justify-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <MessageSquare className="w-4 h-4" />
                Send WhatsApp Receipt
              </Button>
            )}

            {onPrintReceipt && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onPrintReceipt({
                    paymentId: successData.paymentId,
                    amount: successData.amount,
                    dateIso: successData.dateIso,
                    notes: successData.notes,
                  })
                  onSaved()
                }}
                className="w-full flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Payment Receipt
              </Button>
            )}

            <Button
              type="button"
              onClick={() => {
                onSaved()
              }}
              className="w-full bg-gray-900 hover:bg-black text-white font-medium py-2.5 rounded-xl shadow-md"
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        /* ── 2. DYNAMIC QR PRESENTATION & VERIFICATION MODAL ── */
        <div className="modal-content bg-white rounded-2xl shadow-2xl max-w-md w-full my-2 overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-md">
                <QrCode className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-base leading-tight flex items-center gap-1.5">
                  Pay via Bangla QR
                  <span className="bg-emerald-400/30 text-white text-[10px] px-1.5 py-0.2 rounded-full font-normal">
                    EMVCo Dynamic
                  </span>
                </h2>
                <p className="text-[11px] text-emerald-100">
                  {patientName ? `${patientName} • ` : ''}Invoice #{invoiceNumber || 'INV'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg text-white/90 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            {/* Amount Banner: Generated strictly by Requested Payment Amount */}
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 text-center">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center justify-center gap-1">
                Scan Amount (Dynamic QR)
                {initialAmount && initialAmount > 0 && initialAmount < invoiceDue && (
                  <span className="bg-amber-200/80 text-amber-900 text-[10px] px-1.5 py-0.2 rounded font-medium">
                    Partial
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <span className="text-2xl font-bold text-emerald-900">৳</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={qrAmount}
                  onChange={(e) => {
                    setQrAmount(e.target.value)
                    setManualAmount(e.target.value)
                  }}
                  className="text-2xl sm:text-3xl font-extrabold text-emerald-950 bg-transparent text-center w-36 border-b-2 border-emerald-300 focus:border-emerald-600 focus:outline-none py-0"
                />
              </div>
              <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-800/90 mt-1">
                <span>Invoice Due: <strong>{formatBDT(invoiceDue)}</strong></span>
                <span>•</span>
                <span>Balance After: <strong>{formatBDT(remainingAfterPayment)}</strong></span>
              </div>
            </div>

            {/* QR Code Presentation Box */}
            <div className="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm text-center flex flex-col items-center">
              <div className="p-2 bg-white rounded-lg shadow-inner border border-gray-100 mb-1.5">
                {dynamicQr?.isValid && dynamicQr.payload ? (
                  <QRCodeSVG
                    id="bangla-qr-code-svg"
                    value={dynamicQr.payload}
                    size={160}
                    level="M"
                    includeMargin
                    className="rounded-md"
                  />
                ) : (
                  <div className="w-[160px] h-[160px] flex items-center justify-center bg-gray-50 text-gray-400 text-xs text-center p-4">
                    {dynamicQr?.error || 'Enter a valid amount to generate Bangla QR'}
                  </div>
                )}
              </div>

              {/* Merchant Details Pill */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-lg px-2.5 py-1 text-[11px] text-gray-700 flex flex-wrap items-center justify-center gap-x-1.5">
                <span className="font-semibold text-gray-900">{merchantInfo.merchantName}</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600">{merchantInfo.acquirer}</span>
                {merchantInfo.terminalId && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span className="font-mono text-gray-500">{merchantInfo.terminalId}</span>
                  </>
                )}
              </div>

              {/* Actions row: Copy & Download */}
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  {copiedPayload ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedPayload ? 'Copied!' : 'Copy Code'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Save Image
                </button>
              </div>

              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 justify-center">
                <Smartphone className="w-3 h-3" />
                Scan with Pubali Bank Pi, bKash, Nagad, or any Bangla QR app
              </p>
            </div>

            {/* Native SMS auto-capture status (Android APK only) */}
            {nativeAvailable && nativeSmsStatus !== 'found' && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${
                  nativeSmsStatus === 'unavailable' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {nativeSmsStatus === 'watching' && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    Watching this device's SMS inbox for a bank/MFS confirmation…
                  </>
                )}
                {nativeSmsStatus === 'requesting' && <>Requesting SMS permission…</>}
                {nativeSmsStatus === 'unavailable' && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    SMS permission not granted — paste the confirmation or verify manually below.
                  </>
                )}
              </div>
            )}

            {/* ── Verification Section ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
              {/* Tab Selector */}
              <div className="flex border-b border-gray-200 bg-gray-100/70 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('sms')}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'sms'
                      ? 'bg-white text-emerald-800 shadow-sm font-semibold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Paste Confirmation SMS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'manual'
                      ? 'bg-white text-emerald-800 shadow-sm font-semibold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-gray-500" />
                  Manual Verification
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-3 space-y-2.5">
                {activeTab === 'sms' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Paste Merchant Confirmation SMS
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Paste SMS here (e.g. 'received 500 from UCB' or 'You have received Tk 500.00... TrxID 9K382J9X')"
                        value={smsText}
                        onChange={(e) => {
                          setIsNativeVerified(false)
                          setSmsText(e.target.value)
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                      />
                    </div>

                    {/* Unrecognized text: never fabricate a "Detected" state or an amount to match against */}
                    {smsText.trim() && !parsedSms && (
                      <div className="flex items-start gap-1.5 p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-gray-700 text-xs animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                        <span>Couldn't recognize a payment confirmation in that text. Paste the full bank/MFS SMS, or use Manual Verification instead.</span>
                      </div>
                    )}

                    {/* Detected SMS Details & Mismatch Alerts — only for an actual parsed match */}
                    {parsedSms && (
                      <div className="space-y-1.5 animate-in fade-in">
                        {/* Status Card */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-emerald-900 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              {parsedSms.providerLabel} Detected
                              {isNativeVerified && (
                                <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                  <ShieldCheck className="w-3 h-3" />
                                  Device-Verified Sender
                                </span>
                              )}
                            </span>
                            <span className="font-bold text-emerald-800 text-xs">
                              {formatBDT(parsedSms.amount)}
                            </span>
                          </div>
                          <div className="text-gray-600 font-mono text-[10px]">
                            Ref: <span className="font-semibold text-gray-900">{parsedSms.transactionId}</span>
                            {parsedSms.counterpartyRef && ` • From: ${parsedSms.counterpartyRef}`}
                            {parsedSms.billNumber && ` • Bill: ${parsedSms.billNumber}`}
                          </div>
                        </div>

                        {/* Mismatch Alerts vs Requested QR Amount */}
                        {parsedSms.amount === numQrAmount && (
                          <div className="flex items-center gap-1.5 p-2 bg-emerald-100/70 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span><strong>Exact Match:</strong> SMS amount matches requested QR payment ({formatBDT(numQrAmount)}).</span>
                          </div>
                        )}

                        {parsedSms.amount < numQrAmount && (
                          <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-amber-800">Amount Mismatch:</span>
                              <p className="text-[11px] text-amber-700 mt-0.5">
                                SMS received is <strong>{formatBDT(parsedSms.amount)}</strong>, but requested QR amount was <strong>{formatBDT(numQrAmount)}</strong>.
                              </p>
                            </div>
                          </div>
                        )}

                        {parsedSms.amount > numQrAmount && (
                          <div className="flex items-start gap-1.5 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-rose-800">Amount Mismatch:</span>
                              <p className="text-[11px] text-rose-700 mt-0.5">
                                SMS received is <strong>{formatBDT(parsedSms.amount)}</strong>, which exceeds requested QR amount <strong>{formatBDT(numQrAmount)}</strong>.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      type="button"
                      disabled={saving || !parsedSms}
                      onClick={() => handleConfirmPayment('sms')}
                      className={`w-full text-white font-medium py-2 rounded-lg text-xs ${
                        isSmsMismatch
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {saving
                        ? 'Verifying & Saving...'
                        : !parsedSms
                          ? 'Paste a Valid Confirmation SMS to Verify'
                          : isSmsMismatch
                            ? `Record Payment (${formatBDT(activePaidAmount)}) with Mismatch`
                            : `Verify & Record Payment (${formatBDT(activePaidAmount)})`}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Payment Amount
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Payment Method
                          </label>
                          <select
                            value={manualMethod}
                            onChange={(e) => setManualMethod(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                          >
                            <option value="Pubali Bank Bangla QR">Pubali Bank Bangla QR</option>
                            <option value="bKash">bKash QR / Transfer</option>
                            <option value="Nagad">Nagad QR / Transfer</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          TrxID / Reference (optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 9K382J9X"
                          value={manualTxnId}
                          onChange={(e) => setManualTxnId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                        />
                      </div>

                      {/* Manual Mismatch alert */}
                      {isManualMismatch && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-800">
                              Amount Mismatch:
                            </span>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              Recording {formatBDT(numManualAmount)} vs requested QR {formatBDT(numQrAmount)}.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      disabled={saving || numManualAmount <= 0}
                      onClick={() => handleConfirmPayment('manual')}
                      className="w-full bg-gray-900 hover:bg-black text-white font-medium py-2 rounded-lg text-xs"
                    >
                      {saving ? 'Saving...' : `Confirm Payment Received (${formatBDT(numManualAmount)})`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
