import { useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { api } from './api.js'
import { todayFortaleza } from './format.js'
import { Modal, SearchableSelect } from './components.jsx'
import { formatMoneyInput, moneyInputFromValue, moneyInputToNumber, sanitizeMoneyInput } from './moneyInput.js'

export default function LancamentoModal({ item, catalogs, onClose, onSaved }) {
  const today = todayFortaleza()
  const [form, setForm] = useState(() => {
    const sedeId = item?.sedeId || catalogs.sedes[0]?.id || ''
    const primeiroCentro = catalogs.centrosCusto.find((centro) => String(centro.sedeId) === String(sedeId))
    return {
      dataPagamento: item?.dataPagamento || today, sedeId,
      centroCustoId: item?.centroCustoId || primeiroCentro?.id || '', grupoContaId: item?.grupoContaId || '',
      contaId: item?.contaId || '', observacao: item?.observacao || '',
    }
  })
  const [valueDigits, setValueDigits] = useState(moneyInputFromValue(item?.valor))
  const replaceValueOnType = useRef(Boolean(item))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selectedSite = useMemo(() => catalogs.sedes.find((sede) => String(sede.id) === String(form.sedeId)), [catalogs.sedes, form.sedeId])
  const groups = useMemo(() => catalogs.gruposContas.filter((grupo) => grupo.catalogo === selectedSite?.catalogoContas), [catalogs.gruposContas, selectedSite])
  const accounts = useMemo(() => catalogs.contas.filter((conta) => conta.catalogo === selectedSite?.catalogoContas && String(conta.grupoContaId) === String(form.grupoContaId)), [catalogs.contas, form.grupoContaId, selectedSite])
  const costCenters = useMemo(() => catalogs.centrosCusto.filter((centro) => String(centro.sedeId) === String(form.sedeId)), [catalogs.centrosCusto, form.sedeId])
  const change = (key, value) => setForm((current) => {
    if (key === 'sedeId') {
      const primeiroCentro = catalogs.centrosCusto.find((centro) => String(centro.sedeId) === String(value))
      return { ...current, sedeId: value, centroCustoId: primeiroCentro?.id || '', grupoContaId: '', contaId: '' }
    }
    return { ...current, [key]: value, ...(key === 'grupoContaId' ? { contaId: '' } : {}) }
  })

  function valueKeyDown(event) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      setValueDigits((current) => sanitizeMoneyInput(replaceValueOnType.current ? event.key : `${current}${event.key}`))
      replaceValueOnType.current = false
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault(); replaceValueOnType.current = false
      setValueDigits((current) => event.key === 'Delete' ? '' : current.slice(0, -1))
    }
  }

  function pasteValue(event) {
    event.preventDefault()
    setValueDigits(sanitizeMoneyInput(event.clipboardData.getData('text')))
    replaceValueOnType.current = false
  }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('')
    const valor = moneyInputToNumber(valueDigits)
    if (valor <= 0) { setError('Informe um valor maior que zero.'); setLoading(false); return }
    if (form.dataPagamento > today) { setError('A data de pagamento não pode ser futura.'); setLoading(false); return }
    try {
      const path = item ? `/api/lancamentos/${item.numeroLancamento}` : '/api/lancamentos'
      const saved = await api(path, { method: item ? 'PUT' : 'POST', body: JSON.stringify({ ...form, valor }) })
      onSaved(saved, Boolean(item))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <Modal title={item ? `Editar lançamento #${item.numeroLancamento}` : 'Novo lançamento'} subtitle={item ? 'As alterações ficarão registradas na auditoria.' : 'Preencha os dados da despesa para registrar.'} onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="modal-body form-grid">
        {item && <div className="auto-info full"><div><span>Data do lançamento</span><strong>{item.dataLancamento}</strong></div><div><span>Hora</span><strong>{item.hora}</strong></div><div><span>Colaborador</span><strong>{item.colaborador}</strong></div></div>}
        <label>Data de pagamento<input required type="date" max={today} value={form.dataPagamento} onChange={(event) => change('dataPagamento', event.target.value)}/></label>
        <label>Sede<select required value={form.sedeId} onChange={(event) => change('sedeId', event.target.value)}><option value="">Selecione</option>{catalogs.sedes.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
        <label>Centro de custo<select required value={form.centroCustoId} onChange={(event) => change('centroCustoId', event.target.value)} disabled={!form.sedeId}><option value="">Selecione</option>{costCenters.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
        <label>Grupo de contas<SearchableSelect options={groups} value={form.grupoContaId} onChange={(value) => change('grupoContaId', value)} disabled={!form.sedeId} placeholder="Digite o código ou nome do grupo"/></label>
        <label>Conta<SearchableSelect options={accounts} value={form.contaId} onChange={(value) => change('contaId', value)} disabled={!form.grupoContaId} placeholder={form.grupoContaId ? 'Digite o código ou nome da conta' : 'Escolha o grupo primeiro'}/></label>
        <label>Valor (R$)<input required className="currency-entry" type="text" inputMode="numeric" value={formatMoneyInput(valueDigits)} onFocus={() => { replaceValueOnType.current = Boolean(valueDigits) }} onKeyDown={valueKeyDown} onPaste={pasteValue} onChange={() => undefined} placeholder="0,00" autoComplete="off"/></label>
        <label className="full">Observação<textarea rows="4" maxLength="2000" value={form.observacao} onChange={(event) => change('observacao', event.target.value)} placeholder="Inclua detalhes que ajudem a identificar o lançamento."/></label>
        {error && <div className="form-error full">{error}</div>}
      </div>
      <footer className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={loading}><Save size={18}/>{loading ? 'Salvando...' : 'Salvar lançamento'}</button></footer>
    </form>
  </Modal>
}
