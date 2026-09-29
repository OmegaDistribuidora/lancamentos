export const currency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
export const number = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0))
export const shortDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00-03:00`)) : '—'
export const dateTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value)) : '—'
export function todayFortaleza() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export const monthLabel = (month) => {
  const raw = String(month ?? '')
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!match) return raw
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12))
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '')
}
export const profileLabel = (profile) => ({ ADMIN: 'Administrador', GERENTE_ADMINISTRATIVO: 'Gerente administrativo', DIRETORIA: 'Diretoria', USUARIO: 'Usuário' }[profile] || profile)

export const periodOptions = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'mes_atual', label: 'Mês atual' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: 'ano_atual', label: 'Ano atual' },
  { value: 'personalizado', label: 'Personalizado' },
]

export const dashboardPeriodOptions = [
  ...periodOptions.slice(0, 4),
  { value: 'ultimos_6_meses', label: 'Últimos 6 meses' },
  ...periodOptions.slice(4),
]

function isoDate(date) { return date.toISOString().slice(0, 10) }

export function periodRange(period, custom = {}) {
  const today = new Date(`${todayFortaleza()}T12:00:00Z`)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const startMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const endMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  if (period === 'personalizado') return { inicio: custom.inicio || '', fim: custom.fim || '' }
  if (period === 'hoje') return { inicio: isoDate(today), fim: isoDate(today) }
  if (period === 'ontem') { const date = new Date(today); date.setUTCDate(date.getUTCDate() - 1); return { inicio: isoDate(date), fim: isoDate(date) } }
  if (period === 'mes_anterior') { const date = new Date(Date.UTC(year, month - 1, 1)); return { inicio: isoDate(startMonth(date)), fim: isoDate(endMonth(date)) } }
  if (period === 'ano_atual') return { inicio: `${year}-01-01`, fim: `${year}-12-31` }
  if (period === 'ultimos_6_meses') { const date = new Date(Date.UTC(year, month - 5, 1)); return { inicio: isoDate(date), fim: isoDate(endMonth(today)) } }
  return { inicio: isoDate(startMonth(today)), fim: isoDate(endMonth(today)) }
}
