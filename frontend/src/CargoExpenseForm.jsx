import { useRef, useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from './api.js'
import { currency } from './format.js'
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

const CARGO_SITE_NAMES = new Set(['Ômega Barroso', 'Ômega Cariri', 'Ômega Matriz'])

const decimalValue = (value) => {
  const parsed = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const percentText = (value, base) => {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return '—'
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format((value / base) * 100)}%`
}

function MoneyField({ label, value, onChange, disabled = false }) {
  const replaceOnType = useRef(Boolean(value))
  return <label>{label}<input className="currency-entry" type="text" inputMode="numeric" value={formatMoneyInput(value)}
    disabled={disabled}
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

export default function CargoExpenseForm({ cargo, catalogs, initial, numeroLancamento, onBack, onSaved, readOnly = false }) {
  const launch = initial?.lancamento || initial
  const expense = initial?.despesaCarga || initial
  const cargoSites = numeroLancamento ? catalogs.sedes : catalogs.sedes.filter((site) => CARGO_SITE_NAMES.has(site.nome))
  const initialSede = launch?.sedeId || cargoSites[0]?.id || ''
  const [form, setForm] = useState({
    dataSaida: launch?.dataSaida || '',
    dataChegada: launch?.dataChegada || '',
    sedeId: initialSede,
    kmPorLitro: expense?.kmPorLitro ?? '', kmInicial: expense?.kmInicial ?? '', kmFinal: expense?.kmFinal ?? '',
    observacao: launch?.observacao || '',
  })
  const [money, setMoney] = useState(() => Object.fromEntries([
    ['valorCombustivel', moneyInputFromValue(expense?.valorCombustivel)],
    ...ADDITIONAL.map(([key]) => [key, moneyInputFromValue(expense?.[key])]),
  ]))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const totalPercorrido = Math.max(0, decimalValue(form.kmFinal) - decimalValue(form.kmInicial))
  const kmPorLitro = decimalValue(form.kmPorLitro)
  const valorCombustivel = moneyInputToNumber(money.valorCombustivel)
  const despesaCombustivel = kmPorLitro > 0 ? Math.round(((totalPercorrido / kmPorLitro) * valorCombustivel) * 100) / 100 : 0
  const totalAdicionais = ADDITIONAL.reduce((sum, [key]) => sum + moneyInputToNumber(money[key]), 0)
  const totalFichaViagem = Math.round(ADDITIONAL
    .filter(([key]) => key !== 'salarioFuncionarios')
    .reduce((sum, [key]) => sum + moneyInputToNumber(money[key]), 0) * 100) / 100
  const totalDespesas = Math.round((despesaCombustivel + totalAdicionais) * 100) / 100
  const lucroCarga = Number(cargo?.totais?.lucro ?? expense?.lucroCarga ?? 0)
  const lucroFinal = Math.round((lucroCarga - totalDespesas) * 100) / 100
  const vendaCarga = Number(cargo?.totais?.valor ?? expense?.resumoCarga?.totais?.valor ?? 0)
  const percentualLucro = percentText(lucroFinal, vendaCarga)
  const percentualDespesaVenda = percentText(totalDespesas, vendaCarga)
  const percentualDespesaLucroFinal = percentText(totalDespesas, lucroFinal)

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault(); setError('')
    if (readOnly) return
    if (form.dataChegada < form.dataSaida) return setError('A data de chegada não pode ser anterior à data de saída.')
    if (kmPorLitro <= 0) return setError('Informe um valor de Km/L maior que zero.')
    if (decimalValue(form.kmFinal) < decimalValue(form.kmInicial)) return setError('O Km final não pode ser menor que o Km inicial.')
    if (totalDespesas <= 0) return setError('O total das despesas deve ser maior que zero.')
    setLoading(true)
    try {
      const body = {
        ...form, kmPorLitro, kmInicial: decimalValue(form.kmInicial), kmFinal: decimalValue(form.kmFinal),
        valorCombustivel, ...Object.fromEntries(ADDITIONAL.map(([key]) => [key, moneyInputToNumber(money[key])])),
      }
      const result = await api(numeroLancamento ? `/api/lancamentos-cargas/${numeroLancamento}` : `/api/lancamentos-cargas/carga/${cargo.numeroCarga}`, {
        method: numeroLancamento ? 'PUT' : 'POST', body: JSON.stringify(body),
      })
      onSaved(result, Boolean(numeroLancamento))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <form onSubmit={submit} className="cargo-expense-form">
    <div className="modal-body form-grid">
      {readOnly && <div className="readonly-notice full">Consulta somente leitura. Apenas o colaborador que criou este lançamento ou um perfil administrativo pode alterá-lo.</div>}
      <div className="auto-info full cargo-expense-context"><div><span>Carga</span><strong>#{cargo?.numeroCarga || expense?.numeroCarga}</strong></div><div><span>Centro de custo</span><strong>Cargas</strong></div><div><span>Grupo / conta</span><strong>Despesas de Carga</strong></div><div><span>Lucro Bruto</span><strong>{currency(lucroCarga)}</strong></div></div>
      <label>Data de saída<input required type="date" value={form.dataSaida} disabled={readOnly} onChange={(event) => change('dataSaida', event.target.value)}/></label>
      <label>Sede<select required value={form.sedeId} disabled={readOnly} onChange={(event) => change('sedeId', event.target.value)}><option value="">Selecione</option>{cargoSites.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label>Data de chegada<input required type="date" value={form.dataChegada} disabled={readOnly} onChange={(event) => change('dataChegada', event.target.value)}/></label>
      <label>Km/L<input required type="text" inputMode="decimal" value={form.kmPorLitro} disabled={readOnly} onChange={(event) => change('kmPorLitro', event.target.value.replace(/[^0-9,.]/g, ''))} placeholder="Ex.: 8,5"/></label>
      <MoneyField label="Valor do combustível" value={money.valorCombustivel} disabled={readOnly} onChange={(value) => setMoney((current) => ({ ...current, valorCombustivel: value }))}/>
      <label>Km inicial<input required type="text" inputMode="decimal" value={form.kmInicial} disabled={readOnly} onChange={(event) => change('kmInicial', event.target.value.replace(/[^0-9,.]/g, ''))}/></label>
      <label>Km final<input required type="text" inputMode="decimal" value={form.kmFinal} disabled={readOnly} onChange={(event) => change('kmFinal', event.target.value.replace(/[^0-9,.]/g, ''))}/></label>
      <div className="calculated-field"><span>Total percorrido</span><strong>{totalPercorrido.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km</strong></div>
      <div className="calculated-field"><span>Despesa com combustível</span><strong>{currency(despesaCombustivel)}</strong></div>
      <div className="form-section-title full">Despesas adicionais</div>
      {ADDITIONAL.map(([key, label]) => <MoneyField key={key} label={label} value={money[key]} disabled={readOnly} onChange={(value) => setMoney((current) => ({ ...current, [key]: value }))}/>)}
      <div className="calculated-field cargo-trip-sheet-total full"><span>Total de despesa da ficha de viagem</span><strong>{currency(totalFichaViagem)}</strong><small>Não considera combustível nem salário de funcionários.</small></div>
      <div className="cargo-expense-totals full"><div><span>Total das despesas</span><strong>{currency(totalDespesas)}</strong><div className="cargo-expense-percentages"><small>{percentualDespesaVenda} da venda total</small><small>{percentualDespesaLucroFinal} do Lucro Líquido</small></div></div><div className={lucroFinal < 0 ? 'negative' : 'positive'}><span>Lucro Líquido</span><strong>{currency(lucroFinal)} <small>({percentualLucro})</small></strong></div></div>
      <label className="full">Observação<textarea rows="4" maxLength="2000" value={form.observacao} disabled={readOnly} onChange={(event) => change('observacao', event.target.value)} placeholder="Inclua detalhes da despesa da carga."/></label>
      {error && <div className="form-error full">{error}</div>}
    </div>
    <footer className="modal-footer"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/> {readOnly ? 'Fechar' : 'Voltar'}</button>{!readOnly && <button className="primary" disabled={loading}><Save size={18}/>{loading ? 'Salvando...' : numeroLancamento ? 'Salvar alterações' : 'Salvar despesa da carga'}</button>}</footer>
  </form>
}
