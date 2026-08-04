import { supabase } from './supabase'

export interface StorageUsage {
  databaseBytes: number
  patientFilesBytes: number
  databaseLimitBytes: number
  storageLimitBytes: number
}

// Mirrors deviceBackup.ts's staffAuthHeaders() — any signed-in staff
// member's own Supabase Auth session, checked server-side by
// requireStaffSession (functions/api/storage-usage.ts).
async function staffAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const response = await fetch('/api/storage-usage', { headers: await staffAuthHeaders() })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error || 'Could not read storage usage.')
  }
  return {
    databaseBytes: body.databaseBytes,
    patientFilesBytes: body.patientFilesBytes,
    databaseLimitBytes: body.databaseLimitBytes,
    storageLimitBytes: body.storageLimitBytes,
  }
}
