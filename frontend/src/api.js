const RAW_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').trim()
const API_URL = /^https?:\/\//i.test(RAW_URL) ? RAW_URL.replace(/\/$/, '') : `https://${RAW_URL.replace(/\/$/, '')}`

export function getToken() { return sessionStorage.getItem('lancamentos_token') || '' }
export function setToken(token) { token ? sessionStorage.setItem('lancamentos_token', token) : sessionStorage.removeItem('lancamentos_token') }

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) setToken('')
    throw new Error(data?.message || 'Não foi possível comunicar com o servidor.')
  }
  return data
}

export function qs(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, value) })
  const text = params.toString()
  return text ? `?${text}` : ''
}
