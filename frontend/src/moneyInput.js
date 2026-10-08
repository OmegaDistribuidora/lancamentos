export function sanitizeMoneyInput(value) {
  return String(value || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 14)
}

export function moneyInputFromValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.round(parsed * 100)) : ''
}

export function moneyInputToNumber(value) {
  const digits = sanitizeMoneyInput(value)
  return digits ? Number(digits) / 100 : 0
}

export function formatMoneyInput(value) {
  if (!value) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(moneyInputToNumber(value))
}
