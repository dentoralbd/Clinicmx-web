/**
 * SMS Parsers for Payment Confirmation
 * Extracts Amount, Transaction ID, Counterparty, and Bill Reference from incoming merchant SMS.
 */

export interface ParsedPaymentSms {
  provider: 'bkash_sms' | 'nagad_sms' | 'pubali_bank' | 'bank_sms' | 'generic_sms'
  providerLabel: string
  amount: number
  transactionId: string
  counterpartyRef?: string
  billNumber?: string
  timestamp?: string
  rawText: string
}

export interface SmsParser {
  provider: ParsedPaymentSms['provider']
  providerLabel: string
  senders?: string[]
  parse(body: string): Omit<ParsedPaymentSms, 'provider' | 'providerLabel' | 'rawText'> | null
}

/**
 * Normalizes numbers with commas, e.g. "1,500.00" -> 1500.00
 */
function parseNumericAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/,/g, '').trim()
  return parseFloat(cleaned) || 0
}

/**
 * bKash SMS Parser
 */
export const bkashParser: SmsParser = {
  provider: 'bkash_sms',
  providerLabel: 'bKash',
  senders: ['bKash', '16247'],
  parse(body: string) {
    if (!/bkash|trxid|you have received/i.test(body) && !/fee tk/i.test(body)) {
      return null
    }

    // Amount match: "received Tk 1,500.00" or "received payment Tk 500.00" or "Payment Tk 1,200.00"
    const amountMatch = body.match(/(?:received (?:payment )?Tk|Payment Tk|Tk\.?)\s*([\d,]+(?:\.\d{1,2})?)/i)
    if (!amountMatch) return null

    // TrxID match: "TrxID 9K382J9X" or "TrxID: 9K382J9X"
    const trxMatch = body.match(/TrxID[:\s]*([A-Z0-9]+)/i)
    if (!trxMatch) return null

    // Counterparty match: "from 017xxxxxxxx"
    const fromMatch = body.match(/from\s*(\+?880\d{10}|01\d{9})/i)

    // Bill / Ref match: "Ref: INV-101" or "Ref INV-1002"
    const refMatch = body.match(/(?:Ref|Bill|Reference)[:\s]*([A-Za-z0-9\-_]+)/i)

    // Timestamp match
    const timeMatch = body.match(/at\s*(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2})/i)

    const amount = parseNumericAmount(amountMatch[1])
    if (amount <= 0) return null

    return {
      amount,
      transactionId: trxMatch[1].toUpperCase(),
      counterpartyRef: fromMatch ? fromMatch[1] : undefined,
      billNumber: refMatch ? refMatch[1] : undefined,
      timestamp: timeMatch ? timeMatch[1] : undefined,
    }
  },
}

/**
 * Nagad SMS Parser
 */
export const nagadParser: SmsParser = {
  provider: 'nagad_sms',
  providerLabel: 'Nagad',
  senders: ['Nagad', '16167'],
  parse(body: string) {
    if (!/nagad|txnid/i.test(body) && !/money received/i.test(body)) {
      return null
    }

    // Amount: "Amount: Tk 2,000.00" or "Amount: Tk. 1500"
    const amountMatch = body.match(/(?:Amount[:\s]*Tk\.?|Tk\.?)\s*([\d,]+(?:\.\d{1,2})?)/i)
    if (!amountMatch) return null

    // TxnID: "TxnID: 71Y2T9K" or "TxnID 71Y2T9K"
    const txnMatch = body.match(/TxnID[:\s]*([A-Z0-9]+)/i)
    if (!txnMatch) return null

    const fromMatch = body.match(/(?:Sender|From)[:\s]*(\+?880\d{10}|01\d{9})/i)
    const refMatch = body.match(/(?:Ref|Reference)[:\s]*([A-Za-z0-9\-_]+)/i)

    const amount = parseNumericAmount(amountMatch[1])
    if (amount <= 0) return null

    return {
      amount,
      transactionId: txnMatch[1].toUpperCase(),
      counterpartyRef: fromMatch ? fromMatch[1] : undefined,
      billNumber: refMatch ? refMatch[1] : undefined,
    }
  },
}

/**
 * Pubali Bank & General Bank SMS Parser (for Bangla QR merchant credits)
 */
export const pubaliBankParser: SmsParser = {
  provider: 'pubali_bank',
  providerLabel: 'Pubali Bank',
  senders: ['PubaliBank', 'PBL', 'Pubali'],
  parse(body: string) {
    if (!/pubali|pbl|bangla qr|credited with|credited by/i.test(body)) {
      return null
    }

    // Amount: "BDT 1,500.00" or "Tk 1,500.00"
    const amountMatch = body.match(/(?:BDT|Tk\.?|credited with BDT|credited by BDT)\s*([\d,]+(?:\.\d{1,2})?)/i)
    if (!amountMatch) return null

    // TrxID / Ref: "TrxID: PBL982183921" or "Ref/Txn: 8719283"
    const trxMatch = body.match(/(?:TrxID|TxnID|Ref\/Txn|Txn ID)[:\s]*([A-Z0-9]+)/i)
    if (!trxMatch) return null

    const refMatch = body.match(/(?:Ref|Bill|Invoice)[:\s]*([A-Za-z0-9\-_]+)/i)

    const amount = parseNumericAmount(amountMatch[1])
    if (amount <= 0) return null

    return {
      amount,
      transactionId: trxMatch[1].toUpperCase(),
      billNumber: refMatch ? refMatch[1] : undefined,
    }
  },
}

/**
 * Generic Fallback Parser
 * Attempts to locate any valid BDT amount and optional Transaction ID / Bank in arbitrary text.
 */
export const genericParser: SmsParser = {
  provider: 'generic_sms',
  providerLabel: 'SMS Payment',
  parse(body: string) {
    // Look for currency keyword or general payment patterns (e.g. "received 1000", "credited 1500", "Tk 1000")
    const amountMatch =
      body.match(/(?:Tk\.?|BDT|৳)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      body.match(/(?:amount|paid|received|credited|deposit|sent)[:\s]*([\d,]+(?:\.\d{1,2})?)/i) ||
      body.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Tk|BDT|৳)/i)

    if (!amountMatch) return null

    const amount = parseNumericAmount(amountMatch[1])
    if (amount <= 0) return null

    // Look for transaction id if present
    const trxMatch = body.match(/(?:TrxID|TxnID|Transaction ID|Trans ID|Trx ID|Ref|Ref ID)[:\s]*([A-Z0-9]+)/i)

    // Look for counterparty or bank name
    const fromMatch = body.match(/(?:from|by|sender|via|at)\s*([A-Za-z0-9_\-\.]+)/i)
    const refMatch = body.match(/(?:Ref|Bill|Invoice)[:\s]*([A-Za-z0-9\-_]+)/i)

    const txnId = trxMatch
      ? trxMatch[1].toUpperCase()
      : fromMatch
        ? `${fromMatch[1].toUpperCase()}-${Date.now().toString().slice(-4)}`
        : `SMS-${Date.now().toString().slice(-6)}`

    return {
      amount,
      transactionId: txnId,
      counterpartyRef: fromMatch ? fromMatch[1] : undefined,
      billNumber: refMatch ? refMatch[1] : undefined,
    }
  },
}

const REGISTERED_PARSERS: SmsParser[] = [
  pubaliBankParser,
  bkashParser,
  nagadParser,
  genericParser,
]

/**
 * Main parser entry point: Tries parsers sequentially against the pasted SMS.
 */
export function parsePaymentSms(body: string): ParsedPaymentSms | null {
  if (!body || !body.trim()) return null
  const cleanBody = body.trim()

  for (const parser of REGISTERED_PARSERS) {
    const result = parser.parse(cleanBody)
    if (result) {
      return {
        ...result,
        provider: parser.provider,
        providerLabel: parser.providerLabel,
        rawText: cleanBody,
      }
    }
  }

  return null
}

/**
 * Like parsePaymentSms, but only trusts parsers with a known, fixed sender-ID
 * allow-list (never the generic fallback, which has none), and only when the
 * actual SMS sender matches. This is what backs native inbox auto-capture
 * (BanglaQrPaymentModal's device-SMS watcher): the sender ID comes from the
 * phone's own SMS provider column, not text a user could type or paste, so a
 * match here is real evidence the message came from the bank/MFS — not just
 * that its wording resembles a payment notification.
 */
export function parseVerifiedSenderSms(sender: string | null | undefined, body: string): ParsedPaymentSms | null {
  if (!sender || !body || !body.trim()) return null
  const cleanBody = body.trim()
  const normalizedSender = sender.trim().toLowerCase()
  if (!normalizedSender) return null

  for (const parser of REGISTERED_PARSERS) {
    if (!parser.senders || parser.senders.length === 0) continue
    const senderMatches = parser.senders.some((s) => normalizedSender.includes(s.toLowerCase()))
    if (!senderMatches) continue
    const result = parser.parse(cleanBody)
    if (result) {
      return {
        ...result,
        provider: parser.provider,
        providerLabel: parser.providerLabel,
        rawText: cleanBody,
      }
    }
  }

  return null
}
