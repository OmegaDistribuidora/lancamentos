function integerDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 12)
  return digits.replace(/^0+(?=\d)/, '')
}

export function sanitizeMoneyInput(value) {
  const raw = String(value || '').replace(/[^\d,.]/g, '')
  const comma = raw.lastIndexOf(',')
  const dots = [...raw.matchAll(/\./g)]
  const separator = comma >= 0 ? comma : dots.length === 1 ? dots[0].index : -1
  if (separator < 0) return integerDigits(raw)
  const integer = integerDigits(raw.slice(0, separator)) || '0'
  const cents = raw.slice(separator + 1).replace(/\D/g, '').slice(0, 2)
  return `${integer},${cents}`
}

export function moneyInputFromValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2).replace('.', ',') : ''
}

export function moneyInputToNumber(value) {
  const normalized = sanitizeMoneyInput(value)
  if (!normalized) return 0
  const parsed = Number(normalized.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function formatMoneyInput(value) {
  if (!value) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(moneyInputToNumber(value))
}
