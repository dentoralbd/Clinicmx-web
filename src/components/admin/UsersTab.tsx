import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { KeyRound, Pencil, Plus, Power, Trash2, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DEFAULT_PERMISSIONS, type AppPageKey, type AppPermissions } from '@/lib/appSession'
import {
  createAppUser,
  deleteAppUser,
  listAppUsers,
  setAppUserActive,
  setAppUserPassword,
  updateAppUser,
  type AppUserRecord,
} from '@/lib/appUsers'

type AccountRole = 'doctor' | 'operator'

const PAGE_OPTIONS: Array<{ key: AppPageKey; label: string }> = [
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'treatments', label: 'Treatments' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'billing', label: 'Billing' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'qr-search', label: 'QR Search' },
]

const ACTION_OPTIONS: Array<{ key: 'can_delete' | 'can_revert' | 'can_edit_clinic_profile'; label: string; hint: string }> = [
  { key: 'can_delete', label: 'Delete data', hint: 'Delete records and restore deletions' },
  { key: 'can_revert', label: 'Revert edits', hint: 'Undo changes from Edit History' },
  { key: 'can_edit_clinic_profile', label: 'Edit clinic details', hint: 'Logo, doctor and clinic letterhead info' },
]

interface UserFormState {
  role: AccountRole
  full_name: string
  identifier: string
  password: string
  confirmPassword: string
  permissions: AppPermissions
}

function emptyForm(role: AccountRole = 'doctor'): UserFormState {
  return {
    role,
    full_name: '',
    identifier: '',
    password: '',
    confirmPassword: '',
    permissions: structuredClone(DEFAULT_PERMISSIONS[role]),
  }
}

function permissionSummary(user: AppUserRecord) {
  const parts: string[] = []
  if (user.permissions.can_delete) parts.push('Delete')
  if (user.permissions.can_revert) parts.push('Revert')
  if (user.permissions.can_edit_clinic_profile) parts.push('Clinic details')
  const blockedPages = PAGE_OPTIONS.filter((p) => user.permissions.pages[p.key] === false)
  if (blockedPages.length > 0) parts.push(`No ${blockedPages.map((p) => p.label).join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : 'Standard access'
}

export function UsersTab() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<'create' | 'edit' | 'password' | null>(null)
  const [selected, setSelected] = useState<AppUserRecord | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm())
  const [formError, setFormError] = useState('')

  // isPending (not isLoading) so a paused/retrying fetch shows as loading
  // rather than falling through to the empty "No accounts yet" state.
  const { data: users = [], isPending, error } = useQuery({
    queryKey: ['app_users'],
    queryFn: listAppUsers,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['app_users'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error('Name is required.')
      if (!form.identifier.trim()) throw new Error('Email or phone number is required.')
      if (modal === 'create') {
        if (form.password.length < 4) throw new Error('Password must be at least 4 characters.')
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.')
        await createAppUser({
          role: form.role,
          full_name: form.full_name,
          identifier: form.identifier,
          password: form.password,
          permissions: form.permissions,
        })
      } else if (modal === 'edit' && selected) {
        await updateAppUser(selected.id, {
          role: form.role,
          full_name: form.full_name,
          identifier: form.identifier,
          permissions: form.permissions,
        })
      }
    },
    onSuccess: () => {
      closeModal()
      refresh()
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return
      if (form.password.length < 4) throw new Error('Password must be at least 4 characters.')
      if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.')
      await setAppUserPassword(selected.id, form.password, selected.full_name)
    },
    onSuccess: () => {
      closeModal()
      refresh()
    },
    onError: (err: Error) => setFormError(err.message),
  })

  async function handleToggleActive(user: AppUserRecord) {
    const verb = user.is_active ? 'Disable' : 'Enable'
    if (!confirm(`${verb} the account for ${user.full_name}?`)) return
    try {
      await setAppUserActive(user.id, !user.is_active, user.full_name)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update account.')
    }
  }

  async function handleDelete(user: AppUserRecord) {
    if (!confirm(`Delete the account for ${user.full_name}? They will no longer be able to log in.`)) return
    try {
      await deleteAppUser(user.id, user.full_name)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete account.')
    }
  }

  function openCreate() {
    setForm(emptyForm())
    setSelected(null)
    setFormError('')
    setModal('create')
  }

  function openEdit(user: AppUserRecord) {
    setSelected(user)
    setForm({
      role: user.role,
      full_name: user.full_name,
      identifier: user.identifier,
      password: '',
      confirmPassword: '',
      permissions: structuredClone(user.permissions),
    })
    setFormError('')
    setModal('edit')
  }

  function openPassword(user: AppUserRecord) {
    setSelected(user)
    setForm({ ...emptyForm(user.role), full_name: user.full_name })
    setFormError('')
    setModal('password')
  }

  function closeModal() {
    setModal(null)
    setSelected(null)
    setFormError('')
  }

  function setRole(role: AccountRole) {
    // Re-seed permissions from the role defaults when the role changes
    setForm((f) => ({ ...f, role, permissions: structuredClone(DEFAULT_PERMISSIONS[role]) }))
  }

  const busy = saveMutation.isPending || passwordMutation.isPending

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Doctor & Operator Accounts</h2>
              <p className="text-xs text-gray-400">
                Accounts log in with their email/phone and password. Permission changes apply at their next login.
              </p>
            </div>
          </div>
          <Button type="button" onClick={openCreate} className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Add Account
          </Button>
        </div>

        {isPending ? (
          <div className="py-10 text-center text-sm text-text-secondary">Loading accounts…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">
            Failed to load accounts: {error instanceof Error ? error.message : 'Unknown error'}
            <p className="mt-1 text-xs text-gray-400">
              If the app_users table does not exist yet, apply migration 021_app_users.sql in Supabase first.
            </p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No accounts yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Doctors and operators can only log in after you create an account for them here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((user) => (
              <div key={user.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{user.full_name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        user.role === 'doctor'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {user.role === 'doctor' ? 'Doctor' : 'Operator'}
                    </span>
                    {!user.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 break-all">{user.identifier}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {permissionSummary(user)}
                    {user.last_login_at
                      ? ` · Last login ${format(new Date(user.last_login_at), 'MMM d, yyyy h:mm a')}`
                      : ' · Never logged in'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    title="Edit account & permissions"
                    className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPassword(user)}
                    title="Reset password"
                    className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(user)}
                    title={user.is_active ? 'Disable account' : 'Enable account'}
                    className={`p-2 rounded-lg transition-colors ${
                      user.is_active
                        ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50'
                        : 'text-red-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    title="Delete account"
                    className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full my-8">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-bold">{modal === 'create' ? 'Add Account' : `Edit ${selected?.full_name}`}</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setFormError('')
                saveMutation.mutate()
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['doctor', 'operator'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRole(role)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                        form.role === role
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 text-text-secondary hover:border-gray-300'
                      }`}
                    >
                      {role === 'doctor' ? 'Doctor' : 'Operator'}
                    </button>
                  ))}
                </div>
                {modal === 'edit' && (
                  <p className="text-xs text-gray-400 mt-1">Changing the role resets permissions to that role's defaults.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g., Dr. Jane Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email or Phone Number *</label>
                <input
                  type="text"
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  placeholder="e.g., jane@example.com or 01712345678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">This is what they will type at login.</p>
              </div>

              {modal === 'create' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Password *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium">Permissions</label>
                <div className="space-y-2 border border-gray-200 rounded-lg p-3">
                  {ACTION_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.permissions[opt.key]}
                        onChange={(e) =>
                          setForm({ ...form, permissions: { ...form.permissions, [opt.key]: e.target.checked } })
                        }
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-800">{opt.label}</span>
                        <span className="block text-xs text-gray-400">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <label className="block text-sm font-medium pt-1">Page Access</label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border border-gray-200 rounded-lg p-3">
                  {PAGE_OPTIONS.map((page) => (
                    <label key={page.key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={form.permissions.pages[page.key]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            permissions: {
                              ...form.permissions,
                              pages: { ...form.permissions.pages, [page.key]: e.target.checked },
                            },
                          })
                        }
                      />
                      {page.label}
                    </label>
                  ))}
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} className="flex items-center gap-2">
                  {busy ? 'Saving…' : modal === 'create' ? (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Account
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'password' && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-bold">Reset Password — {selected.full_name}</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setFormError('')
                passwordMutation.mutate()
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">New Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Reset Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
