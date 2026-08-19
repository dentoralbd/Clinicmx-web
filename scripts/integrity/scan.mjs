// Runs the read-only data-integrity scan (supabase/migrations/064_integrity_findings.sql,
// run_integrity_scan() RPC) and prints a plain-language summary. This is the local/manual
// entry point for after a risky change or migration — the in-app "Run scan" button
// (functions/api/integrity-scan.ts) is the day-to-day one.
//
// The scan itself is entirely SQL, defined inside the migration — this script is a thin
// trigger + printer so there is exactly one copy of every check, not a second one here.
//
// Usage:
//   node scripts/integrity/scan.mjs             # runs the scan, writes findings, prints summary
//   node scripts/integrity/scan.mjs --dry-run    # runs every check for real, then rolls back
//                                                 the writes (findings table AND the critical
//                                                 notification) — use this to preview a new or
//                                                 changed check before trusting it against
//                                                 production. True rollback, not a simulation:
//                                                 run_integrity_scan(p_dry_run := true) raises
//                                                 and catches its own sentinel exception after
//                                                 writing, which PL/pgSQL's implicit per-block
//                                                 savepoint undoes.
//   node scripts/integrity/scan.mjs --json       # machine-readable counts on stdout instead
//
// Reuses scripts/backup/.env.backup for SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (same local
// creds already set up for backup/restore) — see scripts/backfill-visit-invoice-links.mjs for
// the precedent.
import { parseArgs } from 'node:util';
import { loadEnv, getSupabase } from '../backup/lib.mjs';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

async function main() {
  loadEnv();
  const supabase = getSupabase();

  // Sanity tripwire (mirrors backup.mjs's "0 rows -> refuse"): a scan against an empty or
  // unreachable database would resolve every existing finding as fixed, which is worse than
  // not running at all.
  const { count: patientCount, error: countError } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true });
  if (countError) throw new Error(`sanity check (patients count): ${countError.message}`);
  if (!patientCount) {
    throw new Error('Sanity check failed: patients table returned 0 rows — refusing to run against what looks like an empty/unreachable database.');
  }

  if (!args.json) {
    console.log(args['dry-run'] ? 'Running integrity scan (dry run — writes will be rolled back)...' : 'Running integrity scan...');
  }

  const { data: counts, error } = await supabase.rpc('run_integrity_scan', {
    p_triggered_by: 'local-script',
    p_dry_run: args['dry-run'],
  });
  if (error) throw new Error(`run_integrity_scan: ${error.message}`);

  if (args.json) {
    console.log(JSON.stringify(counts));
    return;
  }

  console.log('\n--- SCAN SUMMARY ---');
  console.log(`  Critical: ${counts.critical}`);
  console.log(`  Warning:  ${counts.warning}`);
  console.log(`  Info:     ${counts.info}`);
  console.log(`  Resolved this run: ${counts.resolved_this_run}`);

  if (args['dry-run']) {
    console.log('\n  (dry run — nothing was written to integrity_findings and no notification was sent; counts above reflect what a real run would produce)');
  }

  if (counts.critical > 0) {
    console.log(`\n⚠️  ${counts.critical} critical finding(s) need review — see the Integrity tab in the Admin zone (/admin?tab=integrity).`);
  }

  console.log(args['dry-run'] ? '\n✅ Dry run complete — nothing written.' : '\n✅ Integrity scan complete.');
}

main().catch((err) => {
  console.error(`❌ Integrity scan FAILED: ${err.message}`);
  process.exit(1);
});
