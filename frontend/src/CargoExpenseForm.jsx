import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from './api.js'
import { currency, todayFortaleza } from './format.js'
import { formatMoneyInput, moneyInputFromValue, moneyInputToNumber, sanitizeMoneyInput } from './moneyInput.js'

const ADDITIONAL = [
  ['salarioFuncionarios', 'Salário de funcionários'],
  ['diariasMotoristas', 'Diárias de motoristas'],
  ['diariasAjudantes', 'Diárias de ajudantes'],
  ['descarrego', 'Descarrego'],
  ['avarias', 'Avarias'],
  ['alimentacao', 'Alimentação'],
  ['ajudanteExtra', 'Ajudante extra'],
  ['manutencaoVeiculo', 'Manutenção de veículo'],
  ['outros', 'Outros'],
]

const decimalValue = (value) => {
  const parsed = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function MoneyField({ label, value, onChange }) {
  const replaceOnType = useRef(Boolean(value))
  return <label>{label}<input className="currency-entry" type="text" inputMode="numeric" value={formatMoneyInput(value)}
    onFocus={() => { replaceOnType.current = Boolean(value) }}
    onKeyDown={(event) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault(); onChange(sanitizeMoneyInput(replaceOnType.current ? event.key : `${value}${event.key}`)); replaceOnType.current = false
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault(); replaceOnType.current = false; onChange(event.key === 'Delete' ? '' : value.slice(0, -1))
      }
    }}
    onPaste={(event) => { event.preventDefault(); onChange(sanitizeMoneyInput(event.clipboardData.getData('text'))); replaceOnType.current = false }}
    onChange={() => undefined} placeholder="0,00" autoComplete="off"/></label>
}

export default function CargoExpenseForm({ cargo, catalogs, initial, numeroLancamento, onBack, onSaved }) {
  const today = todayFortaleza()
  const launch = initial?.lancamento
  const expense = initial?.despesaCarga
  const initialSede = launch?.sedeId || catalogs.sedes[0]?.id || ''
  const [form, setForm] = useState({
    dataPagamento: launch?.dataPagamento || today,
    sedeId: initialSede,
    centroCustoId: launch?.centroCustoId || catalogs.centrosCusto.find((item) => String(item.sedeId) === String(initialSede))?.id || '',
    kmPorLitro: expense?.kmPorLitro ?? '', kmInicial: expense?.kmInicial ?? '', kmFinal: expense?.kmFinal ?? '',
    observacao: launch?.observacao || '',
  })
  const [money, setMoney] = useState(() => Object.fromEntries([
    ['valorCombustivel', moneyInputFromValue(expense?.valorCombustivel)],
    ...ADDITIONAL.map(([key]) => [key, moneyInputFromValue(expense?.[key])]),
  ]))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const centers = useMemo(() => catalogs.centrosCusto.filter((item) => String(item.sedeId) === String(form.sedeId)), [catalogs.centrosCusto, form.sedeId])
  const totalPercorrido = Math.max(0, decimalValue(form.kmFinal) - decimalValue(form.kmInicial))
  const kmPorLitro = decimalValue(form.kmPorLitro)
  const valorCombustivel = moneyInputToNumber(money.valorCombustivel)
  const despesaCombustivel = kmPorLitro > 0 ? Math.round(((totalPercorrido / kmPorLitro) * valorCombustivel) * 100) / 100 : 0
  const totalAdicionais = ADDITIONAL.reduce((sum, [key]) => sum + moneyInputToNumber(money[key]), 0)
  const totalDespesas = Math.round((despesaCombustivel + totalAdicionais) * 100) / 100
  const lucroCarga = Number(cargo?.totais?.lucro ?? expense?.lucroCarga ?? 0)
  const lucroFinal = Math.round((lucroCarga - totalDespesas) * 100) / 100

  function change(key, value) {
    setForm((current) => {
      if (key !== 'sedeId') return { ...current, [key]: value }
      const first = catalogs.centrosCusto.find((item) => String(item.sedeId) === String(value))
      return { ...current, sedeId: value, centroCustoId: first?.id || '' }
    })
  }

  async function submit(event) {
    event.preventDefault(); setError('')
    if (form.dataPagamento > today) return setError('A data de pagamento não pode ser futura.')
    if (kmPorLitro <= 0) return setError('Informe um valor de Km/L maior que zero.')
    if (decimalValue(form.kmFinal) < decimalValue(form.kmInicial)) return setError('O Km final não pode ser menor que o Km inicial.')
    if (totalDespesas <= 0) return setError('O total das despesas deve ser maior que zero.')
    setLoading(true)
    try {
      const body = {
        ...form, kmPorLitro, kmInicial: decimalValue(form.kmInicial), kmFinal: decimalValue(form.kmFinal),
        valorCombustivel, ...Object.fromEntries(ADDITIONAL.map(([key]) => [key, moneyInputToNumber(money[key])])),
      }
      const result = await api(numeroLancamento ? `/api/lancamentos/${numeroLancamento}/carga` : `/api/lancamentos/carga/${cargo.numeroCarga}`, {
        method: numeroLancamento ? 'PUT' : 'POST', body: JSON.stringify(body),
      })
      onSaved(result, Boolean(numeroLancamento))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <form onSubmit={submit} className="cargo-expense-form">
    <div className="modal-body form-grid">
      <div className="auto-info full cargo-expense-context"><div><span>Carga</span><strong>#{cargo?.numeroCarga || expense?.numeroCarga}</strong></div><div><span>Grupo / conta</span><strong>Despesas de Carga</strong></div><div><span>Lucro da carga</span><strong>{currency(lucroCarga)}</strong></div></div>
      <label>Data de pagamento<input required type="date" max={today} value={form.dataPagamento} onChange={(event) => change('dataPagamento', event.target.value)}/></label>
      <label>Sede<select required value={form.sedeId} onChange={(event) => change('sedeId', event.target.value)}><option value="">Selecione</option>{catalogs.sedes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label>Centro de custo<select required value={form.centroCustoId} onChange={(event) => change('centroCustoId', event.target.value)}><option value="">Selecione</option>{centers.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label>Km/L<input required type="text" inputMode="decimal" value={form.kmPorLitro} onChange={(event) => change('kmPorLitro', event.target.value.replace(/[^0-9,.]/g, ''))} placeholder="Ex.: 8,5"/></label>
      <MoneyField label="Valor do combustível" value={money.valorCombustivel} onChange={(value) => setMoney((current) => ({ ...current, valorCombustivel: value }))}/>
      <label>Km inicial<input required type="text" inputMode="decimal" value={form.kmInicial} onChange={(event) => change('kmInicial', event.target.value.replace(/[^0-9,.]/g, ''))}/></label>
      <label>Km final<input required type="text" inputMode="decimal" value={form.kmFinal} onChange={(event) => change('kmFinal', event.target.value.replace(/[^0-9,.]/g, ''))}/></label>
      <div className="calculated-field"><span>Total percorrido</span><strong>{totalPercorrido.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km</strong></div>
      <div className="calculated-field"><span>Despesa com combustível</span><strong>{currency(despesaCombustivel)}</strong></div>
      <div className="form-section-title full">Despesas adicionais</div>
      {ADDITIONAL.map(([key, label]) => <MoneyField key={key} label={label} value={money[key]} onChange={(value) => setMoney((current) => ({ ...current, [key]: value }))}/>)}
      <div className="cargo-expense-totals full"><div><span>Total das despesas</span><strong>{currency(totalDespesas)}</strong></div><div className={lucroFinal < 0 ? 'negative' : 'positive'}><span>Lucro após despesas</span><strong>{currency(lucroFinal)}</strong></div></div>
      <label className="full">Observação<textarea rows="4" maxLength="2000" value={form.observacao} onChange={(event) => change('observacao', event.target.value)} placeholder="Inclua detalhes da despesa da carga."/></label>
      {error && <div className="form-error full">{error}</div>}
    </div>
    <footer className="modal-footer"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</button><button className="primary" disabled={loading}><Save size={18}/>{loading ? 'Salvando...' : numeroLancamento ? 'Salvar alterações' : 'Salvar despesa da carga'}</button></footer>
  </form>
}
