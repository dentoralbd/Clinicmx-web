// Scheduled Cloudflare Worker: nightly trigger for the read-only integrity
// scan (supabase/migrations/064_integrity_findings.sql's run_integrity_scan()
// RPC). Deliberately a STANDALONE Worker, not a Cloudflare Pages Function --
// Pages projects don't expose Cron Triggers, only Workers do, so this has
// its own wrangler.toml and its own `wrangler deploy` from this directory,
// entirely separate from the clinicmx-web Pages project. It calls the exact
// same RPC the "Run scan" button (functions/api/integrity-scan.ts) and the
// local script (scripts/integrity/scan.mjs) call -- one copy of every check,
// three ways to trigger it.
//
// Hand-typed Env/ScheduledEvent/ExecutionContext below rather than adding
// @cloudflare/workers-types as a dependency -- mirrors the same choice
// already made in functions/api/_authLib.ts ("avoids a dependency on
// @cloudflare/workers-types").
//
// Setup (run once, from this directory):
//   npm install
//   npx wrangler secret put SUPABASE_URL             # same value as the
//   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY # Pages project's secrets
//   npx wrangler deploy
//
// Manual test without waiting for 3:30 AM:
//   npx wrangler deployments list        # confirm it deployed
//   Cloudflare dashboard -> Workers & Pages -> clinicmx-integrity-cron ->
//     Triggers tab -> "Trigger Cron" button (fires a real run immediately)
//   or locally: npx wrangler dev --test-scheduled, then in another terminal
//     curl "http://localhost:8787/__scheduled?cron=30+21+*+*+*"

import { createClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScan(env))
  },
}

async function runScan(env: Env): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('run_integrity_scan', {
    p_triggered_by: 'cron',
    p_dry_run: false,
  })

  if (error) {
    console.error('run_integrity_scan failed:', error.message)
    throw error
  }

  console.log('Integrity scan complete:', JSON.stringify(data))
}
