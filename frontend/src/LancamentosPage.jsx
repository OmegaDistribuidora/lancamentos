import { useCallback, useEffect, useState } from 'react'
import { Calculator, ChevronLeft, ChevronRight, Download, FileDown, Pencil, Plus, ReceiptText, Search, Trash2, TrendingUp, WalletCards } from 'lucide-react'
import { api, qs } from './api.js'
import { currency, number, periodOptions, periodRange, shortDate } from './format.js'
import { Empty, Loading } from './components.jsx'

const defaultRange = periodRange('mes_atual')

function LaunchMetric({ icon: Icon, tone, label, value, detail }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

export default function LancamentosPage({ user, catalogs, refreshKey, onNew, onEdit, notify }) {
  const savedSearch = sessionStorage.getItem('global_search') || ''
  sessionStorage.removeItem('global_search')
  const [filters, setFilters] = useState({ busca: savedSearch, periodo: 'mes_atual', ...defaultRange, sedeId: '', grupoContaId: '', colaboradorId: '' })
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
      <label><span>Período</span><select value={filters.periodo} onChange={(event) => setPeriod(event.target.value)}>{periodOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {filters.periodo === 'personalizado' && <><label><span>Data inicial</span><input type="date" value={filters.inicio} onChange={(event) => setFilter('inicio', event.target.value)}/></label><label><span>Data final</span><input type="date" value={filters.fim} onChange={(event) => setFilter('fim', event.target.value)}/></label></>}
      <label><span>Sede</span><select value={filters.sedeId} onChange={(event) => setFilter('sedeId', event.target.value)}><option value="">Todas</option>{catalogs.sedes.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
      <label><span>Grupo</span><select value={filters.grupoContaId} onChange={(event) => setFilter('grupoContaId', event.target.value)}><option value="">Todos</option>{catalogs.gruposContas.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
      {user.podeVerTodos && <label><span>Colaborador</span><select value={filters.colaboradorId} onChange={(event) => setFilter('colaboradorId', event.target.value)}><option value="">Todos</option>{catalogs.colaboradores.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>}
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
