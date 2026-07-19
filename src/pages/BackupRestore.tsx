import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  DatabaseBackup,
  DownloadCloud,
  FileUp,
  HardDriveDownload,
  Loader2,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getAppRole } from '@/lib/appSession'
import {
  buildSerializedBackup,
  downloadSerializedBackup,
  uploadSerializedBackup,
  listBackupsFromDrive,
  fetchBackupFromDrive,
  getAutoPruneEnabled,
  setAutoPruneEnabled,
  getBackupEncryption,
  setBackupEncryption,
  parseBackupFile,
  parseBackupCategory,
  analyzeRestore,
  executeRestore,
  type BackupProgress,
  type CountDrop,
  type DriveBackupFile,
  type RestoreAnalysis,
  type RestoreMode,
  type RestoreOutcome,
} from '@/lib/deviceBackup'
import {
  BACKUP_CATEGORIES,
  getBackupSettings,
  saveBackupSettings,
  getLastBackupAt,
  getNextScheduledInstant,
  getNotificationPermission,
  requestNotificationPermission,
  isNotificationSupported,
  type BackupCategory,
  type ScheduleSettings,
} from '@/lib/backupReminders'

const CATEGORY_LABEL: Record<BackupCategory, string> = {
  daily: 'Daily',
  weekly: 'Weekly (Mondays)',
  monthly: 'Monthly (1st)',
}

type RestoreState =
  | { step: 'idle' }
  | { step: 'error'; message: string }
  | { step: 'passphrase'; message: string }
  | { step: 'analyzing'; progress: BackupProgress | null }
  | { step: 'summary'; analysis: RestoreAnalysis; warnings: string[] }
  | { step: 'running'; analysis: RestoreAnalysis; progress: BackupProgress | null }
  | { step: 'done'; outcome: RestoreOutcome; mode: RestoreMode }

const cardClass = 'bg-white rounded-lg shadow-sm border border-gray-200 p-6'

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${bytes} B`
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupRestore() {
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(() => getLastBackupAt())
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ name: string; webViewLink?: string; verified: boolean } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [autoPrune, setAutoPrune] = useState(() => getAutoPruneEnabled())

  const [encryptEnabled, setEncryptEnabled] = useState(false)
  const [hasPassphrase, setHasPassphrase] = useState(false)
  const [passphraseDraft, setPassphraseDraft] = useState('')
  const [showPassphraseEditor, setShowPassphraseEditor] = useState(false)

  const [restore, setRestore] = useState<RestoreState>({ step: 'idle' })
  const [mode, setMode] = useState<RestoreMode>('insert-missing')
  const [overwriteConfirmText, setOverwriteConfirmText] = useState('')
  const [restoreSettings, setRestoreSettings] = useState(true)
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  const [driveBrowse, setDriveBrowse] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; files: DriveBackupFile[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' })
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const [settings, setSettings] = useState(() => getBackupSettings())
  const [settingsSavedAt, setSettingsSavedAt] = useState<Date | null>(null)
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission())

  useEffect(() => {
    if (restore.step !== 'running') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [restore.step])

  useEffect(() => {
    getBackupEncryption().then(({ enabled, passphrase }) => {
      setEncryptEnabled(enabled)
      setHasPassphrase(!!passphrase)
    })
  }, [])

  // After all hooks (Rules of Hooks) — same in-page admin gating as /admin.
  if (getAppRole() !== 'admin') return <Navigate to="/dashboard" replace />

  const busy =
    backingUp ||
    uploading ||
    restore.step === 'analyzing' ||
    restore.step === 'running' ||
    driveBrowse.status === 'loading' ||
    downloadingId !== null

  // Anomaly tripwire (P2): in the manual flows a human is present, so ask.
  const confirmAnomaly = async (drops: CountDrop[]) => {
    const detail = drops.map((d) => `  ${d.table}: ${d.from} → ${d.to}`).join('\n')
    return confirm(
      `WARNING: core records have DECREASED since your last backup:\n\n${detail}\n\n` +
        `If you didn't delete these on purpose, press Cancel and investigate before backing up ` +
        `(older backups remain in Drive).\n\nContinue with this backup anyway?`
    )
  }

  const handleDownloadBackup = async () => {
    setBackingUp(true)
    setBackupProgress(null)
    try {
      const serialized = await buildSerializedBackup({ onProgress: setBackupProgress, onAnomaly: confirmAnomaly })
      if (!serialized) return
      const filename = downloadSerializedBackup(serialized)
      setLastBackupAt(getLastBackupAt())
      setLastDownloadedFile(filename)
    } catch (error) {
      alert(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBackingUp(false)
      setBackupProgress(null)
    }
  }

  const handleUploadToDrive = async () => {
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    setBackupProgress(null)
    try {
      const serialized = await buildSerializedBackup({ onProgress: setBackupProgress, onAnomaly: confirmAnomaly })
      if (!serialized) return
      setBackupProgress(null)
      const result = await uploadSerializedBackup(serialized)
      setLastBackupAt(getLastBackupAt())
      setUploadResult(result)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
      setBackupProgress(null)
    }
  }

  const handleFileChosen = async (file: File | null, passphrase?: string) => {
    if (!file) return
    pendingFileRef.current = file
    setMode('insert-missing')
    setOverwriteConfirmText('')
    setRestoreSettings(true)
    const parsed = await parseBackupFile(file, passphrase)
    if (!parsed.ok) {
      if (parsed.needsPassphrase) {
        setRestorePassphrase('')
        setRestore({ step: 'passphrase', message: parsed.error })
        return
      }
      setRestore({ step: 'error', message: parsed.error })
      return
    }
    setRestore({ step: 'analyzing', progress: null })
    try {
      const analysis = await analyzeRestore(parsed.backup, (progress) =>
        setRestore({ step: 'analyzing', progress })
      )
      setRestore({ step: 'summary', analysis, warnings: parsed.warnings })
    } catch (error) {
      setRestore({
        step: 'error',
        message: `Could not analyze the backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleSaveEncryption = async (enabled: boolean) => {
    if (enabled && !hasPassphrase && !passphraseDraft.trim()) {
      setShowPassphraseEditor(true)
      return
    }
    if (passphraseDraft.trim()) {
      await setBackupEncryption(enabled, passphraseDraft.trim())
      setHasPassphrase(true)
      setPassphraseDraft('')
      setShowPassphraseEditor(false)
    } else {
      await setBackupEncryption(enabled)
    }
    setEncryptEnabled(enabled)
  }

  const handleBrowseDrive = async () => {
    setDriveBrowse({ status: 'loading' })
    try {
      const files = await listBackupsFromDrive()
      setDriveBrowse({ status: 'loaded', files })
    } catch (error) {
      setDriveBrowse({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not list Drive backups.',
      })
    }
  }

  const handleRestoreFromDrive = async (file: DriveBackupFile) => {
    setDownloadingId(file.id)
    try {
      const downloaded = await fetchBackupFromDrive(file.id, file.name)
      await handleFileChosen(downloaded)
    } catch (error) {
      setRestore({
        step: 'error',
        message: `Could not download ${file.name} from Drive: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const handleRunRestore = async () => {
    if (restore.step !== 'summary') return
    const { analysis } = restore
    const totalMissing = analysis.tables.reduce((sum, t) => sum + t.missing, 0)
    const totalRows = analysis.tables.reduce((sum, t) => sum + t.inBackup, 0)

    const message =
      mode === 'overwrite'
        ? `OVERWRITE mode: ${totalRows} records from the backup will REPLACE current values for any record with the same id. This cannot be undone. Continue?`
        : `Restore ${totalMissing} missing record(s)? Existing records will not be modified.`
    if (!confirm(message)) return

    setRestore({ step: 'running', analysis, progress: null })
    const outcome = await executeRestore(analysis, mode, { restoreLocalSettings: restoreSettings }, (progress) =>
      setRestore({ step: 'running', analysis, progress })
    )
    setRestore({ step: 'done', outcome, mode })
  }

  const handleSaveSettings = () => {
    const saved = saveBackupSettings(settings)
    setSettings(saved)
    setSettingsSavedAt(new Date())
  }

  const updateSchedule = (category: BackupCategory, patch: Partial<ScheduleSettings>) => {
    setSettings((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }))
  }

  const handleToggleAutoPrune = (checked: boolean) => {
    setAutoPrune(checked)
    setAutoPruneEnabled(checked)
  }

  const handleEnableNotifications = async () => {
    setNotifPermission(await requestNotificationPermission())
  }

  const overwriteArmed = mode !== 'overwrite' || overwriteConfirmText === 'OVERWRITE'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <DatabaseBackup className="w-7 h-7 text-primary" />
          Backup &amp; Restore
        </h1>
        <p className="text-text-secondary mt-1">
          Download your clinic data to this device, restore from a backup file, and set backup reminders.
        </p>
      </div>

      {/* Card 1 — Device backup */}
      <div className={cardClass}>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <HardDriveDownload className="w-5 h-5 text-primary" />
          Device backup
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Backs up every database record plus this device's app settings (doctor profile with prescription
          logo, prescription memory &amp; templates) as one JSON file. Patient photos and x-ray image files are
          not inside this file. Use <span className="font-medium">Upload to Google Drive</span> to send it
          straight to your Drive, or <span className="font-medium">Download backup</span> to save it to this
          device (optionally synced with a FolderSync-type app).
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={handleUploadToDrive} disabled={busy}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {backupProgress
                  ? `Fetching ${backupProgress.table}… ${backupProgress.index}/${backupProgress.total}`
                  : 'Uploading to Drive…'}
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 mr-2" />
                Upload to Google Drive
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleDownloadBackup} disabled={busy}>
            {backingUp ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {backupProgress
                  ? `Fetching ${backupProgress.table}… ${backupProgress.index}/${backupProgress.total}`
                  : 'Preparing…'}
              </>
            ) : (
              <>
                <HardDriveDownload className="w-4 h-4 mr-2" />
                Download backup
              </>
            )}
          </Button>
          <span className="text-sm text-text-secondary">
            Last backup from this device: {lastBackupAt ? format(lastBackupAt, 'PPp') : 'Never'}
          </span>
        </div>
        <label className="flex items-start gap-2 cursor-pointer mt-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={autoPrune}
            onChange={(e) => handleToggleAutoPrune(e.target.checked)}
          />
          <span className="text-sm text-text-secondary">
            Automatically delete older manual Drive backups (keep last 20). Applies to future uploads only.
            Scheduled Daily/Weekly/Monthly backups from Smart upload are pruned automatically (keep last 20 /
            5 / 2).
          </span>
        </label>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={encryptEnabled}
              onChange={(e) => handleSaveEncryption(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">
              Encrypt backups with a passphrase before they leave this device.{' '}
              <span className="font-medium text-amber-700">
                If you lose the passphrase, encrypted backups cannot be recovered by anyone — write it down
                somewhere safe.
              </span>
            </span>
          </label>
          {hasPassphrase && encryptEnabled && !showPassphraseEditor && (
            <div className="mt-2 ml-6 flex items-center gap-3">
              <span className="text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Passphrase set
              </span>
              <button
                type="button"
                className="text-xs underline text-text-secondary hover:text-gray-700"
                onClick={() => setShowPassphraseEditor(true)}
              >
                Change passphrase
              </button>
            </div>
          )}
          {showPassphraseEditor && (
            <div className="mt-2 ml-6 flex items-center gap-2">
              <input
                type="password"
                value={passphraseDraft}
                onChange={(e) => setPassphraseDraft(e.target.value)}
                placeholder="New passphrase"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveEncryption(true)}
                disabled={!passphraseDraft.trim()}
              >
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowPassphraseEditor(false); setPassphraseDraft('') }}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {uploadResult && !uploading && (
          <div className="mt-3 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Uploaded <span className="font-mono">{uploadResult.name}</span> to Google Drive.
              {uploadResult.verified ? (
                <span className="font-medium"> Integrity verified ✓</span>
              ) : (
                <span className="text-amber-700"> Could not verify integrity — consider re-uploading.</span>
              )}
              {uploadResult.webViewLink && (
                <>
                  {' '}
                  <a
                    href={uploadResult.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    View in Drive
                  </a>
                </>
              )}
            </span>
          </div>
        )}
        {uploadError && !uploading && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {uploadError}
          </div>
        )}
        {lastDownloadedFile && !backingUp && (
          <div className="mt-3 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Backup saved as <span className="font-mono">{lastDownloadedFile}</span> in your Downloads.
          </div>
        )}
      </div>

      {/* Card 2 — Restore */}
      <div className={cardClass}>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <FileUp className="w-5 h-5 text-primary" />
          Restore from a backup file
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Pick a <span className="font-mono">clinicmx-backup-…</span> file (plain, gzipped, or encrypted). You
          will see a summary of what it contains before anything is written.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.gz,.enc,application/json,application/gzip,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            handleFileChosen(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />

        {restore.step === 'passphrase' && (
          <div className="space-y-3">
            <div className="bg-amber-500/[0.14] border border-amber-500/[0.35] text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {restore.message}
            </div>
            <input
              type="password"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
              placeholder="Backup passphrase"
              autoFocus
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleFileChosen(pendingFileRef.current, restorePassphrase)}
                disabled={!restorePassphrase}
              >
                Unlock
              </Button>
              <Button variant="ghost" onClick={() => setRestore({ step: 'idle' })}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(restore.step === 'idle' || restore.step === 'error') && (
          <>
            {restore.step === 'error' && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {restore.message}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <FileUp className="w-4 h-4 mr-2" />
                Choose backup file
              </Button>
              <Button variant="outline" onClick={handleBrowseDrive} disabled={busy}>
                {driveBrowse.status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking Drive…
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4 mr-2" />
                    Restore from Google Drive
                  </>
                )}
              </Button>
            </div>

            {driveBrowse.status === 'error' && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {driveBrowse.message}
              </div>
            )}

            {driveBrowse.status === 'loaded' && (
              <div className="mt-3 space-y-4">
                {driveBrowse.files.length === 0 ? (
                  <div className="p-3 text-sm text-text-secondary border border-gray-200 rounded-lg">
                    No backups found in Drive yet.
                  </div>
                ) : (
                  (['daily', 'weekly', 'monthly', 'manual'] as const).map((group) => {
                    const files = driveBrowse.files.filter((f) => parseBackupCategory(f.name) === group)
                    if (files.length === 0) return null
                    const totalSize = files.reduce((s, f) => s + f.size, 0)
                    return (
                      <div key={group}>
                        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1 flex items-center justify-between">
                          <span>{group === 'manual' ? 'Manual' : CATEGORY_LABEL[group]}</span>
                          <span className="font-normal normal-case text-gray-400">
                            {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
                          </span>
                        </div>
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {files.map((f, i) => {
                            const older = files[i + 1]
                            const delta = older ? f.size - older.size : null
                            return (
                              <div key={f.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                                <div>
                                  <div className="font-mono">{f.name}</div>
                                  <div className="text-text-secondary text-xs">
                                    {f.modifiedTime ? format(new Date(f.modifiedTime), 'PPp') : ''} ·{' '}
                                    {formatBytes(f.size)}
                                    {delta !== null && (
                                      <span className={delta > 0 ? 'text-amber-600' : 'text-green-700'}>
                                        {' '}
                                        ({delta >= 0 ? '+' : ''}
                                        {formatBytes(delta)})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestoreFromDrive(f)}
                                  disabled={busy}
                                >
                                  {downloadingId === f.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    'Restore this'
                                  )}
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </>
        )}

        {restore.step === 'analyzing' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {restore.progress
              ? `Comparing ${restore.progress.table} with current data… ${restore.progress.index}/${restore.progress.total}`
              : 'Reading backup file…'}
          </div>
        )}

        {restore.step === 'summary' && (
          <div className="space-y-4">
            <div className="text-sm text-text-secondary">
              Backup from {format(new Date(restore.analysis.backup.created_at), 'PPp')} — format v
              {restore.analysis.backup.version}
            </div>
            {restore.warnings.map((w) => (
              <div
                key={w}
                className="bg-amber-500/[0.14] border border-amber-500/[0.35] text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {w}
              </div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-text-secondary">
                    <th className="py-2 pr-4 font-medium">Table</th>
                    <th className="py-2 pr-4 font-medium text-right">In backup</th>
                    <th className="py-2 pr-4 font-medium text-right">Already present</th>
                    <th className="py-2 font-medium text-right">Missing (will insert)</th>
                  </tr>
                </thead>
                <tbody>
                  {restore.analysis.tables.map((t) => (
                    <tr key={t.table} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4 font-mono text-xs">{t.table}</td>
                      <td className="py-1.5 pr-4 text-right">{t.inBackup}</td>
                      <td className="py-1.5 pr-4 text-right">{t.existing}</td>
                      <td className={`py-1.5 text-right ${t.missing > 0 ? 'font-semibold text-primary' : ''}`}>
                        {t.missing}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 pr-4 text-right">
                      {restore.analysis.tables.reduce((s, t) => s + t.inBackup, 0)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {restore.analysis.tables.reduce((s, t) => s + t.existing, 0)}
                    </td>
                    <td className="py-2 text-right">
                      {restore.analysis.tables.reduce((s, t) => s + t.missing, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="restore-mode"
                  className="mt-1"
                  checked={mode === 'insert-missing'}
                  onChange={() => setMode('insert-missing')}
                />
                <span className="text-sm">
                  <span className="font-medium">Add missing records only</span> — inserts records from the
                  backup that don't exist anymore. Existing records are never modified. Use this to recover
                  deleted data.
                </span>
              </label>

              <div className={`rounded-lg border p-3 ${mode === 'overwrite' ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restore-mode"
                    className="mt-1"
                    checked={mode === 'overwrite'}
                    onChange={() => setMode('overwrite')}
                  />
                  <span className="text-sm">
                    <span className="font-medium text-red-700">Overwrite existing records</span> — every record
                    in the backup replaces the current record with the same id (fields absent from the backup
                    keep their current values). For disaster recovery only. This cannot be undone.
                  </span>
                </label>
                {mode === 'overwrite' && (
                  <div className="mt-2 ml-6">
                    <label className="text-xs text-red-700 font-medium block mb-1">
                      Type OVERWRITE to enable:
                    </label>
                    <input
                      type="text"
                      value={overwriteConfirmText}
                      onChange={(e) => setOverwriteConfirmText(e.target.value)}
                      className="border border-red-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-red-400"
                      placeholder="OVERWRITE"
                    />
                  </div>
                )}
              </div>

              {restore.analysis.hasLocalSettings && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={restoreSettings}
                    onChange={(e) => setRestoreSettings(e.target.checked)}
                  />
                  <span className="text-sm">
                    Also restore app settings (doctor profile, prescription memory &amp; templates) onto this
                    device
                  </span>
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleRunRestore}
                disabled={!overwriteArmed || busy}
                className={mode === 'overwrite' ? 'bg-red-600 hover:bg-red-700 from-red-600 to-red-700' : ''}
              >
                {mode === 'overwrite' ? 'Overwrite from backup' : 'Restore missing records'}
              </Button>
              <Button variant="ghost" onClick={() => setRestore({ step: 'idle' })}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {restore.step === 'running' && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {restore.progress
              ? `Restoring ${restore.progress.table}… ${restore.progress.index}/${restore.progress.total}`
              : 'Starting restore…'}
            <span className="text-xs">(don't close this page)</span>
          </div>
        )}

        {restore.step === 'done' && (
          <div className="space-y-4">
            {restore.outcome.tables.some((t) => t.error) ? (
              <div className="bg-amber-500/[0.14] border border-amber-500/[0.35] text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Restore finished with errors. Records whose parent table failed will show a foreign-key error —
                fix the parent problem and run the same restore again (already-restored records are skipped
                automatically).
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Restore complete. Consider downloading a fresh backup now.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-text-secondary">
                    <th className="py-2 pr-4 font-medium">Table</th>
                    <th className="py-2 pr-4 font-medium text-right">Written</th>
                    <th className="py-2 pr-4 font-medium text-right">Skipped (existing)</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {restore.outcome.tables.map((t) => (
                    <tr key={t.table} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4 font-mono text-xs">{t.table}</td>
                      <td className="py-1.5 pr-4 text-right">{t.error ? 0 : t.written}</td>
                      <td className="py-1.5 pr-4 text-right">{t.skippedExisting}</td>
                      <td className="py-1.5 text-xs">
                        {t.error ? (
                          <span className="text-red-600">{t.error}</span>
                        ) : t.droppedColumns.length > 0 ? (
                          <span className="text-amber-700">
                            Skipped unknown column(s): {t.droppedColumns.join(', ')}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {restore.outcome.localSettings && (
                    <tr>
                      <td className="py-1.5 pr-4 text-xs">App settings</td>
                      <td className="py-1.5 pr-4 text-right" colSpan={2}>
                        {restore.outcome.localSettings.restored.join(', ') || '—'}
                      </td>
                      <td className="py-1.5 text-xs">
                        {restore.outcome.localSettings.error && (
                          <span className="text-red-600">{restore.outcome.localSettings.error}</span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Button variant="outline" onClick={() => setRestore({ step: 'idle' })}>
              Done
            </Button>
          </div>
        )}
      </div>

      {/* Card 3 — Reminders */}
      <div className={cardClass}>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <BellRing className="w-5 h-5 text-primary" />
          Backup reminders
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Enable Daily, Weekly, and/or Monthly on their own schedule. When a scheduled time passes, either a
          reminder appears (bell icon + banner + browser notification) asking you to back up manually, or —
          with <span className="font-medium">Smart upload</span> turned on — the app automatically backs up and
          uploads to Google Drive by itself, and just notifies you of the result.
        </p>
        <div className="space-y-4">
          {BACKUP_CATEGORIES.map((category) => {
            const schedule = settings[category]
            return (
              <div key={category} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={(e) => updateSchedule(category, { enabled: e.target.checked })}
                    />
                    {CATEGORY_LABEL[category]}
                  </label>
                  <label className="text-sm">
                    <span className="block text-text-secondary mb-1">Time</span>
                    <input
                      type="time"
                      value={schedule.time}
                      disabled={!schedule.enabled}
                      onChange={(e) => updateSchedule(category, { time: e.target.value || '23:30' })}
                      className="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </label>
                  <label
                    className={`flex items-center gap-2 text-sm pb-2 ${schedule.enabled ? 'cursor-pointer' : 'text-gray-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={schedule.autoUpload}
                      disabled={!schedule.enabled}
                      onChange={(e) => updateSchedule(category, { autoUpload: e.target.checked })}
                    />
                    Smart upload (auto-backup to Drive)
                  </label>
                </div>
                {schedule.enabled && (
                  <p className="text-xs text-text-secondary mt-2">
                    Next due: {format(getNextScheduledInstant(category, schedule), 'PPp')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <Button variant="secondary" onClick={handleSaveSettings} className="mt-4">
          Save settings
        </Button>
        {settingsSavedAt && <p className="text-sm text-green-700 mt-2">Saved.</p>}
        {isNotificationSupported() && (
          <div className="mt-4 flex items-center gap-3">
            {notifPermission === 'granted' ? (
              <span className="text-sm text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Browser notifications enabled
              </span>
            ) : notifPermission === 'denied' ? (
              <span className="text-sm text-text-secondary">
                Browser notifications are blocked — enable them in your browser's site settings.
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={handleEnableNotifications}>
                <BellRing className="w-4 h-4 mr-2" />
                Enable browser notifications
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
