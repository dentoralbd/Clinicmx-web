import { useEffect, useState } from 'react'
import { CheckCircle2, QrCode, Sparkles, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { canManageBanglaQrMerchant } from '@/lib/appSession'
import {
  DEFAULT_BANGLA_QR_PAYLOAD,
  extractMerchantInfo,
  generateDynamicBanglaQr,
  getStoredMerchantQrTemplate,
  saveMerchantQrTemplate,
} from '@/lib/banglaQr'

interface InvoiceSettingsModalProps {
  onClose: () => void
}

export function InvoiceSettingsModal({ onClose }: InvoiceSettingsModalProps) {
  const [invoicePrefix, setInvoicePrefix] = useState('INV')
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('1')
  const [defaultTaxRate, setDefaultTaxRate] = useState('0')
  const [lateInterestRate, setLateInterestRate] = useState('0')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [banglaQrPayload, setBanglaQrPayload] = useState(DEFAULT_BANGLA_QR_PAYLOAD)
  const [showQrEditor, setShowQrEditor] = useState(false)
  const [showTestQr, setShowTestQr] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAdmin = canManageBanglaQrMerchant()

  const merchantInfo = extractMerchantInfo(banglaQrPayload)
  const testDynamicQr = generateDynamicBanglaQr(banglaQrPayload, 10.0, 'TEST-101')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const localPayload = getStoredMerchantQrTemplate()
    if (localPayload) {
      setBanglaQrPayload(localPayload)
    }

    const { data } = await supabase
      .from('invoice_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (!data) return

    setInvoicePrefix(data.invoice_prefix || 'INV')
    setNextInvoiceNumber(String(data.next_invoice_number || 1))
    setDefaultTaxRate(String(data.default_tax_rate || 0))
    setLateInterestRate(String(data.late_interest_rate || 0))
    setPaymentTerms(data.payment_terms || '')
    if (data.bangla_qr_merchant_payload) {
      setBanglaQrPayload(data.bangla_qr_merchant_payload)
      saveMerchantQrTemplate(data.bangla_qr_merchant_payload)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      // An invalid/edited-but-broken QR payload must never block saving the rest of
      // Invoice Settings — persist only what's valid, leave the previous value alone
      // otherwise, and tell the user via the inline "Invalid payload" indicator below.
      // Non-admins never see this section's controls, so banglaQrPayload in their state
      // is only ever the as-loaded value — isAdmin still gates the write explicitly so a
      // non-admin's save can never touch this field, not even a same-value no-op.
      const payloadIsValid = isAdmin && extractMerchantInfo(banglaQrPayload).isValid
      if (payloadIsValid) {
        saveMerchantQrTemplate(banglaQrPayload)
      }

      const { error } = await supabase
        .from('invoice_settings')
        .upsert({
          id: 1,
          invoice_prefix: invoicePrefix || 'INV',
          next_invoice_number: parseInt(nextInvoiceNumber, 10) || 1,
          default_tax_rate: parseFloat(defaultTaxRate) || 0,
          late_interest_rate: parseFloat(lateInterestRate) || 0,
          payment_terms: paymentTerms || null,
          ...(payloadIsValid ? { bangla_qr_merchant_payload: banglaQrPayload } : {}),
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
      onClose()
    } catch (error) {
      console.error('Failed to save invoice settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto my-4">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Invoice Settings</h3>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Prefix</label>
              <input
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Next Invoice Number</label>
              <input
                type="number"
                min="1"
                value={nextInvoiceNumber}
                onChange={(e) => setNextInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Late Interest Rate (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lateInterestRate}
                onChange={(e) => setLateInterestRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Payment Terms</label>
            <textarea
              rows={3}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* ── Bangla QR Merchant Setup Section — admin only, controls where Bangla QR
              payments actually route (see canManageBanglaQrMerchant) ── */}
          {isAdmin && (
          <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50/40 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                    Bangla QR Merchant Setup
                    {merchantInfo.isValid && (
                      <span className="bg-emerald-200/80 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                        CRC Verified
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-emerald-800">
                    {merchantInfo.acquirer} • {merchantInfo.merchantName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrEditor(!showQrEditor)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium underline"
              >
                {showQrEditor ? 'Done Editing' : 'Edit Payload'}
              </button>
            </div>

            {/* Merchant info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-white p-3 rounded-xl border border-emerald-100">
              <div>
                <span className="text-gray-400 block text-[10px]">Merchant Name</span>
                <span className="font-semibold text-gray-800">{merchantInfo.merchantName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">City / Location</span>
                <span className="font-semibold text-gray-800">{merchantInfo.merchantCity}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Terminal ID</span>
                <span className="font-mono text-gray-800">{merchantInfo.terminalId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Phone</span>
                <span className="font-mono text-gray-800">{merchantInfo.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Currency</span>
                <span className="font-semibold text-gray-800">{merchantInfo.currency}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Checksum (CRC-16)</span>
                <span className="font-mono text-emerald-700 font-semibold">{merchantInfo.crc}</span>
              </div>
            </div>

            {/* Editor Textarea if opened */}
            {showQrEditor && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Raw EMVCo Bangla QR Payload String
                </label>
                <textarea
                  rows={3}
                  value={banglaQrPayload}
                  onChange={(e) => setBanglaQrPayload(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <div className="flex justify-between items-center text-[11px]">
                  <span className={merchantInfo.isValid ? 'text-emerald-700 font-medium' : 'text-red-600 font-semibold'}>
                    {merchantInfo.isValid ? '✓ Valid EMVCo format & checksum' : '⚠ Invalid payload or CRC checksum mismatch — Save Settings will keep the previous QR'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBanglaQrPayload(DEFAULT_BANGLA_QR_PAYLOAD)}
                    className="text-gray-500 hover:text-gray-800 underline"
                  >
                    Reset to Default Pubali Bank
                  </button>
                </div>
              </div>
            )}

            {/* Test dynamic QR generator */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTestQr(!showTestQr)}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-medium flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                {showTestQr ? 'Hide Test Dynamic QR' : 'Test Dynamic QR Generator (Tk 10.00)'}
              </button>

              {showTestQr && testDynamicQr.isValid && (
                <div className="mt-2.5 p-3 bg-white border border-emerald-100 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100 shrink-0">
                    <QRCodeSVG value={testDynamicQr.payload} size={110} level="M" />
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="font-bold text-gray-900 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Dynamic EMVCo Payload Verified
                    </div>
                    <p>Amount: <span className="font-semibold text-emerald-800">৳ 10.00</span> (Tag 54 encoded)</p>
                    <p>Bill Ref: <span className="font-mono text-gray-700">TEST-101</span> (Tag 62-01 encoded)</p>
                    <p className="text-[10px] text-gray-400 font-mono break-all line-clamp-2">
                      {testDynamicQr.payload}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save Settings'}</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
