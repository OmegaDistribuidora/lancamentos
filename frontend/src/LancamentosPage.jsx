import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calculator, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileDown, Pencil, Plus, ReceiptText, Search, Trash2, TrendingUp, WalletCards } from 'lucide-react'
import { api, qs } from './api.js'
import { currency, number, periodOptions, periodRange, shortDate } from './format.js'
import { Empty, FilterSelect, Loading } from './components.jsx'

const defaultRange = periodRange('mes_atual')

function LaunchMetric({ icon: Icon, tone, label, value, detail }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function GroupAccountFilter({ groups, accounts, groupId, accountIds, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef(null)
  const selectedGroup = groups.find((group) => String(group.id) === String(groupId))
  const groupAccounts = useMemo(() => accounts.filter((account) => String(account.grupoContaId) === String(groupId)), [accounts, groupId])
  const selectedIds = useMemo(() => String(accountIds || '').split(',').filter(Boolean), [accountIds])
  const allAccounts = Boolean(selectedGroup) && selectedIds.length === 0
  const selectedAccount = selectedIds.length === 1 ? groupAccounts.find((account) => String(account.id) === selectedIds[0]) : null
  const triggerLabel = !selectedGroup
    ? 'Todos os grupos e contas'
    : allAccounts
      ? selectedGroup.nome
      : selectedAccount
        ? `${selectedAccount.codigo} — ${selectedAccount.nome}`
        : `${selectedGroup.nome} · ${selectedIds.length} contas`
  const term = query.trim().toLocaleLowerCase('pt-BR')
  const visibleGroups = useMemo(() => {
    if (!term) return groups
    return groups.filter((group) => `${group.codigo} ${group.nome}`.toLocaleLowerCase('pt-BR').includes(term)
      || accounts.some((account) => String(account.grupoContaId) === String(group.id) && `${account.codigo} ${account.nome}`.toLocaleLowerCase('pt-BR').includes(term)))
  }, [accounts, groups, term])

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  function toggleAccount(account) {
    const id = String(account.id)
    let next = allAccounts ? [id] : selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]
    if (!next.length || next.length === groupAccounts.length) next = []
    onChange(String(selectedGroup.id), next.join(','))
  }

  return <div className={`group-account-filter ${open ? 'open' : ''}`} ref={root}>
    <button type="button" className="filter-select-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span title={triggerLabel}>{triggerLabel}</span><ChevronDown size={16}/></button>
    {open && <div className="group-account-menu">
      <div className="group-account-search"><Search size={16}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar grupo ou conta"/></div>
      <div className="group-account-options">
        <button type="button" className={`group-option ${!selectedGroup ? 'active' : ''}`} onClick={() => { onChange('', ''); setOpen(false) }}><span className="option-check">{!selectedGroup && <Check size={13}/>}</span><span><strong>Todos os grupos</strong><small>Sem filtro de conta</small></span></button>
        {visibleGroups.map((group) => {
          const active = String(group.id) === String(groupId)
          const accountsInGroup = accounts.filter((account) => String(account.grupoContaId) === String(group.id))
          const visibleAccounts = !term || `${group.codigo} ${group.nome}`.toLocaleLowerCase('pt-BR').includes(term)
            ? accountsInGroup
            : accountsInGroup.filter((account) => `${account.codigo} ${account.nome}`.toLocaleLowerCase('pt-BR').includes(term))
          return <div className={`group-option-block ${active ? 'active' : ''}`} key={group.id}>
            <button type="button" className="group-option" onClick={() => { onChange(String(group.id), ''); setQuery('') }}><span className="option-check">{active && <Check size={13}/>}</span><span><strong>{group.codigo} — {group.nome}</strong><small>{accountsInGroup.length} conta(s)</small></span><ChevronDown className={active ? 'expanded' : ''} size={15}/></button>
            {active && <div className="account-options">
              <button type="button" className={allAccounts ? 'active' : ''} onClick={() => onChange(String(group.id), '')}><span className="option-check">{allAccounts && <Check size={12}/>}</span><span>Todas as contas do grupo</span></button>
              {visibleAccounts.map((account) => {
                const checked = allAccounts || selectedIds.includes(String(account.id))
                return <button type="button" className={`${checked ? 'checked ' : ''}${!allAccounts && checked ? 'active' : ''}`} key={account.id} onClick={() => toggleAccount(account)}><span className="option-check">{checked && <Check size={12}/>}</span><span><strong>{account.codigo}</strong>{account.nome}</span></button>
              })}
            </div>}
          </div>
        })}
        {!visibleGroups.length && <div className="filter-empty">Nenhum grupo ou conta encontrado.</div>}
      </div>
    </div>}
  </div>
}

export default function LancamentosPage({ user, catalogs, refreshKey, onNew, onEdit, notify }) {
  const savedSearch = sessionStorage.getItem('global_search') || ''
  sessionStorage.removeItem('global_search')
  const [filters, setFilters] = useState({ busca: savedSearch, periodo: 'mes_atual', ...defaultRange, sedeId: '', grupoContaId: '', contaIds: '', colaboradorId: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (filters.periodo === 'personalizado' && (!filters.inicio || !filters.fim)) { setLoading(false); return }
    setLoading(true)
    try { setData(await api(`/api/lancamentos${qs({ ...filters, page, limit: 15 })}`)) }
    catch (err) { notify(err.message, 'error') } finally { setLoading(false) }
  }, [filters, page, notify])
  useEffect(() => { void load() }, [load, refreshKey])
  const setFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  const setPeriod = (periodo) => {
    const range = periodo === 'personalizado' ? { inicio: '', fim: '' } : periodRange(periodo)
    setFilters((current) => ({ ...current, periodo, ...range })); setPage(1)
  }
  const setGroupAccounts = (grupoContaId, contaIds) => { setFilters((current) => ({ ...current, grupoContaId, contaIds })); setPage(1) }

  async function remove(item) {
    if (!window.confirm(`Excluir o lançamento #${item.numeroLancamento}? A ação ficará registrada na auditoria.`)) return
    try { await api(`/api/lancamentos/${item.numeroLancamento}`, { method: 'DELETE' }); notify('Lançamento excluído e registrado na auditoria.'); await load() }
    catch (err) { notify(err.message, 'error') }
  }

  async function allRows(format) {
    try {
      const pageSize = 500
      const first = await api(`/api/lancamentos${qs({ ...filters, page: 1, limit: pageSize })}`)
      if (!first.content.length) return notify('Não há registros para exportar.', 'error')
      const rows = [...first.content]
      const totalPages = Math.ceil(first.total / pageSize)
      for (let current = 2; current <= totalPages; current += 1) {
        const next = await api(`/api/lancamentos${qs({ ...filters, page: current, limit: pageSize })}`)
        rows.push(...next.content)
      }
      const exporters = await import('./export.js')
      if (format === 'xlsx') await exporters.exportExcel(rows); else exporters.exportPdf(rows)
      notify(`${rows.length} lançamento(s) exportado(s) para ${format === 'xlsx' ? 'Excel' : 'PDF'}.`)
    } catch (err) { notify(err.message, 'error') }
  }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15))
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">MOVIMENTAÇÃO</span><h1>Lançamentos</h1><p>{user.podeVerTodos ? 'Consulte e acompanhe todos os registros da empresa.' : 'Consulte e gerencie os seus próprios registros.'}</p></div><div className="heading-actions">{user.podeVerTodos && <div className="export-actions"><button className="secondary" onClick={() => allRows('xlsx')}><Download size={17}/> Excel</button><button className="secondary" onClick={() => allRows('pdf')}><FileDown size={17}/> PDF</button></div>}<button className="primary desktop-only" onClick={onNew}><Plus size={18}/> Novo lançamento</button></div></div>
    <section className="panel filters launch-filters">
      <div className="search-field"><Search size={18}/><input value={filters.busca} onChange={(event) => setFilter('busca', event.target.value)} placeholder="Buscar por conta, observação ou colaborador"/></div>
      <label><span>Período</span><FilterSelect options={periodOptions} value={filters.periodo} onChange={setPeriod} ariaLabel="Filtrar período"/></label>
      {filters.periodo === 'personalizado' && <><label><span>Data inicial</span><input type="date" value={filters.inicio} onChange={(event) => setFilter('inicio', event.target.value)}/></label><label><span>Data final</span><input type="date" value={filters.fim} onChange={(event) => setFilter('fim', event.target.value)}/></label></>}
      <label><span>Sede</span><FilterSelect options={[{ value: '', label: 'Todas as sedes' }, ...catalogs.sedes.map((row) => ({ value: String(row.id), label: row.nome }))]} value={filters.sedeId} onChange={(value) => setFilter('sedeId', value)} ariaLabel="Filtrar sede"/></label>
      <label className="group-account-label"><span>Grupo e conta</span><GroupAccountFilter groups={catalogs.gruposContas} accounts={catalogs.contas} groupId={filters.grupoContaId} accountIds={filters.contaIds} onChange={setGroupAccounts}/></label>
      {user.podeVerTodos && <label><span>Colaborador</span><FilterSelect options={[{ value: '', label: 'Todos os colaboradores' }, ...catalogs.colaboradores.map((row) => ({ value: String(row.id), label: row.nome }))]} value={filters.colaboradorId} onChange={(value) => setFilter('colaboradorId', value)} ariaLabel="Filtrar colaborador"/></label>}
    </section>
    <section className={`metrics-grid launch-metrics ${loading ? 'loading-metrics' : ''}`}>
      <LaunchMetric icon={WalletCards} tone="blue" label="Total lançado" value={currency(data?.resumo?.valorTotal)} detail="Soma conforme os filtros"/>
      <LaunchMetric icon={ReceiptText} tone="green" label="Quantidade de lançamentos" value={number(data?.resumo?.total)} detail="Todos os registros filtrados"/>
      <LaunchMetric icon={Calculator} tone="purple" label="Valor médio" value={currency(data?.resumo?.valorMedio)} detail="Média por lançamento"/>
      <LaunchMetric icon={TrendingUp} tone="orange" label="Maior lançamento" value={currency(data?.resumo?.maiorValor)} detail="Maior valor no filtro"/>
    </section>
    <section className="panel data-panel"><div className="table-caption"><strong>{data?.total || 0} registro(s)</strong><span>Valores em reais (BRL)</span></div>{loading ? <Loading/> : data?.content.length ? <div className="table-scroll"><table><thead><tr><th>Nº / Lançado em</th><th>Pagamento</th>{user.podeVerTodos && <th>Colaborador</th>}<th>Sede / Centro</th><th>Grupo / Conta</th><th>Observação</th><th className="align-right">Valor</th><th>Ações</th></tr></thead><tbody>{data.content.map((item) => <tr key={item.numeroLancamento}><td><strong>#{item.numeroLancamento}</strong><small>{shortDate(item.dataLancamento)} às {item.hora}</small></td><td>{shortDate(item.dataPagamento)}</td>{user.podeVerTodos && <td>{item.colaborador}</td>}<td><strong>{item.sede}</strong><small>{item.centroCusto}</small></td><td><span className="tag" style={{ '--tag-color': item.grupoCor }}>{item.grupoConta}</span><small>{item.conta}</small></td><td className="observation">{item.observacao || '—'}</td><td className="align-right amount">{currency(item.valor)}</td><td className="action-cell"><div className="row-actions"><button className="icon-button" title="Editar" onClick={() => onEdit(item)}><Pencil size={17}/></button><button className="icon-button danger-text" title="Excluir" onClick={() => remove(item)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div> : <Empty/>}<div className="pagination"><span>Página {page} de {pages}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft/></button><button className="icon-button" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight/></button></div></div></section>
  </>
}
