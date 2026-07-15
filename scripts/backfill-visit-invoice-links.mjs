// Backfills patient_visits.invoice_id for visits created before migration 023
// (supabase/migrations/023_add_visit_invoice_link.sql). New visits already get
// this link written at creation time (PatientProfile.tsx handleVisitSubmit) —
// this script only touches OLD rows where the column is still null.
//
// Matching heuristic per patient, chronological + bounded (see PR discussion):
//   1. Candidate invoices = invoice_history rows with
//      event_type = 'invoice_created' AND event_data->>'source' = 'visit_form'
//      (the marker createVisitInvoiceWithPayment writes), joined to invoices
//      for patient_id/total_amount/discount_amount/created_at. Invoices already
//      referenced by some patient_visits.invoice_id are excluded as candidates.
//   2. Candidate visits = patient_visits with invoice_id IS NULL and notes
//      containing a "Billed" line (visits with no billing never had an invoice).
//   3. For each patient, sort both lists by created_at ascending and pair
//      greedily in order: a visit may only claim the earliest unclaimed
//      invoice whose created_at falls between this visit's created_at and the
//      NEXT visit's created_at (or "now" if it's the last visit) — this keeps
//      same-day back-to-back visits from crossing pairs.
//   4. Sanity check: when the matched invoice's discount_amount is 0 (no
//      discount ever applied), the notes' "Billed X" figure should equal the
//      invoice's total_amount almost exactly. A mismatch there suggests a bad
//      pairing, so those are flagged and skipped rather than applied.
//      When discount_amount > 0 a mismatch is *expected* (that's the bug this
//      whole feature fixes) and is not treated as a red flag.
//
// Usage:
//   node scripts/backfill-visit-invoice-links.mjs                # dry run, all patients
//   node scripts/backfill-visit-invoice-links.mjs --patient <id> # dry run, one patient
//   node scripts/backfill-visit-invoice-links.mjs --confirm      # apply
//
// Reuses scripts/backup/.env.backup for SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// (same local creds already set up for backup/restore).
import { parseArgs } from 'node:util';
import { loadEnv, getSupabase, fetchAllRows } from './backup/lib.mjs';

const { values: args } = parseArgs({
  options: {
    patient: { type: 'string' },
    confirm: { type: 'boolean', default: false },
  },
});

function extractBilledAmount(notes) {
  if (!notes) return null;
  const match = notes.match(/Billed[^\d]*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}

function amountsClose(a, b, tolerance = 1) {
  return Math.abs(a - b) <= tolerance;
}

async function main() {
  loadEnv();
  const supabase = getSupabase();

  const { data: probe, error: probeError } = await supabase.from('patient_visits').select('invoice_id').limit(1);
  if (probeError) {
    console.error('❌ patient_visits.invoice_id is not queryable yet — run migration 023_add_visit_invoice_link.sql first.');
    console.error(probeError.message);
    process.exit(1);
  }
  void probe;

  let visits = await fetchAllRows(supabase, 'patient_visits');
  let invoices = await fetchAllRows(supabase, 'invoices');
  const invoiceHistory = await fetchAllRows(supabase, 'invoice_history');

  if (args.patient) {
    visits = visits.filter((v) => String(v.patient_id) === args.patient);
    invoices = invoices.filter((i) => String(i.patient_id) === args.patient);
  }

  const invoicesById = new Map(invoices.map((inv) => [String(inv.id), inv]));
  const alreadyLinkedInvoiceIds = new Set(
    visits.filter((v) => v.invoice_id).map((v) => String(v.invoice_id))
  );

  const candidateInvoiceIds = new Set(
    invoiceHistory
      .filter((h) => h.event_type === 'invoice_created' && h.event_data?.source === 'visit_form')
      .map((h) => String(h.invoice_id))
  );

  // Group unlinked, billed visits and candidate invoices by patient_id.
  const visitsByPatient = new Map();
  for (const v of visits) {
    if (v.invoice_id) continue;
    if (extractBilledAmount(v.notes) === null) continue;
    const key = String(v.patient_id);
    if (!visitsByPatient.has(key)) visitsByPatient.set(key, []);
    visitsByPatient.get(key).push(v);
  }

  const invoicesByPatient = new Map();
  for (const id of candidateInvoiceIds) {
    if (alreadyLinkedInvoiceIds.has(id)) continue;
    const inv = invoicesById.get(id);
    if (!inv) continue;
    const key = String(inv.patient_id);
    if (!invoicesByPatient.has(key)) invoicesByPatient.set(key, []);
    invoicesByPatient.get(key).push(inv);
  }

  const toApply = []; // { visitId, invoiceId }
  const flagged = []; // { visit, invoice, reason }
  const unmatched = []; // visit

  for (const [patientId, patientVisits] of visitsByPatient) {
    const sortedVisits = [...patientVisits].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
    const candidateInvoices = (invoicesByPatient.get(patientId) || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const used = new Set();

    for (let i = 0; i < sortedVisits.length; i++) {
      const visit = sortedVisits[i];
      const visitTime = new Date(visit.created_at).getTime();
      const nextVisitTime = i + 1 < sortedVisits.length
        ? new Date(sortedVisits[i + 1].created_at).getTime()
        : Infinity;

      const candidate = candidateInvoices.find((inv) => {
        if (used.has(inv.id)) return false;
        const invTime = new Date(inv.created_at).getTime();
        // small negative tolerance for clock skew between the two inserts
        return invTime >= visitTime - 2000 && invTime < nextVisitTime;
      });

      if (!candidate) {
        unmatched.push(visit);
        continue;
      }

      const billedAmount = extractBilledAmount(visit.notes);
      const discountAmount = candidate.discount_amount || 0;
      if (discountAmount === 0 && billedAmount !== null && !amountsClose(billedAmount, candidate.total_amount || 0)) {
        flagged.push({ visit, invoice: candidate, reason: `Billed ${billedAmount} in notes vs invoice total_amount ${candidate.total_amount} (no discount recorded, expected exact match)` });
        continue;
      }

      used.add(candidate.id);
      toApply.push({ visitId: visit.id, invoiceId: candidate.id, patientId, billedAmount, invoiceTotal: candidate.total_amount, discountAmount });
    }
  }

  console.log('\n--- DRY-RUN SUMMARY ---');
  console.log(`  Matched (will link): ${toApply.length}`);
  for (const row of toApply) {
    const discountNote = row.discountAmount > 0 ? ` (discount ${row.discountAmount} applied since — total now ${row.invoiceTotal})` : '';
    console.log(`    visit ${row.visitId} -> invoice ${row.invoiceId}${discountNote}`);
  }
  console.log(`  Flagged (skipped, needs manual review): ${flagged.length}`);
  for (const row of flagged) {
    console.log(`    visit ${row.visit.id} (patient ${row.visit.patient_id}): ${row.reason}`);
  }
  console.log(`  Unmatched (no candidate invoice found, left as-is): ${unmatched.length}`);
  for (const v of unmatched) {
    console.log(`    visit ${v.id} (patient ${v.patient_id}, ${v.visit_date})`);
  }

  if (!args.confirm) {
    console.log('\nDry run only — nothing was written. Re-run with --confirm to apply.');
    return;
  }

  console.log('\nApplying...');
  for (const row of toApply) {
    const { error } = await supabase.from('patient_visits').update({ invoice_id: row.invoiceId }).eq('id', row.visitId);
    if (error) throw new Error(`update visit ${row.visitId}: ${error.message}`);
  }
  console.log(`✅ Linked ${toApply.length} visit(s) to their invoice.`);
}

main().catch((err) => {
  console.error(`❌ Backfill failed: ${err.message}`);
  process.exit(1);
});
