<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { BrowserQRCodeReader } from '@zxing/browser'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BadgeCheck, BarChart3,
  Bell, BookOpenCheck, Boxes, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, ClipboardList, Download, Eye, EyeOff, FileClock, FileText,
  Fingerprint, Gauge, History, KeyRound, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package,
  Plus, RefreshCw, Search, Settings, Shield, ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal,
  Smartphone, Sparkles, Tags, TrendingDown, TrendingUp, User, UserCog, UserPlus, Users, Wallet, X,
  ScanBarcode, CircleAlert, LockKeyhole, Trash2, Pencil, RotateCcw, CheckCheck, QrCode, Camera, Clock3, Coins, WalletCards, Banknote
} from 'lucide-vue-next'
import { ApiError, get, post, patch, put } from './services/api'
import BrandMark from './components/atoms/BrandMark.vue'
import PaymentMethodSwitch from './components/molecules/PaymentMethodSwitch.vue'
import CashierShiftOpeningPanel from './components/organisms/CashierShiftOpeningPanel.vue'

type User = { id: string; fullName: string; email: string; roleKey: string; roleName: string; permissions: string[]; studentNumber?: string; className?: string; accountType?: string }
type Product = { id: string; sku: string; name: string; category: string; unit: string; price: number; stock: number; lowStockThreshold: number; active: boolean }
type CartLine = Product & { qty: number }
const user = ref<User | null>(null)
const token = ref(localStorage.getItem('dpay_token') || '')
const loginForm = reactive({ email: '', password: '' })
const showDemoLogins = import.meta.env.DEV
const loginBusy = ref(false)
const loginError = ref('')
const showPassword = ref(false)
const isRegistering = ref(false)
const registerBusy = ref(false)
const registerError = ref('')
const registerForm = reactive({ fullName: '', email: '', password: '', transactionPin: '', accountType: 'student', studentNumber: '', className: '' })
const currentPage = ref('dashboard')
const mobileNavOpen = ref(false)
const busy = ref(false)
const pageError = ref('')
const toast = ref<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
const period = ref<'day' | 'week' | 'month'>('day')
const summary = ref<any>({ sales: 0, salesCount: 0, topups: 0, expenses: 0, netOperational: 0, products: 0, stockValue: 0 })
const trend = ref<any[]>([])
const recentActivity = ref<any[]>([])
const lowStock = ref<any[]>([])
const products = ref<Product[]>([])
const productSearch = ref('')
const productFormOpen = ref(false)
const productEditId = ref<string | null>(null)
const productForm = reactive({ sku: '', name: '', category: 'Makanan', unit: 'pcs', price: 0, stock: 0, lowStockThreshold: 5, active: true })
const restockTarget = ref<Product | null>(null)
const restockForm = reactive({ quantity: 10, note: '' })
const cart = ref<CartLine[]>([])
const skuInput = ref('')
const qrInput = ref('')
const transactionPin = ref('')
const paymentPinError = ref('')
const qrAccount = ref<any>(null)
const qrVerifyBusy = ref(false)
const cameraOpen = ref(false)
const cameraError = ref('')
const qrVideo = ref<HTMLVideoElement | null>(null)
let qrControls: { stop: () => void } | null = null
const qrPreviewOpen = ref(false)
const qrPreview = ref<any>(null)
const qrPreviewImage = ref('')
const walletQrImage = ref('')
const checkoutBusy = ref(false)
const lastReceipt = ref<any>(null)
const paymentMethod = ref<'cash' | 'qr_wallet'>('qr_wallet')
const cashReceived = ref(0)
const activeShift = ref<any>(null)
const shifts = ref<any[]>([])
const shiftOpeningBusy = ref(false)
const shiftClosingBusy = ref(false)
const adminShiftClosingBusy = ref(false)
const closeShiftPanelOpen = ref(false)
const openingShiftForm = reactive({ openingCash: 500000, note: 'Modal awal operasional' })
const closingShiftForm = reactive({ closingCash: 500000, note: '' })
const adminShiftCloseTarget = ref<any>(null)
const adminShiftCloseForm = reactive({ closingCash: 0, note: '' })
let pendingCheckoutFingerprint = ''
let pendingCheckoutKey = ''
const scannerMessage = ref('Arahkan scanner ke barcode SKU atau ketik SKU lalu tekan Enter.')
const sales = ref<any[]>([])
const salesSearch = ref('')
const reportData = ref<any>(null)
const expenses = ref<any[]>([])
const expenseForm = reactive({ category: 'Operasional', description: '', amount: 0 })
const users = ref<any[]>([])
const userSearch = ref('')
const userFormOpen = ref(false)
const userSubmitting = ref(false)
const userActionBusyId = ref<string | null>(null)
const userForm = reactive({ fullName: '', email: '', password: '', transactionPin: '', roleKey: 'pelanggan', accountType: 'student', studentNumber: '', className: '' })
const userProfileEditor = ref<any>(null)
const userProfileForm = reactive({ fullName: '', email: '', password: '', roleKey: '' })
const scannerBuffer = ref('')
let scannerEntryDeadline = 0
const topupTarget = ref<any>(null)
const topupSubmitting = ref(false)
const topupForm = reactive({ amount: 10000, note: 'Top-up saldo kantin' })
const wallet = ref<any>({ balance: 0, qrToken: null })
const walletTransactions = ref<any[]>([])
const ownSales = ref<any[]>([])
const roles = ref<any[]>([])
const permissions = ref<any[]>([])
const selectedRoleId = ref('')
const rolePermissionDraft = ref<string[]>([])
const opnames = ref<any[]>([])
const opnameForm = reactive({ sku: '', actualStock: 0, note: '' })
const auditLogs = ref<any[]>([])
const tabSearch = ref('')
const selectedProduct = computed(() => products.value.find(p => p.sku === opnameForm.sku))
const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + item.price * item.qty, 0))
const cartQty = computed(() => cart.value.reduce((sum, item) => sum + item.qty, 0))
const cashChange = computed(() => Math.max(0, Number(cashReceived.value || 0) - cartTotal.value))
watch(cartTotal, (next, previous) => { if (cashReceived.value === 0 || cashReceived.value === previous) cashReceived.value = next })
const selectedRole = computed(() => roles.value.find(role => role.id === selectedRoleId.value))
const permissionGroups = computed(() => {
  const groups: Record<string, any[]> = {}
  permissions.value.forEach(permission => { (groups[permission.group] ||= []).push(permission) })
  return groups
})
const navItems = computed(() => {
  if (!user.value) return []
  if (user.value.roleKey === 'pelanggan') return [
    { id: 'my-wallet', label: 'Saldo & aktivitas', icon: Wallet, show: true, group: 'AKUN SAYA' },
    { id: 'my-history', label: 'Riwayat pembelian', icon: History, show: true, group: 'AKUN SAYA' },
  ]
  const list = [
    { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, show: has('dashboard.view'), group: 'WORKSPACE' },
    { id: 'pos', label: 'Kasir & scan SKU', icon: ScanBarcode, show: has('pos.access'), group: 'WORKSPACE', badge: 'POS' },
    { id: 'shifts', label: 'Shift kasir', icon: Clock3, show: has('shifts.view'), group: 'MANAJEMEN' },
    { id: 'products', label: 'Produk & inventori', icon: Package, show: has('products.view'), group: 'MANAJEMEN' },
    { id: 'users', label: 'Akun & QR siswa/guru', icon: Users, show: has('users.view'), group: 'MANAJEMEN' },
    { id: 'transactions', label: 'Riwayat transaksi', icon: History, show: has('sales.view'), group: 'MANAJEMEN' },
    { id: 'expenses', label: 'Pengeluaran', icon: ArrowDownRight, show: has('expenses.view'), group: 'KEUANGAN' },
    { id: 'reports', label: 'Laporan & analitik', icon: BarChart3, show: has('reports.view'), group: 'KEUANGAN' },
    { id: 'stock', label: 'Stok opname', icon: ClipboardList, show: has('stock.view'), group: 'KEUANGAN' },
    { id: 'roles', label: 'Role & permission', icon: ShieldCheck, show: has('roles.manage'), group: 'SISTEM' },
    { id: 'audit', label: 'Audit aktivitas', icon: FileClock, show: has('audit.view'), group: 'SISTEM' },
  ]
  return list.filter(item => item.show)
})
const pageTitle = computed(() => ({ dashboard: 'Ringkasan kantin', pos: 'Kasir & pembayaran', products: 'Produk & inventori', users: 'Akun & QR siswa/guru', transactions: 'Riwayat transaksi', expenses: 'Pengeluaran operasional', reports: 'Laporan & analitik', stock: 'Stok opname', roles: 'Role & permission', audit: 'Audit aktivitas', shifts: 'Shift kasir & modal', 'my-wallet': 'Saldo & aktivitas', 'my-history': 'Riwayat pembelian' } as Record<string, string>)[currentPage.value] || 'DMC FLOW')

function has(permission: string) { return !!user.value && (user.value.roleKey === 'superadmin' || user.value.permissions?.includes(permission)) }
function money(value: number | string | undefined) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function compactMoney(value: number) { return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) }
function dateTime(value: string) { return value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
function shortDate(value: string) { return value ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(value)) : '—' }
function notify(message: string, kind: 'success' | 'error' | 'info' = 'success') { toast.value = { message, kind }; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = null, 4200) }
function reportError(error: unknown) { if (error instanceof ApiError) { if (error.status === 401) { logout(false); loginError.value = 'Sesi berakhir. Silakan masuk kembali.'; return } if (error.status === 403) notify(error.message, 'error'); else notify(error.message, 'error') } else notify(error instanceof Error ? error.message : 'Terjadi kesalahan. Coba kembali.', 'error') }
async function login() {
  loginBusy.value = true; loginError.value = ''
  try { const result = await post<any>('/auth/login', loginForm); token.value = result.token; localStorage.setItem('dpay_token', result.token); user.value = result.user; currentPage.value = result.user.roleKey === 'pelanggan' ? 'my-wallet' : 'dashboard'; await loadCurrentPage(); notify(`Selamat datang, ${result.user.fullName}.`, 'success') }
  catch (error) { loginError.value = error instanceof Error ? error.message : 'Login gagal.' }
  finally { loginBusy.value = false }
}
async function registerCustomer() {
  registerBusy.value = true; registerError.value = ''
  try {
    const result = await post<any>('/auth/register', registerForm)
    token.value = result.token; localStorage.setItem('dpay_token', result.token)
    user.value = result.user; currentPage.value = 'my-wallet'
    await loadCurrentPage()
    notify('Akun berhasil dibuat. Simpan QR akun dan rahasiakan PIN transaksi.', 'success')
  } catch (error) { registerError.value = error instanceof Error ? error.message : 'Pendaftaran gagal.' }
  finally { registerBusy.value = false }
}
function logout(showMessage = true) { localStorage.removeItem('dpay_token'); token.value = ''; user.value = null; cart.value = []; currentPage.value = 'dashboard'; if (showMessage) notify('Anda telah keluar dari aplikasi.', 'info') }
async function restoreSession() {
  if (!token.value) return
  try { const result = await get<any>('/auth/me'); user.value = result.user; currentPage.value = result.user.roleKey === 'pelanggan' ? 'my-wallet' : 'dashboard'; await loadCurrentPage() }
  catch { logout(false) }
}
function navigate(page: string) { currentPage.value = page; mobileNavOpen.value = false; pageError.value = ''; loadCurrentPage() }
async function loadCurrentPage() {
  if (!user.value) return
  busy.value = true; pageError.value = ''
  try {
    switch (currentPage.value) {
      case 'dashboard': await loadDashboard(); break
      case 'pos': await Promise.all([loadProducts(), loadCurrentShift()]); break
      case 'shifts': await loadShifts(); break
      case 'products': await loadProducts(); break
      case 'users': await loadUsers(); break
      case 'transactions': await loadSales(); break
      case 'expenses': await loadExpenses(); break
      case 'reports': await loadReports(); break
      case 'stock': await Promise.all([loadProducts(), loadOpnames()]); break
      case 'roles': await loadRoles(); break
      case 'audit': { const r = await get<any>('/audit-logs'); auditLogs.value = r.logs; break }
      case 'my-wallet': await loadMyWallet(); break
      case 'my-history': await Promise.all([loadMyWallet(), loadOwnSales()]); break
    }
  } catch (error) { pageError.value = error instanceof Error ? error.message : 'Data tidak dapat dimuat.'; reportError(error) }
  finally { busy.value = false }
}
async function loadDashboard() { const result = await get<any>(`/dashboard?period=${period.value}`); summary.value = result.summary; trend.value = result.trend || []; recentActivity.value = result.activity || []; lowStock.value = result.lowStock || [] }
async function loadProducts() { const result = await get<any>(`/products?search=${encodeURIComponent(productSearch.value)}&active=all`); products.value = result.products }
async function loadUsers() { const result = await get<any>(`/users?search=${encodeURIComponent(userSearch.value)}`); users.value = result.users }
async function loadSales() { const result = await get<any>(`/sales?period=${period.value}`); sales.value = result.sales }
async function loadExpenses() { const result = await get<any>(`/expenses?period=${period.value}`); expenses.value = result.expenses }
async function loadReports() { reportData.value = await get<any>(`/reports?period=${period.value}`) }
async function loadOpnames() { const result = await get<any>(`/stock-opname?period=${period.value}`); opnames.value = result.opnames }
async function loadCurrentShift() { const result = await get<any>('/shifts/current'); activeShift.value = result.shift; if (result.shift) closingShiftForm.closingCash = Number(result.shift.expectedCash ?? result.shift.openingCash ?? 0) }
async function loadShifts() { const result = await get<any>('/shifts'); shifts.value = result.shifts || [] }
async function openCashierShift() {
  shiftOpeningBusy.value = true
  try { const result = await post<any>('/shifts/open', { openingCash: Number(openingShiftForm.openingCash), note: openingShiftForm.note }); activeShift.value = result.shift; closingShiftForm.closingCash = Number(result.shift.expectedCash ?? result.shift.openingCash); closeShiftPanelOpen.value = false; notify('Shift dibuka. Modal awal tercatat atas nama ' + user.value?.fullName + '.', 'success'); }
  catch (e) { reportError(e) } finally { shiftOpeningBusy.value = false }
}
async function closeCashierShift() {
  shiftClosingBusy.value = true
  try { const result = await post<any>('/shifts/close', { closingCash: Number(closingShiftForm.closingCash), note: closingShiftForm.note }); activeShift.value = null; closeShiftPanelOpen.value = false; openingShiftForm.openingCash = 500000; closingShiftForm.note = ''; cart.value = []; qrInput.value = ''; qrAccount.value = null; transactionPin.value = ''; notify(result.message || 'Shift ditutup.', 'success'); await loadCurrentShift() }
  catch (e) { reportError(e) } finally { shiftClosingBusy.value = false }
}
function prepareAdminShiftClose(shift: any) { adminShiftCloseTarget.value = shift; adminShiftCloseForm.closingCash = Number(shift.expectedCash ?? shift.openingCash ?? 0); adminShiftCloseForm.note = 'Penutupan shift oleh admin' }
async function submitAdminShiftClose() {
  if (!adminShiftCloseTarget.value) return
  adminShiftClosingBusy.value = true
  try { const result = await post<any>(`/shifts/${adminShiftCloseTarget.value.id}/admin-close`, { closingCash: Number(adminShiftCloseForm.closingCash), note: adminShiftCloseForm.note }); adminShiftCloseTarget.value = null; await loadShifts(); notify(result.message || 'Shift ditutup oleh admin.', 'success') }
  catch (e) { reportError(e) } finally { adminShiftClosingBusy.value = false }
}
function setPaymentMethod(method: 'cash'|'qr_wallet') { paymentMethod.value = method; paymentPinError.value = ''; if (method === 'cash') { qrInput.value = ''; qrAccount.value = null; transactionPin.value = ''; if (!cashReceived.value || cashReceived.value < cartTotal.value) cashReceived.value = cartTotal.value } }
async function loadRoles() { const result = await get<any>('/roles'); roles.value = result.roles; permissions.value = result.permissions; if (!selectedRoleId.value && roles.value.length) selectedRoleId.value = roles.value[0].id; syncRoleDraft() }
async function loadMyWallet() { const [w, tx] = await Promise.all([get<any>('/wallet/me'), get<any>('/wallet/me/transactions')]); wallet.value = w.wallet; walletTransactions.value = tx.transactions; walletQrImage.value = w.wallet.qrToken ? await QRCode.toDataURL(`DPAY:${w.wallet.qrToken}`, { width: 260, margin: 1, color: { dark: '#102a43', light: '#ffffff' } }) : '' }
async function loadOwnSales() { const result = await get<any>('/sales/mine'); ownSales.value = result.sales }
watch(period, async () => { if (['dashboard', 'transactions', 'expenses', 'reports', 'stock'].includes(currentPage.value)) await loadCurrentPage() })
watch(productSearch, async () => { if (currentPage.value === 'products') await loadProducts() })
watch(userSearch, async () => { if (currentPage.value === 'users') await loadUsers() })
watch(selectedRoleId, syncRoleDraft)
function syncRoleDraft() { rolePermissionDraft.value = [...(selectedRole.value?.permissions || [])] }
function togglePermission(code: string, checked: boolean) { rolePermissionDraft.value = checked ? [...new Set([...rolePermissionDraft.value, code])] : rolePermissionDraft.value.filter(item => item !== code) }
async function saveRolePermissions() { if (!selectedRole.value) return; try { await put(`/roles/${selectedRole.value.id}/permissions`, { permissions: rolePermissionDraft.value }); notify('Perubahan permission disimpan.'); await loadRoles() } catch (e) { reportError(e) } }
function buildBarcodeImage(sku: string) {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, sku, {
    format: 'CODE128',
    displayValue: true,
    width: 2,
    height: 80,
    margin: 10,
    fontSize: 14,
    background: '#ffffff',
    lineColor: '#0f172a',
  })
  return canvas.toDataURL('image/png')
}
function exportProductSkuXlsx() {
  const rows = (products.value || []).map((product) => ({
    sku: product.sku,
    nama_produk: product.name,
    kategori: product.category,
    satuan: product.unit,
    harga_jual: Number(product.price || 0),
    stok: Number(product.stock || 0),
    status: product.active ? 'Aktif' : 'Nonaktif',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'SKU Produk')
  XLSX.writeFile(workbook, `daftar-sku-produk-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
function exportProductBarcodePdf() {
  if (!products.value.length) {
    notify('Belum ada produk untuk dibuat barcode.', 'error')
    return
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const columns = 2
  const rowsPerPage = 6
  const cellWidth = (pageWidth - 24) / columns
  const cellHeight = 46
  const activeProducts = products.value.filter((product) => product.active)
  const items = activeProducts.length ? activeProducts : products.value
  items.forEach((product, index) => {
    const pageIndex = Math.floor(index / rowsPerPage)
    const localIndex = index % rowsPerPage
    const row = Math.floor(localIndex / columns)
    const col = localIndex % columns
    const x = 12 + col * cellWidth + 4
    const y = 18 + row * cellHeight + pageIndex * 130
    if (y + 25 > pageHeight - 12 && index + 1 < items.length) {
      doc.addPage()
    }
    const barcodeData = buildBarcodeImage(product.sku)
    doc.setFillColor(255, 255, 255)
    doc.rect(x, y, cellWidth - 8, 30, 'F')
    doc.addImage(barcodeData, 'PNG', x + 2, y + 2, cellWidth - 12, 16)
    doc.setFontSize(10)
    doc.text(product.sku, x + (cellWidth - 12) / 2, y + 24, { align: 'center' })
    doc.setFontSize(9)
    doc.text(product.name.replace(/\s+/g, ' ').slice(0, 24), x + 2, y + 30, { maxWidth: cellWidth - 10 })
  })
  doc.save(`barcode-produk-${new Date().toISOString().slice(0, 10)}.pdf`)
}
function openNewProduct() { productEditId.value = null; Object.assign(productForm, { sku: '', name: '', category: 'Makanan', unit: 'pcs', price: 0, stock: 0, lowStockThreshold: 5, active: true }); productFormOpen.value = true }
function openEditProduct(product: Product) { productEditId.value = product.id; Object.assign(productForm, { ...product }); productFormOpen.value = true }
async function saveProduct() { try { const body = { ...productForm, price: Number(productForm.price), stock: Number(productForm.stock), lowStockThreshold: Number(productForm.lowStockThreshold) }; if (productEditId.value) await patch(`/products/${productEditId.value}`, body); else await post('/products', body); productFormOpen.value = false; await loadProducts(); notify(productEditId.value ? 'Produk diperbarui.' : 'Produk ditambahkan. SKU siap dipindai.'); } catch (e) { reportError(e) } }
function openRestock(product: Product) { restockTarget.value = product; restockForm.quantity = 10; restockForm.note = `Restok ${product.name}` }
async function submitRestock() { if (!restockTarget.value) return; const quantity = Number(restockForm.quantity); if (!Number.isFinite(quantity) || quantity <= 0) { notify('Jumlah restok harus lebih dari 0.', 'error'); return } const product = restockTarget.value; try { const result = await post<any>(`/products/${product.id}/restock`, { quantity, note: restockForm.note || `Restok ${product.name}` }); restockTarget.value = null; Object.assign(restockForm, { quantity: 10, note: '' }); await loadProducts(); notify(`${product.name} berhasil direstok ${result.restock.quantity} unit.`, 'success') } catch (e) { reportError(e) } }
async function deactivateProduct(product: Product) { if (!confirm(`Nonaktifkan ${product.name}? Riwayat penjualan tidak akan dihapus.`)) return; try { await patch(`/products/${product.id}`, { ...product, active: false }); await loadProducts(); notify('Produk dinonaktifkan.') } catch (e) { reportError(e) } }
function onPosScannerKeydown(event: KeyboardEvent) {
  if (currentPage.value !== 'pos') return

  const target = event.target as HTMLElement | null
  const isSkuField = target?.id === 'sku-scanner'
  const tag = target?.tagName
  if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !isSkuField) return

  const timeline = Date.now()
  if (event.key === 'Enter' || event.key === 'Tab') {
    const rawValue = scannerBuffer.value.trim()
    if (rawValue) {
      skuInput.value = rawValue
      void scanSku()
      scannerBuffer.value = ''
      event.preventDefault()
    }
    return
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (timeline - scannerEntryDeadline > 120) scannerBuffer.value = ''
    scannerBuffer.value += event.key
    scannerEntryDeadline = timeline
  }
}
async function scanSku() {
  const sku = skuInput.value.trim(); if (!sku) return
  try {
    const result = await get<any>(`/products/sku/${encodeURIComponent(sku)}`); const product: Product = result.product
    if (product.stock < 1) { scannerMessage.value = `Stok ${product.name} habis.`; notify(scannerMessage.value, 'error'); return }
    const existing = cart.value.find(item => item.id === product.id)
    if (existing) { if (existing.qty >= product.stock) { notify('Jumlah melebihi stok tersedia.', 'error'); return }; existing.qty++ }
    else cart.value.push({ ...product, qty: 1 })
    scannerMessage.value = `${product.name} berhasil ditambahkan ke keranjang.`; skuInput.value = ''; notify(`${product.name} ditambahkan.`, 'success')
    requestAnimationFrame(() => document.getElementById('sku-scanner')?.focus())
  } catch (error) { scannerMessage.value = error instanceof Error ? error.message : 'SKU tidak ditemukan.'; reportError(error); skuInput.value = '' }
}
function incrementItem(item: CartLine, delta: number) { const target = cart.value.find(line => line.id === item.id); if (!target) return; if (delta > 0 && target.qty >= item.stock) { notify('Jumlah sudah mencapai stok tersedia.', 'error'); return }; target.qty += delta; if (target.qty <= 0) cart.value = cart.value.filter(line => line.id !== item.id) }
function clearCart() { cart.value = []; lastReceipt.value = null; scannerMessage.value = 'Keranjang dikosongkan.' }
function normalizeQrText(raw: string) { return raw.trim() }
async function identifyQr() {
  paymentPinError.value = ''
  if (!qrInput.value.trim()) { notify('Scan QR akun siswa/guru terlebih dahulu.', 'error'); return }
  qrVerifyBusy.value = true; qrAccount.value = null
  try { const result = await post<any>('/pos/identify', { qrToken: normalizeQrText(qrInput.value) }); qrAccount.value = result.account; notify(`QR valid: ${result.account.fullName}. Masukkan PIN transaksi pemilik akun.`, 'success') }
  catch (error) { qrAccount.value = null; reportError(error) }
  finally { qrVerifyBusy.value = false }
}
async function startQrCamera() {
  cameraError.value = ''; cameraOpen.value = true; await nextTick()
  try {
    const reader = new BrowserQRCodeReader()
    qrControls = await reader.decodeFromVideoDevice(undefined, qrVideo.value!, (result) => {
      if (result && cameraOpen.value) {
        qrInput.value = normalizeQrText(result.getText())
        stopQrCamera()
        void identifyQr()
      }
    })
  } catch (error) { cameraError.value = error instanceof Error ? error.message : 'Kamera tidak dapat diakses. Periksa izin kamera atau gunakan input QR manual.' }
}
function stopQrCamera() { qrControls?.stop(); qrControls = null; cameraOpen.value = false }
async function checkout() {
  if (!cart.value.length) { notify('Scan setidaknya satu produk dahulu.', 'error'); return }
  if (!activeShift.value) { notify('Buka shift dan catat modal awal terlebih dahulu.', 'error'); return }
  if (paymentMethod.value === 'qr_wallet') {
    if (!qrInput.value.trim() || !qrAccount.value) { notify('Scan dan verifikasi QR akun D-PAY terlebih dahulu.', 'error'); return }
    if (!/^(?!([0-9])\1{3,5})\d{4,6}$/.test(transactionPin.value)) { notify('PIN transaksi harus 4–6 digit dan tidak boleh semuanya sama.', 'error'); return }
  } else if (Number(cashReceived.value) < cartTotal.value) {
    notify('Uang tunai yang diterima belum cukup.', 'error'); return
  }
  checkoutBusy.value = true
  const items = cart.value.map(item => ({ sku: item.sku, qty: item.qty })).sort((a,b) => a.sku.localeCompare(b.sku))
  const fingerprint = JSON.stringify({ method: paymentMethod.value, qr: paymentMethod.value === 'qr_wallet' ? normalizeQrText(qrInput.value) : null, items, cashReceived: paymentMethod.value === 'cash' ? Number(cashReceived.value) : null })
  if (fingerprint !== pendingCheckoutFingerprint || !pendingCheckoutKey) {
    pendingCheckoutFingerprint = fingerprint
    pendingCheckoutKey = crypto.randomUUID()
  }
  try {
    const payload: any = { paymentMethod: paymentMethod.value, items, idempotencyKey: pendingCheckoutKey }
    if (paymentMethod.value === 'qr_wallet') Object.assign(payload, { qrToken: normalizeQrText(qrInput.value), transactionPin: transactionPin.value })
    else payload.cashReceived = Number(cashReceived.value)
    const result = await post<any>('/pos/checkout', payload)
    lastReceipt.value = result.sale; pendingCheckoutFingerprint = ''; pendingCheckoutKey = ''
    cart.value = []; qrInput.value = ''; transactionPin.value = ''; paymentPinError.value = ''; qrAccount.value = null; skuInput.value = ''; scannerMessage.value = 'Pembayaran berhasil. Siap untuk transaksi berikutnya.'; cashReceived.value = 0
    if (paymentMethod.value === 'cash') notify(`Pembayaran tunai berhasil · kembalian ${money(result.sale.cashChange)}.`, 'success')
    else notify(`Pembayaran D-PAY berhasil · sisa saldo ${money(result.sale.balanceAfter)}.`, 'success')
    await Promise.all([loadCurrentShift(), loadDashboardIfVisible()]); requestAnimationFrame(() => document.getElementById('sku-scanner')?.focus())
  } catch (error) {
    if (error instanceof ApiError && error.status === 422 && /pin salah/i.test(error.message)) {
      // A wrong transaction PIN is a payment validation error, not an expired login session.
      // Keep the cashier logged in and leave the QR/customer selected for a retry.
      paymentPinError.value = 'Mohon maaf, PIN salah.'
      transactionPin.value = ''
      await nextTick()
      document.getElementById('transaction-pin')?.focus()
    } else {
      reportError(error)
    }
  }
  finally { checkoutBusy.value = false }
}
async function loadDashboardIfVisible() { if (currentPage.value === 'dashboard') await loadDashboard(); if (currentPage.value === 'transactions') await loadSales() }
function openNewUser() {
  Object.assign(userForm, { fullName: '', email: '', password: '', transactionPin: '', roleKey: 'pelanggan', accountType: 'student', studentNumber: '', className: '' })
  userFormOpen.value = true
}
async function createUser() {
  if (userSubmitting.value) return
  userSubmitting.value = true
  try {
    const payload = { ...userForm, email: userForm.email.trim().toLowerCase(), fullName: userForm.fullName.trim() }
    const result = await post<any>('/users', payload)
    userFormOpen.value = false
    notify(`Akun ${result.user.fullName} berhasil dibuat.${result.user.qrToken ? ' QR dibuat otomatis.' : ''}`)
    // Keep the successful create separate from a subsequent refresh failure, so the
    // operator is not encouraged to repeat an already-committed create request.
    try { await loadUsers() } catch { notify('Akun berhasil dibuat, tetapi daftar belum tersegarkan. Tekan Muat ulang.', 'info') }
    if (result.user.qrToken) {
      const account = users.value.find(u => u.id === result.user.id) || result.user
      await showQr(account)
    }
  } catch (e) { reportError(e) }
  finally { userSubmitting.value = false }
}
function openUserProfileEditor(account: any) {
  userProfileEditor.value = account
  userProfileForm.fullName = account.fullName || ''
  userProfileForm.email = account.email || ''
  userProfileForm.password = ''
  userProfileForm.roleKey = account.roleKey || ''
}
async function saveUserProfileEditor() {
  if (!userProfileEditor.value) return
  const payload: Record<string, string> = {
    fullName: userProfileForm.fullName.trim(),
    email: userProfileForm.email.trim().toLowerCase(),
  }
  if (!payload.fullName || payload.fullName.length < 2) {
    notify('Nama lengkap minimal 2 karakter.', 'error')
    return
  }
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    notify('Format username/email tidak valid.', 'error')
    return
  }
  if (userProfileForm.password.trim()) {
    payload.password = userProfileForm.password.trim()
  }
  if (userProfileForm.roleKey && userProfileForm.roleKey !== userProfileEditor.value.roleKey) {
    await patch(`/users/${userProfileEditor.value.id}/role`, { roleKey: userProfileForm.roleKey })
  }
  await patch(`/users/${userProfileEditor.value.id}`, payload)
  userProfileEditor.value = null
  await loadUsers()
  notify('Data akun berhasil diperbarui.')
}
async function resetUserPassword(account: any) {
  const newPassword = prompt(`Masukkan kata sandi baru untuk ${account.fullName}:`, '')?.trim()
  if (!newPassword) return
  if (newPassword.length < 8) {
    notify('Kata sandi minimal 8 karakter.', 'error')
    return
  }
  userActionBusyId.value = account.id
  try {
    await patch(`/users/${account.id}`, { password: newPassword })
    notify(`Kata sandi ${account.fullName} berhasil direset.`)
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
async function showQr(account: any) {
  if (!account?.qrToken) { notify('QR akun belum tersedia. Coba muat ulang daftar atau terbitkan QR baru.', 'error'); return }
  try {
    qrPreview.value = account
    qrPreviewImage.value = await QRCode.toDataURL(`DPAY:${account.qrToken}`, { width: 320, margin: 1, color: { dark: '#102a43', light: '#ffffff' } })
    qrPreviewOpen.value = true
  } catch (error) { reportError(error) }
}
async function rotateQr(account: any) {
  if (!confirm(`Terbitkan QR baru untuk ${account.fullName}? QR lama langsung tidak berlaku.`)) return
  userActionBusyId.value = account.id
  try {
    const result = await post<any>(`/users/${account.id}/qr/rotate`, {})
    try { await loadUsers() } catch { /* The rotate response still contains the new token. */ }
    // Apply the rotate response last so a stale list cannot overwrite the fresh QR token.
    await showQr({ ...(users.value.find(u => u.id === account.id) || account), ...result.qr })
    notify('QR baru diterbitkan. Unduh/cetak QR baru dan musnahkan QR lama.')
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
async function revokeQr(account: any) {
  if (!confirm(`Cabut QR akun ${account.fullName}? QR tersebut tidak bisa dipakai untuk membayar.`)) return
  userActionBusyId.value = account.id
  try {
    await post(`/users/${account.id}/qr/revoke`, {})
    account.qrStatus = 'revoked'
    account.qrToken = null
    try { await loadUsers() } catch { /* The revocation already succeeded on the server. */ }
    notify('QR akun dicabut dan tidak dapat digunakan untuk membayar.')
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
async function toggleUserStatus(account: any) {
  if (account.id === user.value?.id) { notify('Akun yang sedang digunakan tidak dapat dinonaktifkan.', 'error'); return }
  const status = account.status === 'active' ? 'suspended' : 'active'
  const action = status === 'suspended' ? 'menonaktifkan' : 'mengaktifkan'
  if (!confirm(`Yakin ingin ${action} akun ${account.fullName}?`)) return
  userActionBusyId.value = account.id
  try {
    await patch(`/users/${account.id}/status`, { status })
    account.status = status
    try { await loadUsers() } catch { /* Status change has succeeded on the server. */ }
    notify(`Akun ${account.fullName} ${status === 'active' ? 'diaktifkan' : 'dinonaktifkan'}.`)
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
async function deleteUser(account: any) {
  if (account.id === user.value?.id) { notify('Anda tidak dapat menghapus akun yang sedang dipakai.', 'error'); return }
  if (!confirm(`Hapus/menonaktifkan akun ${account.fullName}? Aksi ini akan menangguhkan akun dan mencabut QR-nya.`)) return
  userActionBusyId.value = account.id
  try {
    await fetch(`/api/users/${account.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token.value}` } }).then(async (res) => {
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Gagal menonaktifkan akun.')
      return payload
    })
    try { await loadUsers() } catch { /* delete already succeeded */ }
    notify(`Akun ${account.fullName} berhasil dinonaktifkan.`)
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
async function changeUserRole(account: any) {
  userActionBusyId.value = account.id
  try {
    const response = await get<any>('/roles')
    const keys = (response.roles || []).map((r: any) => r.roleKey)
    const roleKey = prompt(`Pilih role baru (${keys.join(', ')}):`, account.roleKey)?.trim()
    if (!roleKey || roleKey === account.roleKey) return
    if (!keys.includes(roleKey)) { notify('Role tidak dikenal. Gunakan salah satu role yang ditampilkan.', 'error'); return }
    await patch(`/users/${account.id}/role`, { roleKey })
    try { await loadUsers() } catch { /* Role change succeeded, refresh can be retried. */ }
    notify(`Role ${account.fullName} diperbarui menjadi ${roleKey}.`)
  } catch (e) { reportError(e) }
  finally { userActionBusyId.value = null }
}
function openTopup(account: any) {
  if (account.roleKey !== 'pelanggan' || account.status !== 'active') { notify('Top-up hanya tersedia untuk akun siswa/guru yang aktif.', 'error'); return }
  topupTarget.value = { ...account, balance: Number(account.balance || 0) }
  Object.assign(topupForm, { amount: 10000, note: 'Top-up saldo kantin' })
}
async function submitTopup() {
  if (!topupTarget.value || topupSubmitting.value) return
  const amount = Number(topupForm.amount)
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 1000000000) { notify('Nominal top-up harus berupa bilangan bulat antara Rp1.000 dan Rp1.000.000.000.', 'error'); return }
  topupSubmitting.value = true
  const targetId = topupTarget.value.id
  const targetName = topupTarget.value.fullName
  try {
    const result = await post<any>('/wallet/topups', { userId: targetId, amount, note: topupForm.note.trim() || 'Top-up saldo kantin' })
    const balanceAfter = Number(result.balanceAfter)
    topupTarget.value.balance = balanceAfter
    const localAccount = users.value.find(account => account.id === targetId)
    if (localAccount) localAccount.balance = balanceAfter
    topupTarget.value = null
    Object.assign(topupForm, { amount: 10000, note: 'Top-up saldo kantin' })
    notify(`Top-up ${money(amount)} untuk ${targetName} berhasil. Saldo sekarang ${money(balanceAfter)}.`)
    // A failed refresh must not be presented as a failed top-up: the ledger and
    // wallet update have already committed on the server at this point.
    const refreshes: Promise<unknown>[] = [loadUsers()]
    if (currentPage.value === 'dashboard') refreshes.push(loadDashboard())
    if (currentPage.value === 'reports') refreshes.push(loadReports())
    const settled = await Promise.allSettled(refreshes)
    if (settled.some(item => item.status === 'rejected')) notify('Top-up berhasil. Sebagian ringkasan belum tersegarkan; muat ulang halaman untuk memperbarui data.', 'info')
  } catch (e) { reportError(e) }
  finally { topupSubmitting.value = false }
}
function downloadQr() {
  if (!qrPreviewImage.value || !qrPreview.value) return
  const a = document.createElement('a')
  a.href = qrPreviewImage.value
  a.download = `DMC-FLOW-DPAY-QR-${String(qrPreview.value.fullName || 'akun').replace(/[^a-z0-9_-]+/gi, '-')}.png`
  document.body.appendChild(a); a.click(); a.remove()
}
async function saveExpense() { try { await post('/expenses', { ...expenseForm, amount: Number(expenseForm.amount) }); Object.assign(expenseForm, { category: 'Operasional', description: '', amount: 0 }); await Promise.all([loadExpenses(), loadDashboardIfVisible()]); notify('Pengeluaran tercatat.') } catch (e) { reportError(e) } }
async function saveOpname() { try { const result = await post<any>('/stock-opname', opnameForm); Object.assign(opnameForm, { sku: '', actualStock: 0, note: '' }); await Promise.all([loadProducts(), loadOpnames()]); notify(`Stok opname tersimpan · selisih ${result.opname.difference > 0 ? '+' : ''}${result.opname.difference}.`) } catch (e) { reportError(e) } }
function exportTransactions() {
  const rows = sales.value
  const csv = [['No. Transaksi', 'Siswa/guru', 'Kasir', 'Metode', 'Total', 'Tanggal'], ...rows.map(row => [row.receiptNo,row.studentName,row.cashierName,row.paymentMethod==='cash'?'Tunai':'D-PAY',row.total,row.createdAt])].map(row => row.map((field: any) => `"${String(field ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `riwayat-penjualan-${period.value}.csv`; a.click(); URL.revokeObjectURL(url)
}
function exportReport() { const data = reportData.value?.summary || summary.value; const rows = [['Metrik','Nilai'],['Penjualan',data.sales],['Top-up saldo',data.topups],['Pengeluaran',data.expenses],['Saldo operasional',data.netOperational],['Arus kas top-up - pengeluaran',data.cashFlow]]; const blob = new Blob(['\ufeff' + rows.map(row => row.map((v: any) => `"${String(v)}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `laporan-kantin-${period.value}.csv`; a.click(); URL.revokeObjectURL(url) }
function roleIcon(role: string) { return role === 'superadmin' ? ShieldCheck : role === 'admin' ? UserCog : role === 'kasir' ? ScanBarcode : User }
function setPeriod(value: 'day' | 'week' | 'month') { period.value = value }

onMounted(() => {
  restoreSession()
  window.addEventListener('keydown', onPosScannerKeydown)
})
</script>

<template>
  <div v-if="!user" class="login-shell">
    <div class="login-visual">
      <div class="visual-top"><BrandMark :size="23" /><span>DMC<span class="brand-light"> FLOW</span></span><span class="brand-pill">SCHOOL WALLET + POS</span></div>
      <div class="visual-content">
        <div class="eyebrow"><span class="pulse-dot"></span> SISTEM KANTIN TERINTEGRASI</div>
        <h1>Transaksi kecil.<br /><span>Dampak besar.</span></h1>
        <p>Sistem saldo digital dan kasir kantin sekolah yang sederhana untuk siswa/guru, cepat untuk kasir, dan transparan untuk pengelola.</p>
        <div class="visual-stats"><div><strong>01</strong><span>Scan SKU</span></div><div><strong>02</strong><span>Scan QR</span></div><div><strong>03</strong><span>Selesai</span></div></div>
        <div class="visual-card qr-hero-card"><div class="card-head"><div class="qr-hero-mark"><QrCode :size="20"/></div><span>D-PAY ACCOUNT QR</span><ShieldCheck :size="16" /></div><div class="qr-hero-pattern" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="card-foot"><div><small>AKUN SISWA / GURU</small><strong>QR UNIK · SALDO DIGITAL</strong></div><div class="qr-lock-mark"><LockKeyhole :size="22" /></div></div></div>
      </div>
      <div class="visual-footer"><span><ShieldCheck :size="14" /> Secure by design</span><span>Made for school communities</span></div>
    </div>
    <div class="login-panel"><div class="login-panel-inner"><div class="mobile-brand"><BrandMark :size="22" /><strong>DMC FLOW</strong></div><div class="login-kicker">{{ isRegistering ? 'DAFTAR AKUN PELANGGAN' : 'SELAMAT DATANG KEMBALI' }}</div><h2>{{ isRegistering ? 'Buat akun siswa/guru' : 'Masuk ke akunmu' }}</h2><p class="login-subtitle">{{ isRegistering ? 'Akun siswa/guru digunakan untuk menyimpan saldo dan melihat riwayat belanja kantin.' : 'Kelola transaksi kantin sekolah dengan aman dan mudah.' }}</p>
      <form v-if="!isRegistering" class="login-form" @submit.prevent="login"><label>Email akun <span>EMAIL</span></label><div class="input-wrap"><User :size="18" /><input v-model="loginForm.email" type="email" required autocomplete="username" placeholder="nama@sekolah.sch.id" /></div><label>Kata sandi <span>PASSWORD</span></label><div class="input-wrap"><LockKeyhole :size="18" /><input v-model="loginForm.password" :type="showPassword ? 'text' : 'password'" required autocomplete="current-password" placeholder="Masukkan kata sandi" /><button class="icon-only password-toggle" type="button" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"><EyeOff v-if="showPassword" :size="17" /><Eye v-else :size="17" /></button></div><div v-if="loginError" class="form-error"><CircleAlert :size="16" />{{ loginError }}</div><button class="btn btn-primary btn-full btn-lg login-submit" type="submit" :disabled="loginBusy"><span v-if="loginBusy" class="spinner"></span><span v-else>Masuk ke dashboard</span><ChevronRight v-if="!loginBusy" :size="18" /></button></form>
      <form v-else class="login-form register-form" @submit.prevent="registerCustomer"><label>Nama lengkap</label><div class="input-wrap"><User :size="18"/><input v-model="registerForm.fullName" required minlength="2" maxlength="140" autocomplete="name" placeholder="Nama lengkap siswa/guru"/></div><label>Email akun sekolah</label><div class="input-wrap"><Activity :size="18"/><input v-model="registerForm.email" required type="email" maxlength="190" autocomplete="email" placeholder="nama@sekolah.sch.id"/></div><label>Kata sandi <span>MIN. 8 KARAKTER</span></label><div class="input-wrap"><LockKeyhole :size="18"/><input v-model="registerForm.password" required type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="Buat kata sandi"/></div><label>PIN transaksi <span>4–6 DIGIT</span></label><div class="input-wrap"><KeyRound :size="18"/><input v-model="registerForm.transactionPin" required type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="new-password" placeholder="Buat PIN yang tidak mudah ditebak"/></div><div class="register-grid"><label>Jenis akun<select v-model="registerForm.accountType"><option value="student">Siswa</option><option value="teacher">Guru</option></select></label><label>{{ registerForm.accountType==='teacher'?'NIP / nomor pegawai':'NIS / nomor induk' }}<input v-model="registerForm.studentNumber" maxlength="50" placeholder="Opsional"/></label><label>{{ registerForm.accountType==='teacher'?'Unit / jabatan':'Kelas' }}<input v-model="registerForm.className" maxlength="50" placeholder="Contoh: VIII-A"/></label></div><div v-if="registerError" class="form-error"><CircleAlert :size="16"/>{{ registerError }}</div><div class="register-hint"><ShieldCheck :size="15"/><span>QR akun dibuat otomatis. Data pendaftaran dapat mengikuti kebijakan verifikasi sekolah.</span></div><button class="btn btn-primary btn-full btn-lg login-submit" type="submit" :disabled="registerBusy"><span v-if="registerBusy" class="spinner"></span><span v-else>Buat akun D-Pay</span><ChevronRight v-if="!registerBusy" :size="18"/></button></form>
      <div v-if="!isRegistering && showDemoLogins" class="demo-logins"><div class="demo-heading"><span>Akses demo</span><span class="demo-line"></span></div><div class="demo-buttons"><button @click="loginForm.email='superadmin@dpay.local'; loginForm.password='SuperAdmin123!'">Super Admin</button><button @click="loginForm.email='kasir@dpay.local'; loginForm.password='Kasir123!'">Kasir</button><button @click="loginForm.email='siswa@dpay.local'; loginForm.password='Siswa123!'">Siswa/guru</button></div><small>Kredensial demo disediakan untuk pengembangan lokal.</small></div><div class="register-switch"><span>{{ isRegistering ? 'Sudah memiliki akun?' : 'Belum punya akun siswa/guru?' }}</span><button type="button" @click="isRegistering=!isRegistering; loginError=''; registerError='';">{{ isRegistering ? 'Masuk' : 'Daftar akun' }}</button></div><div class="login-security"><Shield :size="15" /><span>Protected session</span><span class="secure-divider"></span><span>Zero Trust access</span></div>
        </div></div>
  </div>

  <div v-else class="app-shell" :class="{ 'nav-open': mobileNavOpen }">
    <div class="mobile-overlay" v-if="mobileNavOpen" @click="mobileNavOpen=false"></div>
    <aside class="sidebar">
      <div class="side-brand"><BrandMark :size="22" /><div class="brand-copy"><strong>DMC FLOW</strong><small>D-PAY SCHOOL WALLET</small></div><button class="icon-only mobile-close" @click="mobileNavOpen=false"><X :size="18" /></button></div>
      <div class="school-switch"><div class="school-avatar"><Building2 :size="18" /></div><div><strong>Kantin Sekolah</strong><small>Operasional aktif</small></div><ChevronDown :size="15" class="school-chevron" /></div>
      <nav class="main-nav">
        <template v-for="item in navItems" :key="item.id">
          <div v-if="navItems.findIndex(n => n.group === item.group) === navItems.indexOf(item)" class="nav-label">{{ item.group }}</div>
          <button class="nav-item" :class="{ active: currentPage === item.id }" @click="navigate(item.id)"><component :is="item.icon" :size="18" :stroke-width="currentPage === item.id ? 2.2 : 1.8" /><span>{{ item.label }}</span><span v-if="item.badge" class="nav-badge">{{ item.badge }}</span><span v-if="currentPage === item.id" class="nav-active-mark"></span></button>
        </template>
      </nav>
      <div class="sidebar-bottom"><div class="security-panel"><div class="security-panel-icon"><ShieldCheck :size="18" /></div><div><strong>Secure workspace</strong><span>Zero Trust active</span></div><span class="security-live"></span></div><div class="side-user"><div class="avatar avatar-green">{{ user.fullName?.slice(0,1).toUpperCase() }}</div><div class="side-user-copy"><strong>{{ user.fullName }}</strong><span>{{ user.roleName }}</span></div><button class="icon-only side-logout" title="Keluar" @click="logout()"><LogOut :size="17" /></button></div></div>
    </aside>

    <main class="main-area">
      <header class="topbar"><div class="topbar-left"><button class="icon-only menu-toggle" @click="mobileNavOpen=true" aria-label="Buka navigasi"><Menu :size="21" /></button><div class="breadcrumb"><span>Workspace</span><ChevronRight :size="14" /><strong>{{ pageTitle }}</strong></div></div><div class="topbar-right"><div class="live-status"><span class="pulse-dot"></span><span>All systems operational</span></div><button class="icon-only notification-button" title="Notifikasi"><Bell :size="19" /><span></span></button><div class="topbar-divider"></div><div class="topbar-user"><div class="avatar avatar-blue">{{ user.fullName?.slice(0,1).toUpperCase() }}</div><div><strong>{{ user.fullName }}</strong><span>{{ user.roleName }}</span></div><ChevronDown :size="14" /></div></div></header>
      <div class="page-container">
        <div class="page-heading"><div><div class="page-eyebrow">DMC FLOW <span>/</span> {{ pageTitle.toUpperCase() }}</div><h1>{{ pageTitle }}<span v-if="currentPage==='pos'" class="live-badge"><span class="pulse-dot"></span> LIVE POS</span></h1><p v-if="currentPage==='dashboard'">Berikut gambaran aktivitas kantin sekolahmu.</p><p v-else-if="currentPage==='pos'">Scan SKU atau ketik manual, lalu pilih pembayaran tunai atau QR D-PAY. Pastikan shift dan modal kas sudah tercatat.</p><p v-else-if="currentPage==='users'">Kelola akun pelanggan, saldo dompet, dan QR pembayaran siswa/guru.</p><p v-else-if="currentPage==='roles'">Tentukan akses setiap role dengan kontrol izin yang granular.</p><p v-else-if="currentPage==='my-wallet'">Pantau saldo dan aktivitas dompet kantinmu.</p><p v-else>Data operasional kantin ditampilkan secara terpusat dan real-time saat halaman dimuat.</p></div><div class="heading-actions"><div v-if="['dashboard','transactions','expenses','reports','stock'].includes(currentPage)" class="period-switch"><button v-for="option in [{id:'day',label:'Hari ini'},{id:'week',label:'7 hari'},{id:'month',label:'30 hari'}]" :key="option.id" :class="{selected: period===option.id}" @click="setPeriod(option.id as any)">{{ option.label }}</button></div><button v-if="currentPage==='products' && has('products.manage')" class="btn btn-primary" @click="openNewProduct"><Plus :size="17" /> Tambah produk</button><button v-if="currentPage==='users' && has('users.manage')" class="btn btn-primary" @click="openNewUser"><UserPlus :size="17" /> Buat akun</button><button v-if="currentPage==='transactions'" class="btn btn-secondary" @click="exportTransactions"><Download :size="16" /> Ekspor CSV</button><button v-if="currentPage==='reports'" class="btn btn-secondary" @click="exportReport"><Download :size="16" /> Ekspor laporan</button><button v-if="['dashboard','products','users','transactions','expenses','reports','stock','roles','audit','shifts'].includes(currentPage)" class="icon-button refresh-button" @click="loadCurrentPage" title="Muat ulang"><RefreshCw :size="16" /></button></div></div>

        <div v-if="pageError" class="page-alert"><CircleAlert :size="18" /><span>{{ pageError }}</span><button @click="loadCurrentPage">Coba lagi</button></div>
        <div v-if="busy" class="loading-line"><span></span></div>

        <!-- DASHBOARD -->
        <section v-if="currentPage==='dashboard'" class="dashboard-page">
          <div class="welcome-banner"><div class="welcome-copy"><div class="welcome-tag"><Sparkles :size="14" /> OVERVIEW</div><h2>Aktivitas kantin, <span>terkendali.</span></h2><p>Semua pergerakan transaksi, saldo siswa/guru, dan stok terkumpul dalam satu tempat.</p><button class="btn btn-white" v-if="has('pos.access')" @click="navigate('pos')"><ScanBarcode :size="16" /> Buka kasir <ChevronRight :size="16" /></button></div><div class="welcome-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-card art-main"><div class="art-card-icon"><ShoppingCart :size="20" /></div><div><small>TRANSAKSI SELESAI</small><strong>{{ summary.salesCount || 0 }}</strong></div><span class="art-card-check"><Check :size="14" /></span></div><div class="art-card art-mini"><div class="mini-icon"><Wallet :size="16" /></div><div><small>TOP-UP SALDO</small><strong>{{ money(summary.topups) }}</strong></div></div><div class="art-dot dot-one"></div><div class="art-dot dot-two"></div></div></div>
          <div class="section-title-row"><div><h2>Ringkasan performa</h2><p>Angka berdasarkan periode yang dipilih.</p></div><div class="updated-label"><Activity :size="14" /> Data operasional</div></div>
          <div class="metric-grid"><article class="metric-card metric-sales"><div class="metric-top"><span class="metric-icon icon-indigo"><ShoppingCart :size="19" /></span><span class="metric-chip chip-positive"><TrendingUp :size="13" /> Penjualan</span></div><span class="metric-label">Total penjualan</span><strong class="metric-value">{{ money(summary.sales) }}</strong><div class="metric-bottom"><span>{{ summary.salesCount || 0 }} transaksi selesai</span><span class="metric-spark spark-indigo"><i v-for="(h,i) in [35,55,43,68,48,76,58,87,63,100,72,91]" :key="i" :style="{height:h+'%'}"></i></span></div></article>
            <article class="metric-card"><div class="metric-top"><span class="metric-icon icon-green"><ArrowDownLeft :size="19" /></span><span class="metric-chip chip-green">Diterima</span></div><span class="metric-label">Pemasukan penjualan</span><strong class="metric-value">{{ money(summary.income ?? summary.sales) }}</strong><div class="metric-bottom"><span>Pembayaran tunai + saldo D-PAY</span><span class="metric-spark spark-green"><i v-for="(h,i) in [40,30,52,47,65,59,74,65,82,73,92,80]" :key="i" :style="{height:h+'%'}"></i></span></div></article>
            <article class="metric-card"><div class="metric-top"><span class="metric-icon icon-orange"><ArrowDownRight :size="19" /></span><span class="metric-chip chip-orange">Operasional</span></div><span class="metric-label">Pengeluaran</span><strong class="metric-value">{{ money(summary.expenses) }}</strong><div class="metric-bottom"><span>Biaya tercatat</span><span class="metric-spark spark-orange"><i v-for="(h,i) in [66,52,59,40,47,32,55,43,30,37,24,18]" :key="i" :style="{height:h+'%'}"></i></span></div></article>
            <article class="metric-card"><div class="metric-top"><span class="metric-icon icon-blue"><Wallet :size="19" /></span><span class="metric-chip chip-blue">Top-up siswa/guru</span></div><span class="metric-label">Arus kas top-up − biaya</span><strong class="metric-value">{{ money(summary.cashFlow) }}</strong><div class="metric-bottom"><span>Top-up {{ money(summary.topups) }}</span><span class="metric-spark spark-blue"><i v-for="(h,i) in [25,42,35,55,48,68,52,71,65,79,69,96]" :key="i" :style="{height:h+'%'}"></i></span></div></article></div>
          <div class="dashboard-grid"><article class="panel chart-panel"><div class="panel-header"><div><h3>Tren penjualan</h3><p>Nilai transaksi per hari</p></div><span class="panel-chip"><TrendingUp :size="13" /> {{ period==='day'?'Hari ini':period==='week'?'7 hari terakhir':'30 hari terakhir' }}</span></div><div v-if="trend.length && trend.some((item:any)=>item.sales>0)" class="chart-area"><div class="chart-y-labels"><span>{{ compactMoney(Math.max(...trend.map((item:any)=>item.sales),1)) }}</span><span>{{ compactMoney(Math.max(...trend.map((item:any)=>item.sales),1)/2) }}</span><span>0</span></div><div class="chart-bars"><div class="chart-gridline gridline-one"></div><div class="chart-gridline gridline-two"></div><div v-for="(item,index) in trend" :key="index" class="chart-bar-wrap"><div class="chart-bar" :title="`${item.label}: ${money(item.sales)}`" :style="{height: `${Math.max(4, item.sales / Math.max(...trend.map((x:any)=>x.sales),1) * 100)}%`}"><span>{{ money(item.sales) }}</span></div><small>{{ item.label }}</small></div></div></div><div v-else class="empty-chart"><div class="empty-chart-icon"><BarChart3 :size="26" /></div><strong>Belum ada penjualan pada periode ini</strong><span>Data akan muncul setelah transaksi tunai atau D-PAY berhasil.</span><button v-if="has('pos.access')" class="btn btn-secondary btn-sm" @click="navigate('pos')">Mulai transaksi <ChevronRight :size="14" /></button></div><div class="chart-footer"><span><i class="legend-dot"></i> Penjualan berhasil</span><span>Nilai dalam Rupiah (IDR)</span></div></article>
            <article class="panel low-stock-panel"><div class="panel-header"><div><h3>Perlu diisi ulang</h3><p>Produk dengan stok menipis</p></div><span class="stock-count">{{ lowStock.length }} item</span></div><div v-if="lowStock.length" class="low-stock-list"><div v-for="item in lowStock" :key="item.id" class="low-stock-item"><div class="product-mini-icon"><Package :size="17" /></div><div class="low-stock-info"><strong>{{ item.name }}</strong><span>SKU {{ item.sku }}</span></div><div class="stock-remaining" :class="{ critical: item.stock===0, warning:item.stock>0 }"><strong>{{ item.stock }}</strong><span>tersisa</span></div></div></div><div v-else class="empty-state compact-empty"><div class="empty-state-icon success"><CheckCircle2 :size="22" /></div><strong>Stok aman</strong><span>Tidak ada produk yang kritis.</span></div><button v-if="has('stock.view')" class="panel-bottom-link" @click="navigate('stock')">Buka stok opname <ChevronRight :size="15" /></button></article></div>
          <div class="dashboard-grid bottom-dashboard-grid"><article class="panel recent-panel"><div class="panel-header"><div><h3>Transaksi terbaru</h3><p>Transaksi tunai dan D-PAY terbaru</p></div><button v-if="has('sales.view')" class="text-button" @click="navigate('transactions')">Lihat semua <ChevronRight :size="15" /></button></div><div v-if="recentActivity.length" class="table-wrap"><table><thead><tr><th>No. transaksi</th><th>Siswa/guru</th><th>Waktu</th><th class="text-right">Total</th><th>Status</th></tr></thead><tbody><tr v-for="item in recentActivity" :key="item.id"><td><span class="receipt-code">{{ item.receiptNo }}</span></td><td><div class="table-person"><span class="avatar avatar-soft">{{ item.studentName?.slice(0,1) }}</span><span>{{ item.studentName }}</span></div></td><td>{{ dateTime(item.createdAt) }}</td><td class="text-right table-money">{{ money(item.total) }}</td><td><span class="status-pill status-success"><Check :size="12" /> Berhasil</span></td></tr></tbody></table></div><div v-else class="empty-inline"><ShoppingCart :size="20" /><span>Transaksi baru akan tampil di sini.</span></div></article><article class="panel quick-panel"><div class="panel-header"><div><h3>Akses cepat</h3><p>Aktivitas yang sering dilakukan</p></div><Sparkles :size="17" class="quick-spark" /></div><div class="quick-actions"><button v-if="has('pos.access')" class="quick-action" @click="navigate('pos')"><span class="quick-icon quick-purple"><ScanBarcode :size="18" /></span><span><strong>Buka kasir</strong><small>Scan SKU, pilih tunai atau D-PAY</small></span><ChevronRight :size="16" /></button><button v-if="has('wallet.topup')" class="quick-action" @click="navigate('users')"><span class="quick-icon quick-green"><Wallet :size="18" /></span><span><strong>Top-up saldo siswa/guru</strong><small>Tambah saldo dompet D-PAY siswa/guru</small></span><ChevronRight :size="16" /></button><button v-if="has('products.manage')" class="quick-action" @click="openNewProduct"><span class="quick-icon quick-orange"><Package :size="18" /></span><span><strong>Tambah produk</strong><small>Daftarkan SKU baru</small></span><ChevronRight :size="16" /></button><button v-if="has('reports.view')" class="quick-action" @click="navigate('reports')"><span class="quick-icon quick-blue"><BarChart3 :size="18" /></span><span><strong>Lihat laporan</strong><small>Penjualan dan pengeluaran</small></span><ChevronRight :size="16" /></button></div></article></div>
        </section>

        <!-- POINT OF SALE -->
        <section v-else-if="currentPage==='pos'" class="pos-workspace">
          <CashierShiftOpeningPanel v-if="!activeShift" :cashier-name="user?.fullName || 'Kasir'" v-model:opening-cash="openingShiftForm.openingCash" v-model:note="openingShiftForm.note" :busy="shiftOpeningBusy" @submit="openCashierShift" />
          <template v-else>
            <div class="shift-active-banner">
              <div class="shift-live-mark"><Clock3 :size="21"/></div>
              <div class="shift-live-copy"><span class="shift-live-tag"><i></i> SHIFT AKTIF</span><strong>{{ activeShift.cashierName || user?.fullName }}</strong><small>Dibuka {{ dateTime(activeShift.openedAt) }} · Modal awal {{ money(activeShift.openingCash) }}</small></div>
              <div class="shift-live-metric"><span>Penjualan tunai</span><strong>{{ money(activeShift.cashSales) }}</strong></div>
              <div class="shift-live-metric"><span>Kas diharapkan</span><strong>{{ money(activeShift.expectedCash) }}</strong></div>
              <button class="btn btn-secondary shift-close-toggle" @click="closeShiftPanelOpen=!closeShiftPanelOpen"><LockKeyhole :size="15"/> Tutup shift</button>
            </div>
            <article v-if="closeShiftPanelOpen" class="panel shift-close-panel"><form @submit.prevent="closeCashierShift"><div><span class="modal-kicker">REKONSILIASI KAS</span><h3>Tutup shift kasir</h3><p>Hitung uang tunai fisik, lalu masukkan jumlah aktual. Sistem menghitung selisih terhadap modal + penjualan tunai − pengeluaran shift.</p></div><label>Kas fisik akhir (Rp)<input v-model.number="closingShiftForm.closingCash" type="number" min="0" max="1000000000" step="1000" required/></label><label>Catatan penutupan<input v-model="closingShiftForm.note" maxlength="240" placeholder="Alasan selisih atau catatan serah terima"/></label><div class="shift-closing-preview"><span>Kas diharapkan</span><strong>{{ money(activeShift.expectedCash) }}</strong><span>Selisih sementara</span><strong :class="{'negative-value':Number(closingShiftForm.closingCash)!==Number(activeShift.expectedCash)}">{{ money(Number(closingShiftForm.closingCash)-Number(activeShift.expectedCash)) }}</strong></div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="closeShiftPanelOpen=false">Batal</button><button class="btn btn-primary" type="submit" :disabled="shiftClosingBusy"><span v-if="shiftClosingBusy" class="spinner"></span><CheckCheck v-else :size="16"/> Konfirmasi tutup shift</button></div></form></article>
            <div class="pos-layout">
              <div class="pos-main">
                <article class="panel scan-panel"><div class="panel-header"><div><div class="step-heading"><span>01</span><div><h3>Scan SKU produk</h3><p>Pakai barcode scanner USB atau ketik SKU manual. Tekan Enter untuk menambahkan.</p></div></div></div><span class="scanner-ready"><span class="pulse-dot"></span> Scanner siap</span></div>
                  <form class="sku-entry" @submit.prevent="scanSku"><div class="sku-entry-icon"><ScanBarcode :size="23"/></div><div class="sku-entry-field"><label for="sku-scanner">SKU / barcode produk</label><input id="sku-scanner" v-model="skuInput" autocomplete="off" placeholder="Scan barcode atau ketik SKU-001" /></div><button class="btn btn-primary" type="submit"><Plus :size="17"/> Tambahkan</button></form><div class="scan-helper"><span class="helper-indicator"></span>{{ scannerMessage }}<span class="keyboard-shortcut">ENTER ↵</span></div>
                </article>
                <article class="panel cart-panel"><div class="panel-header"><div><h3>Keranjang belanja</h3><p>{{ cartQty }} item · {{ cart.length }} jenis produk</p></div><button v-if="cart.length" class="text-button text-danger" @click="clearCart"><Trash2 :size="14"/> Kosongkan</button></div>
                  <div v-if="cart.length" class="table-wrap cart-table-wrap"><table><thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th class="text-right">Subtotal</th><th></th></tr></thead><tbody><tr v-for="item in cart" :key="item.id"><td><div class="cart-product"><span class="cart-product-icon"><Package :size="17"/></span><span><strong>{{ item.name }}</strong><small>{{ item.sku }}</small></span></div></td><td>{{ money(item.price) }}</td><td><div class="qty-control"><button @click="incrementItem(item,-1)" type="button"><span>−</span></button><strong>{{ item.qty }}</strong><button @click="incrementItem(item,1)" type="button"><Plus :size="13"/></button></div></td><td class="text-right table-money">{{ money(item.price*item.qty) }}</td><td><button class="icon-only subtle-delete" @click="cart=cart.filter(line=>line.id!==item.id)" title="Hapus item"><X :size="15"/></button></td></tr></tbody></table></div>
                  <div v-else class="empty-cart"><div class="empty-cart-art"><ShoppingCart :size="30"/></div><strong>Keranjang masih kosong</strong><span>Scan SKU produk untuk memulai transaksi.</span><div class="empty-cart-samples"><span><ScanBarcode :size="13"/> SKU-001</span><span><ScanBarcode :size="13"/> SKU-002</span><span><ScanBarcode :size="13"/> SKU-003</span></div></div>
                  <div class="cart-summary" v-if="cart.length"><div><span>Jumlah item</span><strong>{{ cartQty }} pcs</strong></div><div><span>Subtotal</span><strong>{{ money(cartTotal) }}</strong></div><div class="total-row"><span>Total pembayaran</span><strong>{{ money(cartTotal) }}</strong></div></div>
                </article>
                <article v-if="lastReceipt" class="receipt-success"><div class="receipt-check"><CheckCheck :size="23"/></div><div class="receipt-copy"><strong>Pembayaran terakhir berhasil</strong><span>{{ lastReceipt.receiptNo }} · {{ lastReceipt.studentName || 'Pembeli tunai' }} · {{ dateTime(lastReceipt.createdAt) }}</span></div><div class="receipt-amount"><strong>{{ money(lastReceipt.total) }}</strong><span v-if="lastReceipt.paymentMethod==='cash'">Kembalian {{ money(lastReceipt.cashChange) }}</span><span v-else>Sisa saldo {{ money(lastReceipt.balanceAfter) }}</span></div></article>
              </div>
              <div class="pos-side">
                <article class="panel payment-panel"><div class="payment-header"><div class="payment-header-icon"><WalletCards :size="21"/></div><div><h3>Pembayaran</h3><p>Pilih metode sebelum menyelesaikan transaksi.</p></div></div>
                  <PaymentMethodSwitch :model-value="paymentMethod" @update:model-value="setPaymentMethod" />
                  <template v-if="paymentMethod==='qr_wallet'">
                    <div class="payment-step"><span>02</span><div><strong>Scan QR akun D-PAY</strong><small>Arahkan kamera HP kasir ke QR siswa/guru.</small></div></div>
                    <form class="card-entry" @submit.prevent="identifyQr"><label for="qr-scanner">QR akun siswa/guru</label><div class="qr-input-row"><div class="card-input-wrap"><QrCode :size="18"/><input id="qr-scanner" v-model="qrInput" autocomplete="off" placeholder="Scan QR atau tempel token" @input="qrAccount=null; transactionPin=''; paymentPinError=''"/></div><button class="btn btn-secondary camera-btn" type="button" @click="startQrCamera" aria-label="Buka kamera untuk scan QR"><Camera :size="17"/> Kamera</button></div><div class="card-hint"><ShieldCheck :size="14"/> QR yang dicabut atau akun nonaktif akan ditolak.</div><button class="btn btn-secondary btn-full verify-btn" type="submit" :disabled="qrVerifyBusy || !qrInput.trim()"><span v-if="qrVerifyBusy" class="spinner"></span><template v-else><CheckCircle2 :size="16"/> Verifikasi QR akun</template></button></form>
                    <div v-if="qrAccount" class="qr-account-preview"><div class="avatar avatar-green">{{ qrAccount.fullName?.slice(0,1) }}</div><div class="qr-account-info"><strong>{{ qrAccount.fullName }}</strong><span>{{ qrAccount.accountType==='teacher'?'Guru':'Siswa' }} · {{ qrAccount.studentNumber || qrAccount.className || 'Akun pelanggan' }}</span><small>Saldo D-PAY tersedia</small><b>{{ money(qrAccount.balance) }}</b></div><span class="status-pill status-success"><Check :size="12"/> Valid</span></div>
                    <div class="pin-field"><label for="transaction-pin">PIN transaksi pemilik akun</label><input id="transaction-pin" v-model="transactionPin" @input="paymentPinError=''" inputmode="numeric" type="password" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="off" placeholder="4–6 digit"/><small>Minta siswa/guru memasukkan PIN sendiri.</small><small v-if="paymentPinError" class="pin-error" role="alert">{{ paymentPinError }}</small></div>
                  </template>
                  <template v-else>
                    <div class="payment-step"><span>02</span><div><strong>Hitung pembayaran tunai</strong><small>Transaksi akan dicatat ke shift dan kas laci ini.</small></div></div>
                    <label class="cash-received-field">Uang tunai diterima (Rp)<input v-model.number="cashReceived" type="number" min="0" max="1000000000" step="1000" required placeholder="Masukkan nominal uang"/></label>
                    <div class="cash-quick-picks"><button type="button" @click="cashReceived=cartTotal">Uang pas</button><button type="button" @click="cashReceived=20000" :disabled="cartTotal>20000">Rp20.000</button><button type="button" @click="cashReceived=50000" :disabled="cartTotal>50000">Rp50.000</button><button type="button" @click="cashReceived=100000" :disabled="cartTotal>100000">Rp100.000</button></div>
                    <div class="cash-change-preview"><span>Total belanja</span><strong>{{ money(cartTotal) }}</strong><span>Kembalian</span><strong>{{ money(cashChange) }}</strong></div>
                    <div class="cash-note"><ShieldCheck :size="15"/> Pembayaran tunai tidak memotong saldo D-PAY; transaksi dan stok tetap dicatat.</div>
                  </template>
                  <div class="payment-divider"></div><div class="payment-total"><span>Total pembayaran</span><strong>{{ money(cartTotal) }}</strong></div><button class="btn btn-primary btn-full btn-lg pay-button" :disabled="checkoutBusy || !cart.length || !activeShift || (paymentMethod==='qr_wallet' && !qrAccount) || (paymentMethod==='cash' && Number(cashReceived)<cartTotal)" @click="checkout"><span v-if="checkoutBusy" class="spinner"></span><template v-else><LockKeyhole :size="17"/> {{ paymentMethod==='cash'?'Konfirmasi pembayaran tunai':'Konfirmasi pembayaran D-PAY' }} <ChevronRight :size="17"/></template></button><div class="payment-security"><Shield :size="13"/><span>Penjualan, shift, dan perubahan stok divalidasi backend.</span></div>
                </article>
                <article class="panel pos-info-panel"><div class="info-head"><div class="info-icon"><BookOpenCheck :size="17"/></div><strong>Alur transaksi</strong></div><div class="timeline-steps"><div><span class="timeline-number">1</span><p><strong>Scan SKU</strong><small>Barcode atau input manual.</small></p></div><div><span class="timeline-number">2</span><p><strong>Pilih pembayaran</strong><small>Tunai atau saldo QR D-PAY.</small></p></div><div><span class="timeline-number">3</span><p><strong>Transaksi tersimpan</strong><small>Shift, stok, dan riwayat diperbarui.</small></p></div></div></article>
              </div>
            </div>
          </template>
        </section>

        <!-- CASHIER SHIFT MANAGEMENT -->
        <section v-else-if="currentPage==='shifts'" class="content-stack">
          <div class="shift-admin-hero"><div class="shift-admin-hero-icon"><Clock3 :size="27"/></div><div><span class="modal-kicker">DMC FLOW · CASH CONTROL</span><h2>Shift kasir dan rekonsiliasi kas</h2><p>Modal awal, kasir pembuka, penjualan tunai, pengeluaran yang terhubung ke shift, dan selisih kas akhir tercatat.</p></div><div class="shift-admin-total"><span>Shift terbuka</span><strong>{{ shifts.filter(s=>s.status==='open').length }}</strong></div></div>
          <div class="metric-grid slim-metrics"><div class="metric-card mini-metric"><span class="metric-icon icon-indigo"><Clock3 :size="18"/></span><span class="metric-label">Jumlah shift</span><strong class="metric-value">{{ shifts.length }}</strong></div><div class="metric-card mini-metric"><span class="metric-icon icon-green"><Coins :size="18"/></span><span class="metric-label">Modal shift terbuka</span><strong class="metric-value">{{ money(shifts.filter(s=>s.status==='open').reduce((sum,s)=>sum+Number(s.openingCash||0),0)) }}</strong></div><div class="metric-card mini-metric"><span class="metric-icon icon-orange"><Banknote :size="18"/></span><span class="metric-label">Penjualan tunai shift terbuka</span><strong class="metric-value">{{ money(shifts.filter(s=>s.status==='open').reduce((sum,s)=>sum+Number(s.cashSales||0),0)) }}</strong></div></div>
          <article class="panel data-panel"><div class="data-panel-head"><div><h3>Riwayat shift</h3><p>Shift dibuka otomatis atas nama akun kasir yang sedang login.</p></div><button class="btn btn-secondary btn-sm" @click="loadShifts"><RefreshCw :size="14"/> Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Kasir</th><th>Waktu buka</th><th>Modal awal</th><th>Penjualan tunai</th><th>Kas diharapkan</th><th>Kas fisik akhir</th><th>Selisih</th><th>Status / aksi</th></tr></thead><tbody><tr v-for="shift in shifts" :key="shift.id"><td><div class="table-person"><span class="avatar avatar-soft">{{ shift.cashierName?.slice(0,1) }}</span><span><strong>{{ shift.cashierName }}</strong><small>{{ shift.cashierId }}</small></span></div></td><td>{{ dateTime(shift.openedAt) }}<small class="table-subline">{{ shift.openingNote || 'Tanpa catatan' }}</small></td><td class="table-money">{{ money(shift.openingCash) }}</td><td class="table-money">{{ money(shift.cashSales) }}<small class="table-subline">{{ shift.cashSaleCount }} transaksi</small></td><td class="table-money">{{ money(shift.expectedCash) }}</td><td class="table-money">{{ shift.closingCash===null?'—':money(shift.closingCash) }}</td><td><span v-if="shift.cashDifference!==null && shift.cashDifference!==undefined" class="variance-pill" :class="shift.cashDifference>0?'positive':shift.cashDifference<0?'negative':'neutral'">{{ shift.cashDifference>0?'+':'' }}{{ money(shift.cashDifference) }}</span><span v-else>—</span></td><td><div class="shift-admin-actions"><span class="status-pill" :class="shift.status==='open'?'status-warning':'status-muted'">{{ shift.status==='open'?'Terbuka':'Ditutup' }}</span><button v-if="shift.status==='open' && has('shifts.manage')" class="btn btn-secondary btn-sm" @click="prepareAdminShiftClose(shift)"><LockKeyhole :size="13"/> Tutup oleh admin</button></div></td></tr></tbody></table><div v-if="!shifts.length" class="empty-inline"><Clock3 :size="20"/><span>Belum ada shift kasir.</span></div></div></article>
        </section>

        <!-- PRODUCTS -->
        <section v-else-if="currentPage==='products'" class="content-stack"><div class="toolbar panel"><div class="search-box"><Search :size="18" /><input v-model="productSearch" placeholder="Cari nama produk, SKU, kategori…" /></div><div class="toolbar-meta"><span><Package :size="15" /> {{ products.length }} produk</span><button class="btn btn-secondary btn-sm" @click="loadProducts"><RefreshCw :size="14" /> Refresh</button><button class="btn btn-secondary btn-sm" @click="exportProductSkuXlsx"><Download :size="14" /> Excel SKU</button><button class="btn btn-secondary btn-sm" @click="exportProductBarcodePdf"><QrCode :size="14" /> PDF Barcode</button></div></div><div class="panel data-panel"><div class="data-panel-head"><div><h3>Daftar produk</h3><p>Kelola SKU, harga jual, dan ketersediaan stok.</p></div><span class="data-count">{{ products.filter(p=>p.active).length }} aktif</span></div><div class="table-wrap"><table><thead><tr><th>Produk</th><th>SKU / Barcode</th><th>Kategori</th><th>Harga jual</th><th>Stok</th><th>Status</th><th v-if="has('products.manage')">Aksi</th></tr></thead><tbody><tr v-for="product in products" :key="product.id"><td><div class="product-cell"><span class="product-list-icon"><Package :size="17" /></span><span><strong>{{ product.name }}</strong><small>Satuan: {{ product.unit }}</small></span></div></td><td><span class="sku-code">{{ product.sku }}</span></td><td><span class="category-pill">{{ product.category }}</span></td><td class="table-money">{{ money(product.price) }}</td><td><div class="stock-cell"><strong :class="{ 'stock-low':product.stock<=product.lowStockThreshold }">{{ product.stock }}</strong><div class="stock-track"><span :style="{width:`${Math.min(100, product.stock/Math.max(product.stock, product.lowStockThreshold*3, 1)*100)}%`}" :class="{ low:product.stock<=product.lowStockThreshold }"></span></div></div></td><td><span class="status-pill" :class="product.active?'status-success':'status-muted'"><span class="status-dot"></span>{{ product.active?'Aktif':'Nonaktif' }}</span></td><td v-if="has('products.manage')"><div class="row-actions"><button class="icon-only" @click="openRestock(product)" title="Restok produk"><Plus :size="15" /></button><button class="icon-only" @click="openEditProduct(product)" title="Edit produk"><Pencil :size="15" /></button><button v-if="product.active" class="icon-only action-delete" @click="deactivateProduct(product)" title="Nonaktifkan"><Trash2 :size="15" /></button></div></td></tr></tbody></table><div v-if="!products.length" class="empty-inline"><Package :size="20" /><span>Produk belum tersedia atau tidak ditemukan.</span></div></div></div><div class="info-callout"><ShieldCheck :size="18"/><p><strong>SKU adalah identitas produk.</strong> SKU sebaiknya unik dan tidak berubah setelah digunakan dalam transaksi. Produk dinonaktifkan tanpa menghapus riwayat penjualannya.</p></div></section>

        <!-- ACCOUNT & QR MANAGEMENT -->
        <section v-else-if="currentPage==='users'" class="content-stack"><div class="user-stats-grid"><div class="mini-stat"><div class="mini-stat-icon blue"><Users :size="18" /></div><div><span>Total akun</span><strong>{{ users.length }}</strong></div></div><div class="mini-stat"><div class="mini-stat-icon green"><QrCode :size="18" /></div><div><span>QR aktif</span><strong>{{ users.filter(u=>u.qrToken && u.qrStatus==='active').length }}</strong></div></div><div class="mini-stat"><div class="mini-stat-icon orange"><Wallet :size="18" /></div><div><span>Total saldo siswa/guru</span><strong>{{ money(users.filter(u=>u.roleKey==='pelanggan').reduce((s,u)=>s+Number(u.balance||0),0)) }}</strong></div></div></div>
          <div class="toolbar panel"><div class="search-box"><Search :size="18"/><input v-model="userSearch" placeholder="Cari nama, email, NIS/NIP, atau QR…"/></div><div class="toolbar-meta"><span><Users :size="15"/> {{ users.length }} akun</span></div></div>
          <div class="panel data-panel"><div class="data-panel-head"><div><h3>Akun siswa, guru, dan petugas</h3><p>QR dibuat otomatis untuk akun siswa/guru. Saldo tersimpan di server.</p></div><span class="permission-tag"><LockKeyhole :size="13"/> Data terlindungi</span></div><div class="table-wrap"><table><thead><tr><th>Pengguna</th><th>Role</th><th>Jenis / NIS-NIP / kelas</th><th>QR akun</th><th>Saldo</th><th>Status</th><th>Aksi</th></tr></thead><tbody><tr v-for="account in users" :key="account.id"><td><div class="table-person"><span class="avatar avatar-soft">{{ account.fullName?.slice(0,1) }}</span><span><strong>{{ account.fullName }}</strong><small>{{ account.email }}</small></span></div></td><td><span class="role-pill" :class="`role-${account.roleKey}`"><component :is="roleIcon(account.roleKey)" :size="12"/> {{ account.roleName }}</span></td><td><div class="student-data"><strong>{{ account.accountType==='teacher'?'Guru':account.accountType==='student'?'Siswa':'Petugas' }} · {{ account.studentNumber || '—' }}</strong><small>{{ account.className || '—' }}</small></div></td><td><button v-if="account.qrToken && account.qrStatus==='active'" class="link-button" @click="showQr(account)"><QrCode :size="14"/> Lihat QR</button><span v-else class="muted-text">{{ account.qrStatus==='revoked'?'QR dicabut':'—' }}</span><div v-if="account.qrStatus==='revoked'" class="blocked-note">QR dicabut</div></td><td class="table-money">{{ money(account.balance) }}</td><td><span class="status-pill" :class="account.status==='active'?'status-success':'status-muted'"><span class="status-dot"></span>{{ account.status==='active'?'Aktif':'Ditangguhkan' }}</span></td><td><div class="row-actions"><button v-if="account.roleKey==='pelanggan' && has('wallet.topup') && account.status==='active'" class="icon-only topup-action" :disabled="topupSubmitting || userActionBusyId===account.id" @click="openTopup(account)" title="Top-up saldo" aria-label="Top-up saldo"><Wallet :size="15"/></button><button v-if="account.roleKey==='pelanggan' && has('users.manage')" class="icon-only" :disabled="userActionBusyId===account.id" @click="rotateQr(account)" title="Terbitkan QR baru" aria-label="Terbitkan QR baru"><RefreshCw :size="15"/></button><button v-if="account.qrToken && account.qrStatus==='active' && has('users.manage')" class="icon-only action-delete" :disabled="userActionBusyId===account.id" @click="revokeQr(account)" title="Cabut QR" aria-label="Cabut QR"><LockKeyhole :size="15"/></button><button v-if="has('users.manage') && account.id!==user?.id" class="icon-only" :disabled="userActionBusyId===account.id" @click="toggleUserStatus(account)" :title="account.status==='active'?'Nonaktifkan akun':'Aktifkan akun'"><LockKeyhole v-if="account.status==='active'" :size="15"/><CheckCircle2 v-else :size="15"/></button><button v-if="has('users.manage') && account.id!==user?.id" class="icon-only" :disabled="userActionBusyId===account.id" title="Edit nama & username" @click="openUserProfileEditor(account)"><Pencil :size="15"/></button><button v-if="has('users.manage') && account.id!==user?.id" class="icon-only" :disabled="userActionBusyId===account.id" title="Reset kata sandi" @click="resetUserPassword(account)"><RotateCcw :size="15"/></button><button v-if="has('roles.manage') && account.id!==user?.id" class="icon-only" :disabled="userActionBusyId===account.id" title="Ubah role" @click="changeUserRole(account)"><UserCog :size="15"/></button><button v-if="has('users.manage') && account.id!==user?.id" class="icon-only action-delete" :disabled="userActionBusyId===account.id" title="Nonaktifkan akun" @click="deleteUser(account)"><Trash2 :size="15"/></button></div></td></tr></tbody></table><div v-if="!users.length" class="empty-inline"><Users :size="20"/><span>Belum ada akun yang cocok dengan pencarian.</span></div></div></div><div class="info-callout"><QrCode :size="18"/><p><strong>QR adalah identitas, bukan penyimpan saldo.</strong> QR yang tersebar dapat dicabut dan diterbitkan ulang. Pembayaran tetap memerlukan PIN transaksi untuk mengurangi risiko penyalahgunaan foto QR.</p></div></section>

        <!-- TRANSACTIONS -->
        <section v-else-if="currentPage==='transactions'" class="content-stack"><div class="metric-grid slim-metrics"><div class="metric-card mini-metric"><span class="metric-icon icon-indigo"><ShoppingCart :size="18"/></span><span class="metric-label">Total penjualan</span><strong class="metric-value">{{ money(sales.reduce((sum,s)=>sum+Number(s.total),0)) }}</strong><small>{{ sales.length }} transaksi pada periode</small></div><div class="metric-card mini-metric"><span class="metric-icon icon-green"><CheckCircle2 :size="18"/></span><span class="metric-label">Pembayaran berhasil</span><strong class="metric-value">{{ sales.length }}</strong><small>Transaksi tersimpan</small></div><div class="metric-card mini-metric"><span class="metric-icon icon-blue"><QrCode :size="18"/></span><span class="metric-label">Metode pembayaran</span><strong class="metric-value">Tunai + D-PAY</strong><small>Metode tercatat per transaksi</small></div></div><div class="toolbar panel"><div class="search-box"><Search :size="18"/><input v-model="salesSearch" placeholder="Cari nomor transaksi, siswa/guru, atau QR…"/></div><div class="toolbar-meta"><button class="btn btn-secondary btn-sm" @click="exportTransactions"><Download :size="14"/> Ekspor CSV</button></div></div><div class="panel data-panel"><div class="data-panel-head"><div><h3>Riwayat transaksi</h3><p>Catatan transaksi hanya berisi pembayaran yang berhasil di-commit database.</p></div><span class="data-count">{{ sales.filter(s=>!salesSearch || `${s.receiptNo} ${s.studentName} ${s.cashierName}`.toLowerCase().includes(salesSearch.toLowerCase())).length }} transaksi</span></div><div class="table-wrap"><table><thead><tr><th>Nomor transaksi</th><th>Siswa/guru</th><th>Kasir</th><th>Rincian</th><th>Waktu</th><th class="text-right">Total</th><th>Status</th></tr></thead><tbody><tr v-for="sale in sales.filter(s=>!salesSearch || `${s.receiptNo} ${s.studentName} ${s.cashierName}`.toLowerCase().includes(salesSearch.toLowerCase()))" :key="sale.id"><td><span class="receipt-code">{{ sale.receiptNo }}</span><small class="table-subline">{{ sale.paymentMethod === 'cash' ? 'Pembayaran tunai' : 'Pembayaran D-PAY' }}</small></td><td><div class="table-person"><span class="avatar avatar-soft">{{ sale.studentName?.slice(0,1) }}</span><span>{{ sale.studentName }}</span></div></td><td>{{ sale.cashierName }}</td><td><details class="items-details"><summary>{{ sale.items?.length || 0 }} jenis barang <ChevronDown :size="13"/></summary><div class="details-items"><div v-for="item in sale.items" :key="item.sku"><span>{{ item.name }} × {{ item.qty }}</span><strong>{{ money(item.subtotal) }}</strong></div></div></details></td><td>{{ dateTime(sale.createdAt) }}</td><td class="text-right table-money">{{ money(sale.total) }}</td><td><span class="status-pill status-success"><Check :size="12"/> Berhasil</span></td></tr></tbody></table><div v-if="!sales.length" class="empty-inline"><History :size="20"/><span>Riwayat akan muncul setelah transaksi berhasil.</span></div></div></div></section>

        <!-- EXPENSES -->
        <section v-else-if="currentPage==='expenses'" class="finance-layout"><article v-if="has('expenses.manage')" class="panel entry-panel"><div class="panel-header"><div><h3>Catat pengeluaran</h3><p>Tambahkan biaya operasional kantin.</p></div><div class="entry-icon expense-entry-icon"><ArrowDownRight :size="20"/></div></div><form class="stack-form" @submit.prevent="saveExpense"><label>Kategori<select v-model="expenseForm.category"><option>Operasional</option><option>Bahan baku</option><option>Peralatan</option><option>Listrik & air</option><option>Kebersihan</option><option>Transportasi</option><option>Lainnya</option></select></label><label>Deskripsi<input v-model="expenseForm.description" required minlength="2" maxlength="240" placeholder="Contoh: belanja bahan untuk besok"/></label><label>Nominal (Rp)<input v-model.number="expenseForm.amount" type="number" min="1" step="1000" required placeholder="150000"/></label><button class="btn btn-primary btn-full" type="submit"><Plus :size="16"/> Simpan pengeluaran</button></form><div class="entry-note"><ShieldCheck :size="14"/> Semua perubahan tercatat di audit log.</div></article><article class="panel expense-list-panel"><div class="panel-header"><div><h3>Pengeluaran operasional</h3><p>Daftar biaya yang tercatat pada periode ini.</p></div><span class="expense-total-chip">{{ money(expenses.reduce((sum,e)=>sum+Number(e.amount),0)) }}</span></div><div v-if="expenses.length" class="expense-list"><div v-for="expense in expenses" :key="expense.id" class="expense-row"><div class="expense-category-icon"><ArrowDownRight :size="17"/></div><div class="expense-row-main"><strong>{{ expense.description }}</strong><span>{{ expense.category }} · {{ dateTime(expense.createdAt) }}</span><small>Dicatat oleh {{ expense.recordedBy }}</small></div><strong class="expense-amount">−{{ money(expense.amount) }}</strong></div></div><div v-else class="empty-state"><div class="empty-state-icon warm"><ArrowDownRight :size="23"/></div><strong>Belum ada pengeluaran</strong><span>Catatan pengeluaran baru akan tampil di sini.</span></div><div class="expense-bottom-note"><span>PERIODE</span><strong>{{ period==='day'?'Hari ini':period==='week'?'7 hari terakhir':'30 hari terakhir' }}</strong><span class="bottom-note-spacer"></span><span>{{ expenses.length }} catatan</span></div></article></section>

        <!-- REPORTS -->
        <section v-else-if="currentPage==='reports'" class="content-stack"><div class="report-hero"><div><span class="report-hero-kicker"><BarChart3 :size="14"/> LAPORAN OPERASIONAL</span><h2>Angka yang jelas.<br/><span>Keputusan lebih baik.</span></h2><p>Ringkasan penjualan, top-up saldo, pengeluaran, dan stok opname berdasarkan periode yang dipilih.</p></div><div class="report-hero-icon"><FileText :size="52"/></div></div><div class="report-summary-grid"><div class="report-summary-card"><span class="report-card-icon sales-card"><TrendingUp :size="19"/></span><span>Penjualan (revenue)</span><strong>{{ money(reportData?.summary?.sales) }}</strong><small>{{ reportData?.summary?.salesCount || 0 }} transaksi berhasil</small></div><div class="report-summary-card"><span class="report-card-icon topup-card"><Wallet :size="19"/></span><span>Top-up saldo siswa/guru</span><strong>{{ money(reportData?.summary?.topups) }}</strong><small>{{ reportData?.summary?.topupCount || 0 }} top-up tercatat</small></div><div class="report-summary-card"><span class="report-card-icon expense-card"><ArrowDownRight :size="19"/></span><span>Pengeluaran operasional</span><strong>{{ money(reportData?.summary?.expenses) }}</strong><small>{{ reportData?.summary?.expenseCount || 0 }} biaya tercatat</small></div><div class="report-summary-card"><span class="report-card-icon net-card"><ArrowLeftRight :size="19"/></span><span>Penjualan − pengeluaran</span><strong :class="{'negative-value':(reportData?.summary?.netOperational||0)<0}">{{ money(reportData?.summary?.netOperational) }}</strong><small>Saldo operasional, belum dikurangi modal barang</small></div></div><div class="report-note"><CircleAlert :size="18"/><p><strong>Catatan akuntansi:</strong> penjualan dicatat saat siswa/guru memakai saldo untuk membeli barang. Top-up ditampilkan terpisah sebagai penerimaan kas sekaligus kewajiban saldo pelanggan, sehingga tidak dijumlahkan lagi ke revenue penjualan. Arus kas sederhana = top-up − pengeluaran.</p></div><div class="panel data-panel"><div class="data-panel-head"><div><h3>Penjualan per hari</h3><p>Rangkuman transaksi yang berhasil diproses.</p></div><button class="btn btn-secondary btn-sm" @click="exportReport"><Download :size="14"/> Ekspor CSV</button></div><div v-if="reportData?.daily?.length" class="daily-report-chart"><div v-for="row in reportData.daily" :key="row.day" class="daily-report-row"><span>{{ shortDate(row.day) }}</span><div class="daily-report-track"><span :style="{width:`${Math.max(1, row.sales/Math.max(...reportData.daily.map((r:any)=>r.sales),1)*100)}%`}"></span></div><strong>{{ money(row.sales) }}</strong><small>{{ row.transactions }} trx</small></div></div><div v-else class="empty-inline"><BarChart3 :size="20"/><span>Belum ada data penjualan pada periode ini.</span></div></div><div class="report-footnote"><ShieldCheck :size="15"/> Laporan bersumber dari transaksi yang sudah tersimpan dalam database. Periode dihitung mundur dari waktu server.</div></section>

        <!-- STOCK OPNAME -->
        <section v-else-if="currentPage==='stock'" class="content-stack"><div class="stock-intro"><div class="stock-intro-icon"><Boxes :size="24"/></div><div><h2>Periksa stok fisik.</h2><p>Catat jumlah barang yang benar-benar ada. Sistem akan menyimpan selisih dan menyesuaikan stok aktif sesuai hasil hitung.</p></div></div><div class="stock-workspace"><article v-if="has('stock.manage')" class="panel entry-panel stock-entry-panel"><div class="panel-header"><div><h3>Catat stok opname</h3><p>Hitung fisik dan simpan hasilnya.</p></div><div class="entry-icon stock-entry-icon"><ClipboardList :size="20"/></div></div><form class="stack-form" @submit.prevent="saveOpname"><label>Produk / SKU<select v-model="opnameForm.sku" required><option value="" disabled>Pilih produk</option><option v-for="product in products.filter(p=>p.active)" :key="product.id" :value="product.sku">{{ product.sku }} — {{ product.name }} (sistem: {{ product.stock }})</option></select></label><div v-if="selectedProduct" class="system-stock-hint"><span>Stok sistem saat ini</span><strong>{{ selectedProduct.stock }} {{ selectedProduct.unit }}</strong></div><label>Stok fisik terhitung<input v-model.number="opnameForm.actualStock" type="number" min="0" max="10000000" required placeholder="Masukkan hasil hitung"/></label><div v-if="selectedProduct" class="variance-preview" :class="{'variance-negative':opnameForm.actualStock-selectedProduct.stock<0,'variance-positive':opnameForm.actualStock-selectedProduct.stock>0}"><span>Selisih sementara</span><strong>{{ opnameForm.actualStock-selectedProduct.stock>0?'+':'' }}{{ opnameForm.actualStock-selectedProduct.stock }}</strong></div><label>Catatan (opsional)<textarea v-model="opnameForm.note" rows="3" placeholder="Contoh: 2 pcs rusak / hasil hitung shift siang"></textarea></label><button class="btn btn-primary btn-full" type="submit"><CheckCheck :size="16"/> Simpan hasil opname</button></form><div class="entry-note"><ShieldCheck :size="14"/> Penyesuaian stok dan catatan tersimpan dalam satu transaksi.</div></article><article class="panel opname-history-panel"><div class="panel-header"><div><h3>Riwayat stok opname</h3><p>Catatan hitung fisik untuk periode ini.</p></div><span class="data-count">{{ opnames.length }} catatan</span></div><div v-if="opnames.length" class="table-wrap"><table><thead><tr><th>Produk</th><th>Stok sistem</th><th>Fisik</th><th>Selisih</th><th>Waktu</th></tr></thead><tbody><tr v-for="record in opnames" :key="record.id"><td><div class="product-cell"><span class="product-list-icon"><Package :size="16"/></span><span><strong>{{ record.name }}</strong><small>{{ record.sku }}</small></span></div></td><td>{{ record.systemStock }}</td><td><strong>{{ record.actualStock }}</strong></td><td><span class="variance-pill" :class="record.difference>0?'positive':record.difference<0?'negative':'neutral'">{{ record.difference>0?'+':'' }}{{ record.difference }}</span></td><td>{{ dateTime(record.createdAt) }}</td></tr></tbody></table></div><div v-else class="empty-state"><div class="empty-state-icon cool"><ClipboardList :size="22"/></div><strong>Belum ada catatan</strong><span>Hasil hitung stok akan terekam di sini.</span></div></article></div></section>

        <!-- ROLE & ACCESS -->
        <section v-else-if="currentPage==='roles'" class="content-stack"><div class="rbac-banner"><div class="rbac-banner-icon"><ShieldCheck :size="28"/></div><div><span>ZERO TRUST · ROLE BASED ACCESS</span><h2>Setiap akses harus punya izin.</h2><p>Perubahan berlaku pada request API berikutnya. Menu tersembunyi di UI bukan pengganti pemeriksaan izin di server.</p></div><div class="rbac-lock"><LockKeyhole :size="28"/></div></div><div class="rbac-layout"><article class="panel roles-list-panel"><div class="panel-header"><div><h3>Role aplikasi</h3><p>Pilih role untuk mengatur izin.</p></div></div><button v-for="role in roles" :key="role.id" class="role-choice" :class="{selected:selectedRoleId===role.id}" @click="selectedRoleId=role.id"><span class="role-choice-icon" :class="`role-icon-${role.roleKey}`"><component :is="roleIcon(role.roleKey)" :size="18"/></span><span class="role-choice-copy"><strong>{{ role.name }}</strong><small>{{ role.roleKey }} · {{ role.userCount }} akun</small></span><ChevronRight :size="16"/></button><div class="roles-list-note"><Shield :size="14"/> {{ roles.length }} role tersedia</div></article><article class="panel permissions-panel"><div class="permissions-panel-head"><div><div class="selected-role-tag"><ShieldCheck :size="13"/> ROLE DIPILIH</div><h3>{{ selectedRole?.name || 'Pilih role' }}</h3><p>{{ selectedRole?.description || 'Pilih role dari daftar untuk melihat izin.' }}</p></div><span v-if="selectedRole?.roleKey==='superadmin'" class="system-role-pill"><LockKeyhole :size="12"/> System protected</span><span v-else class="permission-count">{{ rolePermissionDraft.length }} izin aktif</span></div><div v-if="selectedRole?.roleKey==='superadmin'" class="superadmin-notice"><ShieldCheck :size="18"/><p><strong>Super Admin memiliki akses penuh.</strong><br/>Untuk menjaga agar sistem tidak terkunci, izin role Super Admin tidak dapat dikurangi melalui editor ini.</p></div><div v-for="(group,groupName) in permissionGroups" :key="groupName" class="permission-group"><div class="permission-group-heading"><h4>{{ groupName }}</h4><span>{{ group.filter((p:any)=>rolePermissionDraft.includes(p.code)).length }}/{{ group.length }} aktif</span></div><label v-for="permission in group" :key="permission.code" class="permission-row" :class="{checked:rolePermissionDraft.includes(permission.code)}"><span class="custom-checkbox" :class="{on:rolePermissionDraft.includes(permission.code)}"><Check v-if="rolePermissionDraft.includes(permission.code)" :size="13"/></span><input type="checkbox" :checked="rolePermissionDraft.includes(permission.code)" :disabled="selectedRole?.roleKey==='superadmin'" @change="togglePermission(permission.code,($event.target as HTMLInputElement).checked)"/><span class="permission-copy"><strong>{{ permission.label }}</strong><small>{{ permission.description }}</small></span><code>{{ permission.code }}</code></label></div><div class="permission-actions"><span><LockKeyhole :size="14"/> Deny by default</span><button v-if="selectedRole?.roleKey!=='superadmin'" class="btn btn-primary" @click="saveRolePermissions"><Check :size="16"/> Simpan izin</button><button v-else class="btn btn-secondary" disabled><ShieldCheck :size="16"/> Proteksi sistem</button></div></article></div><div class="security-principles"><div><div class="principle-icon"><Fingerprint :size="19"/></div><strong>Verifikasi setiap request</strong><p>JWT dan status akun diperiksa setiap request terproteksi.</p></div><div><div class="principle-icon"><KeyRound :size="19"/></div><strong>Izin dari server</strong><p>Role dan permission dibaca dari database, bukan hanya klaim browser.</p></div><div><div class="principle-icon"><FileClock :size="19"/></div><strong>Jejak audit</strong><p>Perubahan role dan aksi penting dicatat dalam audit log.</p></div></div></section>

        <!-- AUDIT -->
        <section v-else-if="currentPage==='audit'" class="content-stack"><div class="info-callout"><ShieldCheck :size="18"/><p><strong>Audit trail.</strong> Catatan ini mendokumentasikan aktivitas penting untuk mendukung pelacakan perubahan akses dan operasi keuangan.</p></div><div class="panel data-panel"><div class="data-panel-head"><div><h3>Aktivitas sistem</h3><p>Log aksi sensitif dan request yang mengubah data.</p></div><span class="data-count">{{ auditLogs.length }} catatan terbaru</span></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Resource</th><th>Detail</th><th>Alamat IP</th></tr></thead><tbody><tr v-for="log in auditLogs" :key="log.id"><td>{{ dateTime(log.createdAt) }}</td><td>{{ log.actor || 'System' }}</td><td><code class="audit-action">{{ log.action }}</code></td><td>{{ log.resource }}<small class="table-subline">{{ log.resourceId || '—' }}</small></td><td><code class="audit-detail">{{ JSON.stringify(log.detail || {}) }}</code></td><td>{{ log.ip || '—' }}</td></tr></tbody></table><div v-if="!auditLogs.length" class="empty-inline"><FileClock :size="20"/><span>Belum ada aktivitas yang tercatat.</span></div></div></div></section>

        <!-- STUDENT WALLET -->
        <section v-else-if="currentPage==='my-wallet'" class="student-wallet-page"><div class="student-welcome"><div><span>AREA AKUN</span><h2>Hai, {{ user.fullName.split(' ')[0] }} 👋</h2><p>Saldo tersimpan aman di server. Tunjukkan QR ini di kasir dan masukkan PIN transaksi saat membayar.</p></div><div class="student-illustration"><Wallet :size="40"/></div></div><div class="wallet-hero-card"><div class="wallet-card-top"><span><Wallet :size="16"/> D-PAY WALLET</span><span class="wallet-card-status"><span></span> ACTIVE</span></div><small>SALDO TERSEDIA</small><strong>{{ money(wallet.balance) }}</strong><div class="wallet-card-bottom"><div><span>PEMILIK AKUN</span><strong>{{ user.fullName }}</strong></div><div><span>JENIS AKUN</span><strong>{{ user.accountType==='teacher'?'GURU':'SISWA' }}</strong></div><div class="wallet-card-mark"><QrCode :size="30"/></div></div></div><div class="student-wallet-grid"><article class="panel wallet-activity-panel"><div class="panel-header"><div><h3>Aktivitas saldo</h3><p>Top-up dan pembayaran terakhir.</p></div><button class="text-button" @click="navigate('my-history')">Riwayat lengkap <ChevronRight :size="15"/></button></div><div v-if="walletTransactions.length" class="wallet-activity-list"><div v-for="tx in walletTransactions.slice(0,6)" :key="tx.id" class="wallet-activity-row"><div class="wallet-tx-icon" :class="tx.direction==='in'?'tx-in':'tx-out'"><ArrowDownLeft v-if="tx.direction==='in'" :size="17"/><ShoppingCart v-else :size="16"/></div><div><strong>{{ tx.type==='topup'?'Top-up saldo':tx.type==='payment'?'Pembelian kantin':tx.type==='refund'?'Pengembalian saldo':'Penyesuaian saldo' }}</strong><span>{{ tx.note || tx.receiptNo || 'Aktivitas saldo' }} · {{ dateTime(tx.createdAt) }}</span></div><strong :class="tx.direction==='in'?'amount-in':'amount-out'">{{ tx.direction==='in'?'+':'−' }}{{ money(tx.amount) }}</strong></div></div><div v-else class="empty-state"><div class="empty-state-icon cool"><Wallet :size="22"/></div><strong>Belum ada aktivitas</strong><span>Aktivitas saldo akan muncul di sini.</span></div></article><article class="panel student-card-panel qr-wallet-panel"><div class="panel-header"><div><h3>QR akun pribadi</h3><p>Tunjukkan QR ini ke kamera HP kasir.</p></div><QrCode :size="20"/></div><div v-if="walletQrImage" class="wallet-qr-image"><img :src="walletQrImage" alt="QR akun D-Pay"/><strong>{{ user.fullName }}</strong><span>{{ wallet.qrStatus==='active'?'QR aktif':'QR tidak aktif — hubungi admin' }}</span><button class="btn btn-secondary btn-sm" @click="qrPreview={fullName:user.fullName,qrToken:wallet.qrToken}; qrPreviewImage=walletQrImage; qrPreviewOpen=true"><Eye :size="14"/> Perbesar QR</button></div><div v-else class="card-not-linked"><CircleAlert :size="16"/><span>QR belum tersedia. Hubungi admin kantin.</span></div><div class="card-tip"><ShieldCheck :size="15"/><p>Jangan unggah atau bagikan QR dan PIN transaksi. Jika QR tersebar, minta admin mencabut dan menerbitkan ulang.</p></div></article></div><div class="student-wallet-note"><LockKeyhole :size="17"/><span>QR tidak berisi saldo. Saldo dan semua mutasi hanya dapat diubah oleh sistem yang berwenang.</span></div></section>

        <!-- STUDENT HISTORY -->
        <section v-else-if="currentPage==='my-history'" class="content-stack"><div class="wallet-balance-banner"><div class="balance-icon"><Wallet :size="21"/></div><div><span>SALDO SEKARANG</span><strong>{{ money(wallet.balance) }}</strong></div><div class="balance-card-id"><QrCode :size="17"/><span>QR akun aktif</span></div></div><article class="panel data-panel"><div class="data-panel-head"><div><h3>Riwayat pembelian</h3><p>Daftar transaksi kantin yang terhubung ke akunmu.</p></div><span class="data-count">{{ ownSales.length }} transaksi</span></div><div class="table-wrap"><table><thead><tr><th>No. transaksi</th><th>Barang yang dibeli</th><th>Kasir</th><th>Waktu</th><th class="text-right">Total</th><th>Status</th></tr></thead><tbody><tr v-for="sale in ownSales" :key="sale.id"><td><span class="receipt-code">{{ sale.receiptNo }}</span></td><td><div class="history-items"><span v-for="item in sale.items" :key="item.sku">{{ item.name }} × {{ item.qty }}</span></div></td><td>{{ sale.cashierName }}</td><td>{{ dateTime(sale.createdAt) }}</td><td class="text-right table-money">{{ money(sale.total) }}</td><td><span class="status-pill status-success"><Check :size="12"/> Berhasil</span></td></tr></tbody></table><div v-if="!ownSales.length" class="empty-state"><div class="empty-state-icon cool"><History :size="22"/></div><strong>Belum ada riwayat pembelian</strong><span>Setelah kamu berbelanja di kantin, transaksinya tampil di sini.</span></div></div></article><article class="panel wallet-ledger-panel"><div class="panel-header"><div><h3>Mutasi saldo</h3><p>Semua penambahan dan pemakaian saldo.</p></div></div><div class="wallet-activity-list"><div v-for="tx in walletTransactions" :key="tx.id" class="wallet-activity-row"><div class="wallet-tx-icon" :class="tx.direction==='in'?'tx-in':'tx-out'"><ArrowDownLeft v-if="tx.direction==='in'" :size="17"/><ShoppingCart v-else :size="16"/></div><div><strong>{{ tx.type==='topup'?'Top-up saldo':tx.type==='payment'?'Pembayaran kantin':'Aktivitas saldo' }}</strong><span>{{ tx.note || tx.receiptNo || '—' }} · {{ dateTime(tx.createdAt) }}</span></div><strong :class="tx.direction==='in'?'amount-in':'amount-out'">{{ tx.direction==='in'?'+':'−' }}{{ money(tx.amount) }}</strong></div></div></article></section>

        <footer class="app-footer"><div><span class="footer-logo"><ShoppingBag :size="14"/></span><strong>DMC FLOW</strong><span class="footer-separator">·</span><span>D-PAY school wallet</span></div><div><span class="footer-security"><ShieldCheck :size="14"/> Zero Trust protected</span><span>v1.0.2</span></div></footer>
      </div>
    </main>

    <!-- QR CAMERA SCANNER -->
    <div v-if="cameraOpen" class="modal-backdrop qr-camera-backdrop" @click.self="stopQrCamera"><section class="modal-card qr-camera-card"><div class="modal-header"><div><span class="modal-kicker">SCAN IDENTITAS</span><h2>Scan QR siswa/guru</h2><p>Arahkan QR akun ke kotak kamera. Jangan scan QR dari sumber yang tidak dikenal.</p></div><button class="icon-only" type="button" @click="stopQrCamera"><X :size="19"/></button></div><div class="camera-frame"><video ref="qrVideo" autoplay muted playsinline></video><span class="camera-corner tl"></span><span class="camera-corner tr"></span><span class="camera-corner bl"></span><span class="camera-corner br"></span></div><div v-if="cameraError" class="form-error"><CircleAlert :size="16"/>{{ cameraError }}</div><div class="camera-note"><ShieldCheck :size="15"/> Pembayaran tetap memerlukan PIN transaksi.</div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="stopQrCamera">Tutup kamera</button></div></section></div>
    <!-- ACCOUNT QR PREVIEW -->
    <div v-if="qrPreviewOpen && qrPreview" class="modal-backdrop" @click.self="qrPreviewOpen=false"><section class="modal-card qr-preview-card"><div class="modal-header"><div><span class="modal-kicker">D-PAY ACCOUNT QR</span><h2>QR akun</h2><p>QR hanya berisi token acak, bukan nama atau saldo.</p></div><button class="icon-only" type="button" @click="qrPreviewOpen=false"><X :size="19"/></button></div><div class="qr-preview-body"><img :src="qrPreviewImage" :alt="`QR akun ${qrPreview.fullName}`"/><strong>{{ qrPreview.fullName }}</strong><span>{{ qrPreview.accountType==='teacher'?'Guru':qrPreview.accountType==='student'?'Siswa':'Akun' }} · {{ qrPreview.qrStatus==='revoked'?'QR dicabut':'QR aktif' }}</span><code>{{ qrPreview.email || qrPreview.studentNumber || 'D-Pay' }}</code></div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="qrPreviewOpen=false">Tutup</button><button class="btn btn-primary" type="button" @click="downloadQr"><Download :size="16"/> Unduh PNG</button></div></section></div>

    <!-- ADMIN SHIFT CLOSE MODAL -->
    <div v-if="adminShiftCloseTarget" class="modal-backdrop" @click.self="adminShiftCloseTarget=null">
      <form class="modal-card shift-admin-modal" @submit.prevent="submitAdminShiftClose">
        <div class="modal-header"><div><span class="modal-kicker">ADMINISTRASI KAS</span><h2>Tutup shift atas nama admin</h2><p>Nama kasir dan semua transaksi shift tetap tersimpan. Catat kas fisik yang sudah diverifikasi.</p></div><button class="icon-only" type="button" @click="adminShiftCloseTarget=null"><X :size="19"/></button></div>
        <div class="shift-admin-summary"><span>Kasir</span><strong>{{ adminShiftCloseTarget.cashierName }}</strong><span>Modal awal</span><strong>{{ money(adminShiftCloseTarget.openingCash) }}</strong><span>Kas diharapkan</span><strong>{{ money(adminShiftCloseTarget.expectedCash) }}</strong></div>
        <label class="shift-form-label">Kas fisik akhir (Rp)<input v-model.number="adminShiftCloseForm.closingCash" type="number" min="0" max="1000000000" step="1000" required/></label>
        <label class="shift-form-label">Alasan / catatan admin<input v-model="adminShiftCloseForm.note" required maxlength="240"/></label>
        <div class="modal-actions"><button class="btn btn-secondary" type="button" @click="adminShiftCloseTarget=null">Batal</button><button class="btn btn-primary" type="submit" :disabled="adminShiftClosingBusy"><span v-if="adminShiftClosingBusy" class="spinner"></span><LockKeyhole v-else :size="16"/> Konfirmasi penutupan</button></div>
      </form>
    </div>

    <!-- PRODUCT MODAL -->
    <div v-if="productFormOpen" class="modal-backdrop" @click.self="productFormOpen=false"><form class="modal-card" @submit.prevent="saveProduct"><div class="modal-header"><div><span class="modal-kicker">KATALOG PRODUK</span><h2>{{ productEditId?'Edit produk':'Tambah produk' }}</h2><p>Pastikan SKU sama dengan barcode yang akan dipindai.</p></div><button class="icon-only" type="button" @click="productFormOpen=false"><X :size="19"/></button></div><div class="modal-form-grid"><label>SKU / Barcode<input v-model="productForm.sku" required maxlength="100" placeholder="SKU-011"/></label><label>Nama produk<input v-model="productForm.name" required minlength="2" placeholder="Nama makanan/minuman"/></label><label>Kategori<select v-model="productForm.category"><option>Makanan</option><option>Minuman</option><option>Camilan</option><option>Perlengkapan</option><option>Lainnya</option></select></label><label>Satuan<input v-model="productForm.unit" required placeholder="pcs / botol / cup"/></label><label>Harga jual (Rp)<input v-model.number="productForm.price" type="number" min="0" required/></label><label>Stok awal / stok saat ini<input v-model.number="productForm.stock" type="number" min="0" required :disabled="!!productEditId"/><small v-if="productEditId">Gunakan menu Stok Opname untuk mengubah stok agar tercatat.</small></label><label>Ambang stok rendah<input v-model.number="productForm.lowStockThreshold" type="number" min="0" required/></label></div><label class="checkbox-line"><input v-model="productForm.active" type="checkbox"/> Produk aktif dan bisa dijual</label><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="productFormOpen=false">Batal</button><button class="btn btn-primary" type="submit"><Check :size="16"/> {{ productEditId?'Simpan perubahan':'Simpan produk' }}</button></div></form></div>
    <!-- RESTOCK MODAL -->
    <div v-if="restockTarget" class="modal-backdrop" @click.self="restockTarget=null"><form class="modal-card" @submit.prevent="submitRestock"><div class="modal-header"><div><span class="modal-kicker">RESTOK PRODUK</span><h2>Tambah stok {{ restockTarget.name }}</h2><p>Penambahan stok dicatat ke riwayat inventori dan bisa dipantau di audit log.</p></div><button class="icon-only" type="button" @click="restockTarget=null"><X :size="19"/></button></div><div class="modal-form-grid"><label>Jumlah restok<input v-model.number="restockForm.quantity" type="number" min="1" max="10000000" required/></label><label>Catatan (opsional)<textarea v-model="restockForm.note" rows="3" maxlength="240" placeholder="Contoh: Restok dari supplier A / tambah stok harian"></textarea></label><div class="system-stock-hint"><span>Stok saat ini</span><strong>{{ restockTarget.stock }} {{ restockTarget.unit }}</strong></div><div class="variance-preview variance-positive"><span>Stok setelah restok</span><strong>{{ restockTarget.stock + Number(restockForm.quantity || 0) }} {{ restockTarget.unit }}</strong></div></div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="restockTarget=null">Batal</button><button class="btn btn-primary" type="submit"><Plus :size="16"/> Simpan restok</button></div></form></div>
    <!-- USER MODAL -->
    <div v-if="userFormOpen" class="modal-backdrop" @click.self="userFormOpen=false"><form class="modal-card" @submit.prevent="createUser"><div class="modal-header"><div><span class="modal-kicker">AKUN BARU</span><h2>Buat akun D-Pay</h2><p>QR unik dibuat otomatis untuk akun siswa/guru. PIN dipakai untuk konfirmasi pembayaran.</p></div><button class="icon-only" type="button" @click="userFormOpen=false"><X :size="19"/></button></div><div class="modal-form-grid"><label>Nama lengkap<input v-model="userForm.fullName" required minlength="2" placeholder="Nama siswa/guru"/></label><label>Email login<input v-model="userForm.email" type="email" required placeholder="nama@sekolah.sch.id"/></label><label>Kata sandi awal<input v-model="userForm.password" type="password" required minlength="8" placeholder="Minimal 8 karakter"/></label><label>Role<select v-model="userForm.roleKey"><option value="pelanggan">Pelanggan (siswa/guru)</option><option value="kasir">Kasir</option><option v-if="user?.roleKey==='superadmin'" value="admin">Admin</option><option v-if="user?.roleKey==='superadmin'" value="superadmin">Super Admin</option></select></label><template v-if="userForm.roleKey==='pelanggan'"><label>Jenis akun<select v-model="userForm.accountType"><option value="student">Siswa</option><option value="teacher">Guru</option></select></label><label>{{ userForm.accountType==='teacher'?'NIP / nomor pegawai':'NIS / nomor induk' }}<input v-model="userForm.studentNumber" placeholder="Opsional"/></label><label>{{ userForm.accountType==='teacher'?'Unit / jabatan':'Kelas' }}<input v-model="userForm.className" placeholder="Contoh: VIII-A"/></label><label>PIN transaksi (4–6 digit)<input v-model="userForm.transactionPin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required autocomplete="new-password"/><small>Jangan gunakan PIN yang mudah ditebak.</small></label></template><label v-else>PIN transaksi awal (4–6 digit)<input v-model="userForm.transactionPin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required/></label></div><div class="modal-note"><ShieldCheck :size="15"/> Kata sandi dan PIN disimpan dalam bentuk hash; QR tidak memuat nama atau saldo.</div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="userFormOpen=false">Batal</button><button class="btn btn-primary" type="submit" :disabled="userSubmitting"><UserPlus :size="16"/> {{ userSubmitting ? 'Menyimpan…' : 'Buat akun' }}</button></div></form></div>
    <div v-if="userProfileEditor" class="modal-backdrop" @click.self="userProfileEditor=null"><form class="modal-card" @submit.prevent="saveUserProfileEditor"><div class="modal-header"><div><span class="modal-kicker">EDIT AKUN</span><h2>Ubah data akun</h2><p>Perbarui nama, username/email, kata sandi, dan role sesuai kebutuhan operasi.</p></div><button class="icon-only" type="button" @click="userProfileEditor=null"><X :size="19"/></button></div><div class="modal-form-grid"><label>Nama lengkap<input v-model="userProfileForm.fullName" required minlength="2" maxlength="140" placeholder="Nama lengkap"/></label><label>Username / email login<input v-model="userProfileForm.email" type="email" required maxlength="190" placeholder="nama@sekolah.sch.id"/></label><label>Kata sandi baru (opsional)<input v-model="userProfileForm.password" type="password" minlength="8" maxlength="100" placeholder="Kosongkan bila tidak ingin mengganti"/></label><label>Role<select v-model="userProfileForm.roleKey"><option value="pelanggan">Pelanggan</option><option value="kasir">Kasir</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></label></div><div class="modal-note"><ShieldCheck :size="15"/> Perubahan role mengikuti izin admin/super admin yang berlaku di server.</div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="userProfileEditor=null">Batal</button><button class="btn btn-primary" type="submit"><Check :size="16"/> Simpan perubahan</button></div></form></div>
    <!-- TOPUP MODAL -->
    <div v-if="topupTarget" class="modal-backdrop" @click.self="topupTarget=null"><form class="modal-card topup-modal" @submit.prevent="submitTopup"><div class="modal-header"><div><span class="modal-kicker">WALLET SERVICE</span><h2>Top-up saldo siswa/guru</h2><p>Saldo bertambah dan mutasi top-up tercatat dalam ledger.</p></div><button class="icon-only" type="button" @click="topupTarget=null"><X :size="19"/></button></div><div class="topup-target-card"><div class="avatar avatar-green">{{ topupTarget.fullName?.slice(0,1) }}</div><div><strong>{{ topupTarget.fullName }}</strong><span>{{ topupTarget.studentNumber || topupTarget.email }}</span></div><div class="topup-balance"><small>SALDO SAAT INI</small><strong>{{ money(topupTarget.balance) }}</strong></div></div><label class="topup-amount-label">Nominal top-up</label><div class="amount-quick-picks"><button v-for="amount in [10000,20000,50000,100000]" :key="amount" type="button" :class="{active:Number(topupForm.amount)===amount}" @click="topupForm.amount=amount">{{ money(amount) }}</button></div><label class="topup-custom-label">Nominal lainnya (Rp)<input v-model.number="topupForm.amount" type="number" min="1000" max="1000000000" step="1000" required/></label><label class="topup-custom-label">Catatan<input v-model="topupForm.note" required maxlength="240"/></label><div class="topup-result"><span>Saldo setelah top-up</span><strong>{{ money(Number(topupTarget.balance||0)+Number(topupForm.amount||0)) }}</strong></div><div class="modal-actions"><button class="btn btn-secondary" type="button" @click="topupTarget=null">Batal</button><button class="btn btn-primary" type="submit" :disabled="topupSubmitting"><Wallet :size="16"/> {{ topupSubmitting ? 'Memproses…' : 'Konfirmasi top-up' }}</button></div></form></div>
    <Transition name="toast"><div v-if="toast" class="toast-message" :class="`toast-${toast.kind}`"><CheckCircle2 v-if="toast.kind==='success'" :size="19"/><CircleAlert v-else-if="toast.kind==='error'" :size="19"/><Activity v-else :size="19"/><span>{{ toast.message }}</span><button class="icon-only" @click="toast=null"><X :size="15"/></button></div></Transition>
  </div>
</template>

