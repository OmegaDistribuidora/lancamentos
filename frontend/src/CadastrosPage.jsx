import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Layers3, Save, Search } from 'lucide-react'
import { api, qs } from './api.js'
import { currency, todayFortaleza } from './format.js'
import { Loading } from './components.jsx'

function BudgetRow({ item, onSave }) {
  const [value, setValue] = useState(item.orcamento)
  const [saving, setSaving] = useState(false)
  const sourceMonth = item.competenciaOrigem ? `${item.competenciaOrigem.slice(5, 7)}/${item.competenciaOrigem.slice(0, 4)}` : ''
  const origin = item.definidoNaCompetencia ? 'Definido neste mês' : sourceMonth ? `Repetido de ${sourceMonth}` : 'Valor padrão'
  useEffect(() => { setValue(item.orcamento) }, [item.orcamento])
  async function save() {
    setSaving(true)
    try { await onSave(item, value) } finally { setSaving(false) }
  }
  return <div className="budget-row">
    <span><strong>{item.codigo}</strong>{item.nome}<small>{item.grupoConta} · <em>{origin}</em></small></span>
    <div className="budget-input"><span>R$</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save() }}/><button className="icon-button" onClick={save} disabled={saving} title="Salvar orçamento"><Save size={16}/></button></div>
  </div>
}

export default function CadastrosPage({ notify, onChanged }) {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [filter, setFilter] = useState({ competencia: todayFortaleza().slice(0, 7), sedeId: '' })
  const load = useCallback(async () => {
    try {
      const result = await api(`/api/orcamentos${qs(filter)}`)
      setData(result)
      if (!filter.sedeId) setFilter((current) => ({ ...current, sedeId: String(result.sedeId) }))
    } catch (error) { notify(error.message, 'error') }
  }, [filter, notify])
  useEffect(() => { void load() }, [load])

  const selectedGroup = useMemo(() => {
    if (!data) return null
    return data.gruposContas.find((item) => String(item.id) === String(selectedGroupId)) || data.gruposContas[0] || null
  }, [data, selectedGroupId])

  const filtered = useMemo(() => {
    if (!data) return []
    const groupAccounts = selectedGroup ? data.contas.filter((item) => String(item.grupoContaId) === String(selectedGroup.id)) : []
    const term = search.trim().toLocaleLowerCase('pt-BR')
    if (!term) return groupAccounts
    return groupAccounts.filter((item) => `${item.codigo} ${item.nome}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [data, search, selectedGroup])

  async function saveBudget(item, orcamento) {
    try {
      await api(`/api/orcamentos/contas/${item.id}`, { method: 'PUT', body: JSON.stringify({ orcamento, sedeId: filter.sedeId, competencia: filter.competencia }) })
      await load()
      onChanged?.()
      notify(`Orçamento da conta ${item.codigo} atualizado a partir de ${filter.competencia.slice(5, 7)}/${filter.competencia.slice(0, 4)}.`)
    } catch (error) { notify(error.message, 'error'); throw error }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow blue">PLANEJAMENTO</span><h1>Orçamentos</h1><p>O valor informado vale para a sede e o mês selecionados e se repete até a próxima alteração.</p></div>{data && <div className="budget-filters"><label><span>Competência</span><input type="month" value={filter.competencia} onChange={(event) => setFilter((current) => ({ ...current, competencia: event.target.value }))}/></label><label><span>Sede</span><select value={filter.sedeId} onChange={(event) => setFilter((current) => ({ ...current, sedeId: event.target.value }))}>{data.sedes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>}</div>
    {!data ? <Loading/> : <div className="budget-page-grid">
      <section className="panel catalog-card fixed-catalog">
        <div className="catalog-title"><span className="metric-icon purple"><Layers3/></span><div><h2>Orçamento por grupo</h2><p>{data.gruposContas.length} grupos</p></div></div>
        <div className="catalog-list budget-group-list">{data.gruposContas.map((item) => <button type="button" className={String(item.id) === String(selectedGroup?.id) ? 'active' : ''} key={item.id} title={`Mostrar ${item.quantidadeContas} conta(s)`} onClick={() => { setSelectedGroupId(String(item.id)); setSearch('') }}><span><strong>{item.codigo}</strong>{item.nome}<small>{item.quantidadeContas} conta(s)</small></span><b>{currency(item.orcamento)}</b></button>)}</div>
      </section>
      <section className="panel catalog-card budget-card">
        <div className="catalog-title"><span className="metric-icon green"><CircleDollarSign/></span><div><h2>{selectedGroup?.nome || 'Orçamento por conta'}</h2><p>{selectedGroup?.quantidadeContas || 0} conta(s) neste grupo</p></div></div>
        <div className="catalog-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta neste grupo"/></div>
        <div className="budget-list">{filtered.map((item) => <BudgetRow key={`${item.id}-${filter.sedeId}-${filter.competencia}`} item={item} onSave={saveBudget}/>)}</div>
      </section>
    </div>}
  </>
}
