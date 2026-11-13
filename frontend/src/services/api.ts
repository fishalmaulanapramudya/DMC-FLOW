const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

function resolveApiBase(): string {
  if (typeof window === 'undefined') return configuredApiBase
  // A phone's localhost means the phone itself. If a local dev env accidentally points
  // to localhost:8000 while the page is opened through a LAN IP, prefer the Vite/reverse
  // proxy at /api instead of calling the phone's own localhost.
  try {
    const target = new URL(configuredApiBase, window.location.origin)
    const isLoopback = (host: string) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase())
    const pageIsLoopback = isLoopback(window.location.hostname)
    if (/^https?:\/\//i.test(configuredApiBase) && isLoopback(target.hostname) && !pageIsLoopback) return '/api'
  } catch {
    // Keep the configured base; fetch will display a connection diagnostic if it is invalid.
  }
  return configuredApiBase
}

const API_BASE = resolveApiBase()

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('dpay_token')
  const headers = new Headers(options.headers || {})
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { ...options, headers })
  } catch (error) {
    if (error instanceof TypeError && typeof window !== 'undefined') {
      throw new Error('Tidak dapat menghubungi API DMC FLOW. Pastikan backend aktif, HP dan komputer berada di Wi-Fi yang sama, buka frontend memakai IP komputer (contoh http://192.168.1.10:5173), dan gunakan VITE_API_BASE_URL=/api. Periksa juga firewall komputer.')
    }
    throw error
  }
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new ApiError(typeof body === 'object' && body?.error ? body.error : `Request gagal (${response.status})`, response.status, body)
  return body as T
}

export const get = <T = any>(path: string) => api<T>(path)
export const post = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })
