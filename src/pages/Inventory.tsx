import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Search, Edit, Trash2, Package, AlertTriangle,
  Calendar, RefreshCw, TrendingDown,
  Clock, CheckCircle, BarChart2, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { safeFormat } from '@/lib/utils'
import { differenceInDays } from 'date-fns'

type Category = 'Materials' | 'Instruments' | 'Others'
type MovementType = 'restock' | 'use' | 'adjust' | 'initial'
type ActiveTab = 'overview' | 'Materials' | 'Instruments' | 'Others'

interface InventoryItem {
  id: string
  name: string
  category: Category
  description: string | null
  quantity: number
  unit: string
  low_stock_threshold: number
  supplier: string | null
  cost: number | null
  notes: string | null
  expiry_date: string | null
  created_at: string
  updated_at: string
}

interface InventoryMovement {
  id: string
  item_id: string
  movement_type: MovementType
  quantity_change: number
  notes: string | null
  created_at: string
}

const CATEGORY_COLORS: Record<Category, string> = {
  Materials: 'bg-blue-50 text-blue-700 border-blue-200',
  Instruments: 'bg-purple-50 text-purple-700 border-purple-200',
  Others: 'bg-gray-50 text-gray-700 border-gray-200',
}

function getStockStatus(item: InventoryItem): 'ok' | 'low' | 'out' {
  if (item.quantity === 0) return 'out'
  if (item.quantity <= item.low_stock_threshold) return 'low'
  return 'ok'
}

function daysUntilExpiry(expiry_date: string | null): number | null {
  if (!expiry_date) return null
  return differenceInDays(new Date(expiry_date), new Date())
}

const EXPIRY_WARNING_DAYS = 60

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState<InventoryItem | null>(null)
  const [movementHistory, setMovementHistory] = useState<InventoryMovement[]>([])
  const [historyItemId, setHistoryItemId] = useState<string | null>(null)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring'>('all')

  const emptyForm = {
    name: '',
    category: 'Materials' as Category,
    description: '',
    quantity: 0,
    unit: 'piece',
    low_stock_threshold: 5,
    supplier: '',
    cost: '',
    notes: '',
    expiry_date: '',
  }

  const [formData, setFormData] = useState(emptyForm)
  const [adjustData, setAdjustData] = useState({ type: 'restock' as MovementType, amount: 0, notes: '' })

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name')
      if (error) throw error
      setItems((data || []) as InventoryItem[])
    } catch (error) {
      console.error('Error loading inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: any = {
      name: formData.name.trim(),
      category: formData.category,
      description: formData.description || null,
      quantity: Number(formData.quantity),
      unit: formData.unit || 'piece',
      low_stock_threshold: Number(formData.low_stock_threshold),
      supplier: formData.supplier || null,
      cost: formData.cost !== '' ? Number(formData.cost) : null,
      notes: formData.notes || null,
      expiry_date: formData.expiry_date || null,
    }

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventory_items')
          .update(payload)
          .eq('id', editingItem.id)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase
          .from('inventory_items')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        // Record initial stock movement
        if (payload.quantity > 0 && inserted) {
          await supabase.from('inventory_movements').insert({
            item_id: inserted.id,
            movement_type: 'initial',
            quantity_change: payload.quantity,
            notes: 'Initial stock entry',
          })
        }
      }
      closeForm()
      loadItems()
    } catch (error) {
      console.error('Error saving inventory item:', error)
      alert('Failed to save item')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this inventory item? This will also remove its movement history.')) return
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id)
      if (error) throw error
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (error) {
      console.error('Error deleting inventory item:', error)
      alert('Failed to delete item')
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!showAdjustModal) return
    const delta =
      adjustData.type === 'use'
        ? -Math.abs(adjustData.amount)
        : Math.abs(adjustData.amount)
    const newQty = Math.max(0, showAdjustModal.quantity + delta)

    try {
      const { error: itemErr } = await supabase
        .from('inventory_items')
        .update({ quantity: newQty })
        .eq('id', showAdjustModal.id)
      if (itemErr) throw itemErr

      const { error: movErr } = await supabase.from('inventory_movements').insert({
        item_id: showAdjustModal.id,
        movement_type: adjustData.type,
        quantity_change: delta,
        notes: adjustData.notes || null,
      })
      if (movErr) throw movErr

      setShowAdjustModal(null)
      setAdjustData({ type: 'restock', amount: 0, notes: '' })
      loadItems()
    } catch (error) {
      console.error('Error adjusting stock:', error)
      alert('Failed to adjust stock')
    }
  }

  async function loadHistory(itemId: string) {
    if (historyItemId === itemId) {
      setHistoryItemId(null)
      setMovementHistory([])
      setShowHistoryFor(null)
      return
    }
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setMovementHistory((data || []) as InventoryMovement[])
      setHistoryItemId(itemId)
      setShowHistoryFor(itemId)
    } catch (error) {
      console.error('Error loading history:', error)
    }
  }

  function openEdit(item: InventoryItem) {
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description || '',
      quantity: item.quantity,
      unit: item.unit,
      low_stock_threshold: item.low_stock_threshold,
      supplier: item.supplier || '',
      cost: item.cost !== null ? String(item.cost) : '',
      notes: item.notes || '',
      expiry_date: item.expiry_date || '',
    })
    setEditingItem(item)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingItem(null)
    setFormData(emptyForm)
  }

  // Derived data
  const lowStockMaterials = useMemo(
    () => items.filter((i) => i.category === 'Materials' && getStockStatus(i) !== 'ok'),
    [items]
  )
  const lowStockInstruments = useMemo(
    () => items.filter((i) => i.category === 'Instruments' && getStockStatus(i) !== 'ok'),
    [items]
  )
  const expiringMaterials = useMemo(
    () =>
      items.filter((i) => {
        if (i.category !== 'Materials' || !i.expiry_date) return false
        const days = daysUntilExpiry(i.expiry_date)
        return days !== null && days <= EXPIRY_WARNING_DAYS
      }),
    [items]
  )

  const totalAlerts = lowStockMaterials.length + lowStockInstruments.length + expiringMaterials.length

  function getTabItems(): InventoryItem[] {
    const categoryItems =
      activeTab === 'overview' ? [] : items.filter((i) => i.category === activeTab)
    let filtered = categoryItems
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q) ||
          (i.supplier ?? '').toLowerCase().includes(q)
      )
    }
    if (activeTab === 'Materials' && expiryFilter === 'expiring') {
      filtered = filtered.filter((i) => {
        const d = daysUntilExpiry(i.expiry_date)
        return d !== null && d <= EXPIRY_WARNING_DAYS
      })
    }
    return filtered
  }

  const tabItems = getTabItems()

  return (
    <div className="space-y-6 page-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Inventory Management
          </h1>
          <p className="text-text-secondary mt-1">Manage clinic supplies, instruments, and consumables</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadItems}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          {activeTab !== 'overview' && (
            <Button
              onClick={() => {
                setFormData({ ...emptyForm, category: activeTab as Category })
                setShowForm(true)
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Alert banners */}
      {totalAlerts > 0 && (
        <div className="space-y-2">
          {expiringMaterials.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <Calendar className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-amber-800">
                  {expiringMaterials.length} material{expiringMaterials.length !== 1 ? 's' : ''} expiring within 60 days
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  {expiringMaterials.slice(0, 3).map((i) => i.name).join(', ')}
                  {expiringMaterials.length > 3 && ` +${expiringMaterials.length - 3} more`}
                </p>
              </div>
              <button
                onClick={() => { setActiveTab('Materials'); setExpiryFilter('expiring') }}
                className="text-sm font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
              >
                View all
              </button>
            </div>
          )}
          {(lowStockMaterials.length > 0 || lowStockInstruments.length > 0) && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-red-800">
                  Low stock alert — {lowStockMaterials.length + lowStockInstruments.length} item(s) need restocking
                </p>
                <p className="text-sm text-red-700 mt-0.5">
                  {lowStockMaterials.length > 0 && `${lowStockMaterials.length} material${lowStockMaterials.length !== 1 ? 's' : ''}`}
                  {lowStockMaterials.length > 0 && lowStockInstruments.length > 0 && ' • '}
                  {lowStockInstruments.length > 0 && `${lowStockInstruments.length} instrument${lowStockInstruments.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 flex flex-wrap gap-1 p-2">
          {(['overview', 'Materials', 'Instruments', 'Others'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSearchTerm(''); setExpiryFilter('all') }}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-primary hover:bg-gray-200'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab}
              {tab === 'Materials' && lowStockMaterials.length + expiringMaterials.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {Math.min(lowStockMaterials.length + expiringMaterials.length, 9)}
                </span>
              )}
              {tab === 'Instruments' && lowStockInstruments.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {Math.min(lowStockInstruments.length, 9)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <OverviewTab
            items={items}
            loading={loading}
            lowStockMaterials={lowStockMaterials}
            lowStockInstruments={lowStockInstruments}
            expiringMaterials={expiringMaterials}
            onNavigate={(tab, filter) => {
              setActiveTab(tab)
              if (filter) setExpiryFilter(filter)
            }}
          />
        )}

        {/* Category Tabs */}
        {activeTab !== 'overview' && (
          <div className="p-4 space-y-4">
            {/* Search + expiry filter */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {activeTab === 'Materials' && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setExpiryFilter('all')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      expiryFilter === 'all'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setExpiryFilter('expiring')}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      expiryFilter === 'expiring'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Expiring in 2 Months
                    {expiringMaterials.length > 0 && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        expiryFilter === 'expiring' ? 'bg-white/30 text-white' : 'bg-amber-200 text-amber-800'
                      }`}>
                        {expiringMaterials.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Items table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <span className="spinner" />
              </div>
            ) : tabItems.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-text-secondary font-medium mb-3">
                  {expiryFilter === 'expiring'
                    ? 'No materials expiring within 60 days'
                    : searchTerm
                    ? 'No items match your search'
                    : `No ${activeTab.toLowerCase()} yet`}
                </p>
                {!searchTerm && expiryFilter === 'all' && (
                  <Button
                    onClick={() => {
                      setFormData({ ...emptyForm, category: activeTab as Category })
                      setShowForm(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Status</th>
                      {activeTab === 'Materials' && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Expiry</th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase hidden md:table-cell">Supplier</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tabItems.map((item) => {
                      const status = getStockStatus(item)
                      const days = daysUntilExpiry(item.expiry_date)
                      const isExpandedHistory = showHistoryFor === item.id
                      return (
                        <>
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{item.description}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold">{item.quantity}</span>
                              <span className="text-text-secondary ml-1">{item.unit}</span>
                            </td>
                            <td className="px-4 py-3">
                              <StockBadge status={status} threshold={item.low_stock_threshold} />
                            </td>
                            {activeTab === 'Materials' && (
                              <td className="px-4 py-3">
                                <ExpiryBadge expiry_date={item.expiry_date} days={days} />
                              </td>
                            )}
                            <td className="px-4 py-3 text-text-secondary hidden md:table-cell">
                              {item.supplier || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => loadHistory(item.id)}
                                  className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                  title="Stock history"
                                >
                                  <BarChart2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setShowAdjustModal(item)}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Adjust stock"
                                >
                                  <ArrowUpCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openEdit(item)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpandedHistory && (
                            <tr key={`${item.id}-history`}>
                              <td colSpan={activeTab === 'Materials' ? 6 : 5} className="px-4 pb-3 bg-gray-50">
                                <MovementHistory
                                  movements={movementHistory}
                                  onClose={() => { setShowHistoryFor(null); setHistoryItemId(null) }}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <ItemFormModal
          formData={formData}
          onChange={(d) => setFormData(d)}
          onSubmit={handleSubmit}
          onClose={closeForm}
          editing={editingItem !== null}
        />
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
        <AdjustStockModal
          item={showAdjustModal}
          data={adjustData}
          onChange={(d) => setAdjustData(d)}
          onSubmit={handleAdjust}
          onClose={() => { setShowAdjustModal(null); setAdjustData({ type: 'restock', amount: 0, notes: '' }) }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function OverviewTab({
  items,
  loading,
  lowStockMaterials,
  lowStockInstruments,
  expiringMaterials,
  onNavigate,
}: {
  items: InventoryItem[]
  loading: boolean
  lowStockMaterials: InventoryItem[]
  lowStockInstruments: InventoryItem[]
  expiringMaterials: InventoryItem[]
  onNavigate: (tab: ActiveTab, filter?: 'expiring') => void
}) {
  const counts = {
    Materials: items.filter((i) => i.category === 'Materials').length,
    Instruments: items.filter((i) => i.category === 'Instruments').length,
    Others: items.filter((i) => i.category === 'Others').length,
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Items"
          value={items.length}
          icon={<Package className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="Materials"
          value={counts.Materials}
          icon={<Package className="w-5 h-5" />}
          color="green"
          onClick={() => onNavigate('Materials')}
        />
        <StatCard
          label="Instruments"
          value={counts.Instruments}
          icon={<Package className="w-5 h-5" />}
          color="purple"
          onClick={() => onNavigate('Instruments')}
        />
        <StatCard
          label="Alerts"
          value={lowStockMaterials.length + lowStockInstruments.length + expiringMaterials.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expiring materials */}
        <div className="border border-amber-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-amber-50 px-4 py-3 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-amber-800">Expiring in 2 Months</h3>
              {expiringMaterials.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded-full">
                  {expiringMaterials.length}
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigate('Materials', 'expiring')}
              className="text-xs text-amber-700 hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-amber-100">
            {expiringMaterials.length === 0 ? (
              <div className="p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-1" />
                <p className="text-sm text-text-secondary">No materials expiring soon</p>
              </div>
            ) : (
              expiringMaterials.slice(0, 5).map((item) => {
                const days = daysUntilExpiry(item.expiry_date)!
                return (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-amber-50">
                    <p className="font-medium text-sm">{item.name}</p>
                    <ExpiryBadge expiry_date={item.expiry_date} days={days} />
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Low stock */}
        <div className="border border-red-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-red-50 px-4 py-3 border-b border-red-200">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <h3 className="font-semibold text-red-800">Low Stock Alerts</h3>
              {lowStockMaterials.length + lowStockInstruments.length > 0 && (
                <span className="px-2 py-0.5 bg-red-200 text-red-800 text-xs font-bold rounded-full">
                  {lowStockMaterials.length + lowStockInstruments.length}
                </span>
              )}
            </div>
          </div>
          <div className="divide-y divide-red-100">
            {lowStockMaterials.length + lowStockInstruments.length === 0 ? (
              <div className="p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-1" />
                <p className="text-sm text-text-secondary">All items are sufficiently stocked</p>
              </div>
            ) : (
              [...lowStockMaterials, ...lowStockInstruments].slice(0, 6).map((item) => {
                const status = getStockStatus(item)
                return (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-red-50">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-text-secondary">{item.category} • Threshold: {item.low_stock_threshold} {item.unit}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{item.quantity}</span>
                      <StockBadge status={status} threshold={item.low_stock_threshold} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StockBadge({ status, threshold }: { status: 'ok' | 'low' | 'out'; threshold: number }) {
  if (status === 'out')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
        Out of Stock
      </span>
    )
  if (status === 'low')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200">
        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
        Low ≤{threshold}
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
      OK
    </span>
  )
}

function ExpiryBadge({ expiry_date, days }: { expiry_date: string | null; days: number | null }) {
  if (!expiry_date) return <span className="text-xs text-text-secondary">—</span>
  if (days === null) return <span className="text-xs text-text-secondary">{safeFormat(expiry_date, 'MMM d, yyyy')}</span>
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">
        Expired
      </span>
    )
  if (days <= EXPIRY_WARNING_DAYS)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
        <Clock className="w-3 h-3" />
        {days}d left
      </span>
    )
  return <span className="text-xs text-text-secondary">{safeFormat(expiry_date, 'MMM d, yyyy')}</span>
}

function StatCard({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'red'
  onClick?: () => void
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 p-4 text-left w-full ${onClick ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-xs">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </Wrapper>
  )
}

function MovementHistory({
  movements,
  onClose,
}: {
  movements: InventoryMovement[]
  onClose: () => void
}) {
  const typeLabel: Record<MovementType, string> = {
    restock: 'Restock',
    use: 'Used',
    adjust: 'Adjusted',
    initial: 'Initial',
  }

  return (
    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Movement History</p>
        <button onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary">
          Close
        </button>
      </div>
      {movements.length === 0 ? (
        <p className="text-center text-sm text-text-secondary py-3">No movements recorded</p>
      ) : (
        <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {m.quantity_change > 0 ? (
                <ArrowUpCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <ArrowDownCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span className="font-medium w-20 flex-shrink-0">{typeLabel[m.movement_type as MovementType] ?? m.movement_type}</span>
              <span className={`font-bold flex-shrink-0 ${m.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
              </span>
              <span className="text-text-secondary flex-1 truncate">{m.notes || ''}</span>
              <span className="text-text-secondary text-xs flex-shrink-0">{safeFormat(m.created_at, 'MMM d, yyyy')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemFormModal({
  formData,
  onChange,
  onSubmit,
  onClose,
  editing,
}: {
  formData: any
  onChange: (d: any) => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  editing: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing ? 'Edit Item' : `Add ${formData.category} Item`}</h2>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${CATEGORY_COLORS[formData.category as Category]}`}>
            {formData.category}
          </span>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {!editing && (
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => onChange({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option>Materials</option>
                <option>Instruments</option>
                <option>Others</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => onChange({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => onChange({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quantity *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.quantity}
                onChange={(e) => onChange({ ...formData, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unit *</label>
              <input
                type="text"
                required
                value={formData.unit}
                onChange={(e) => onChange({ ...formData, unit: e.target.value })}
                placeholder="e.g. piece, box, bottle"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Low Stock Threshold *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.low_stock_threshold}
                onChange={(e) => onChange({ ...formData, low_stock_threshold: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Supplier</label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => onChange({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unit Cost</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.cost}
                onChange={(e) => onChange({ ...formData, cost: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {(formData.category === 'Materials') && (
              <div>
                <label className="block text-sm font-medium mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => onChange({ ...formData, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => onChange({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1">
              {editing ? 'Update Item' : 'Add Item'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdjustStockModal({
  item,
  data,
  onChange,
  onSubmit,
  onClose,
}: {
  item: InventoryItem
  data: { type: MovementType; amount: number; notes: string }
  onChange: (d: any) => void
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">Adjust Stock — {item.name}</h2>
          <p className="text-sm text-text-secondary mt-1">
            Current: <span className="font-semibold">{item.quantity} {item.unit}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Movement Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['restock', 'use', 'adjust'] as MovementType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...data, type: t })}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    data.type === t
                      ? t === 'use'
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-primary text-white border-primary'
                      : 'bg-gray-50 text-text-primary border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Quantity ({data.type === 'use' ? 'amount to use' : 'amount to add/set'}) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={data.amount || ''}
              onChange={(e) => onChange({ ...data, amount: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              type="text"
              value={data.notes}
              onChange={(e) => onChange({ ...data, notes: e.target.value })}
              placeholder="Reason for adjustment (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1">
              Apply
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
