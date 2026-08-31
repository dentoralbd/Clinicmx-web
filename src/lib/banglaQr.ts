/**
 * Bangla QR (EMVCo QRCPS Specification) Core Engine
 * Adheres to Bangladesh Bank Bangla QR Guidelines & EMV® Merchant-Presented QR Code Standard.
 */

export const DEFAULT_BANGLA_QR_PAYLOAD =
  '00020101021126560016com.pubalibankbd0102000204017503189017520000116943115204541153030505802BD5925GOPI SANKAR BANIK        6005DHAKA62320211019147997620713PBLQR0116943164170002bn0107bangali91200016com.pubalibankbd6304EE51'

export const BANGLA_QR_STORAGE_KEY = 'clinicmx_bangla_qr_template'

export interface DecodedMerchantInfo {
  merchantName: string
  merchantCity: string
  terminalId: string | null
  phone: string | null
  acquirer: string
  currency: string
  pointOfInitiation: 'static' | 'dynamic'
  amount: number | null
  billNumber: string | null
  rawPayload: string
  isValid: boolean
  crc: string
}

export interface DynamicQrResult {
  payload: string
  isValid: boolean
  amount: number
  invoiceNumber?: string
  merchantName: string
  terminalId: string | null
  error?: string
}

/**
 * Standard CRC-16 / CCITT-FALSE computation (Polynomial 0x1021, Initial 0xFFFF).
 * Calculates checksum over the exact input string up to and including '6304'.
 */
export function computeCrc16CcittFalse(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Parses an EMVCo TLV (Tag-Length-Value) string into a Map of tags.
 */
export function parseEmvCoTlv(payload: string): Map<string, string> {
  const tags = new Map<string, string>()
  let i = 0
  while (i < payload.length) {
    if (i + 4 > payload.length) break
    const tag = payload.slice(i, i + 2)
    const len = parseInt(payload.slice(i + 2, i + 4), 10)
    if (isNaN(len) || len < 0) break
    const val = payload.slice(i + 4, i + 4 + len)
    tags.set(tag, val)
    i += 4 + len
  }
  return tags
}

/**
 * Serializes a Map of EMVCo tags in standard ascending order and computes CRC Tag 63.
 */
export function encodeEmvCoTlv(tagsMap: Map<string, string>): string {
  // Sort tags ascending (e.g. 00, 01, 26, 52, 53, 54, 58, 59, 60, 62, 64, 91)
  const entries = Array.from(tagsMap.entries()).filter(([tag]) => tag !== '63')
  entries.sort(([a], [b]) => a.localeCompare(b))

  let payload = ''
  for (const [tag, val] of entries) {
    const lenStr = val.length.toString().padStart(2, '0')
    payload += `${tag}${lenStr}${val}`
  }

  const payloadForCrc = payload + '6304'
  const crc = computeCrc16CcittFalse(payloadForCrc)
  return payloadForCrc + crc
}

/**
 * Extracts and decodes human-readable merchant information from a Bangla QR payload.
 */
export function extractMerchantInfo(payload: string): DecodedMerchantInfo {
  const clean = payload.trim()
  const tags = parseEmvCoTlv(clean)
  const crcTag = tags.get('63') || ''
  const payloadBeforeCrc = clean.slice(0, Math.max(clean.length - 4, 0))
  const expectedCrc = computeCrc16CcittFalse(payloadBeforeCrc)
  const isCrcValid = crcTag.toUpperCase() === expectedCrc.toUpperCase()

  // Tag 01: Point of Initiation
  const tag01 = tags.get('01') || '11'
  const pointOfInitiation = tag01 === '12' ? 'dynamic' : 'static'

  // Tag 59: Merchant Name
  const merchantName = (tags.get('59') || '').trim() || 'Merchant'

  // Tag 60: Merchant City
  const merchantCity = (tags.get('60') || '').trim() || 'Dhaka'

  // Tag 53: Currency (050 = BDT)
  const currencyCode = tags.get('53') || '050'
  const currency = currencyCode === '050' ? 'BDT' : currencyCode

  // Tag 54: Transaction Amount
  const amountStr = tags.get('54')
  const amount = amountStr ? parseFloat(amountStr) || null : null

  // Tag 26-51: Merchant Acquirer Information
  let acquirer = 'Bangla QR Merchant'
  for (let t = 26; t <= 51; t++) {
    const tStr = t.toString().padStart(2, '0')
    const val = tags.get(tStr)
    if (val) {
      const subTags = parseEmvCoTlv(val)
      const domain = subTags.get('00')
      if (domain) {
        acquirer = domain.replace(/^com\./i, '').replace(/bd$/i, '').toUpperCase() + ' PLC'
        break
      }
    }
  }

  // Tag 62: Additional Data Field Template
  let terminalId: string | null = null
  let phone: string | null = null
  let billNumber: string | null = null
  const tag62 = tags.get('62')
  if (tag62) {
    const sub62 = parseEmvCoTlv(tag62)
    billNumber = sub62.get('01') || null
    phone = sub62.get('02') || null
    terminalId = sub62.get('07') || null
  }

  return {
    merchantName,
    merchantCity,
    terminalId,
    phone,
    acquirer,
    currency,
    pointOfInitiation,
    amount,
    billNumber,
    rawPayload: clean,
    isValid: isCrcValid && !!tags.get('00'),
    crc: crcTag,
  }
}

/**
 * Transforms a static merchant Bangla QR template into a dynamic QR payload
 * with exact amount, invoice reference, and mandatory round-trip validation.
 */
export function generateDynamicBanglaQr(
  staticTemplate: string,
  amount: number,
  invoiceNumber?: string
): DynamicQrResult {
  try {
    const template = (staticTemplate || DEFAULT_BANGLA_QR_PAYLOAD).trim()
    const tags = parseEmvCoTlv(template)

    if (!tags.has('00') || !tags.has('59')) {
      return {
        payload: '',
        isValid: false,
        amount,
        invoiceNumber,
        merchantName: 'Unknown',
        terminalId: null,
        error: 'Invalid static merchant QR template (missing header or merchant name)',
      }
    }

    // 1. Point of Initiation Method: 11 (Static) -> 12 (Dynamic)
    tags.set('01', '12')

    // 2. Transaction Amount (Tag 54) formatted to 2 decimals
    const formattedAmount = amount.toFixed(2)
    tags.set('54', formattedAmount)

    // 3. Additional Data (Tag 62) - inject Bill Number (subtag 01)
    if (invoiceNumber) {
      const tag62Val = tags.get('62') || ''
      const subTags62 = parseEmvCoTlv(tag62Val)
      subTags62.set('01', invoiceNumber.trim())

      const sortedSub62 = Array.from(subTags62.entries()).sort(([a], [b]) => a.localeCompare(b))
      let new62 = ''
      for (const [sTag, sVal] of sortedSub62) {
        new62 += `${sTag}${sVal.length.toString().padStart(2, '0')}${sVal}`
      }
      tags.set('62', new62)
    }

    // 4. Encode TLV and compute new CRC-16
    const dynamicPayload = encodeEmvCoTlv(tags)

    // 5. Mandatory Round-Trip Verification Gate
    const decoded = extractMerchantInfo(dynamicPayload)
    const isValidRoundTrip =
      decoded.isValid &&
      decoded.pointOfInitiation === 'dynamic' &&
      decoded.amount === Number(formattedAmount) &&
      (!invoiceNumber || decoded.billNumber === invoiceNumber.trim())

    if (!isValidRoundTrip) {
      return {
        payload: '',
        isValid: false,
        amount,
        invoiceNumber,
        merchantName: decoded.merchantName,
        terminalId: decoded.terminalId,
        error: 'Round-trip verification gate failed for generated dynamic QR payload',
      }
    }

    return {
      payload: dynamicPayload,
      isValid: true,
      amount,
      invoiceNumber,
      merchantName: decoded.merchantName,
      terminalId: decoded.terminalId,
    }
  } catch (err: any) {
    return {
      payload: '',
      isValid: false,
      amount,
      invoiceNumber,
      merchantName: 'Error',
      terminalId: null,
      error: err?.message || 'Failed to generate dynamic Bangla QR',
    }
  }
}

/**
 * Storage helpers for persisting the clinic's merchant template
 */
export function getStoredMerchantQrTemplate(): string {
  try {
    const saved = localStorage.getItem(BANGLA_QR_STORAGE_KEY)
    if (saved && saved.trim()) {
      if (saved.includes('BABIK')) {
        const fixed = DEFAULT_BANGLA_QR_PAYLOAD
        localStorage.setItem(BANGLA_QR_STORAGE_KEY, fixed)
        return fixed
      }
      return saved.trim()
    }
  } catch {}
  return DEFAULT_BANGLA_QR_PAYLOAD
}

export function saveMerchantQrTemplate(payload: string): boolean {
  try {
    const clean = payload.trim()
    const info = extractMerchantInfo(clean)
    if (!info.isValid) {
      return false
    }
    localStorage.setItem(BANGLA_QR_STORAGE_KEY, clean)
    return true
  } catch {
    return false
  }
}

export function clearStoredMerchantQrTemplate(): void {
  try {
    localStorage.removeItem(BANGLA_QR_STORAGE_KEY)
  } catch {}
}
