import { useCallback, useEffect, useState } from 'react'
import { Calculator, ChevronLeft, ChevronRight, Download, Eye, FileDown, Plus, ReceiptText, Search, Trash2, TrendingUp, Truck } from 'lucide-react'
import { api, qs } from './api.js'
import { currency, number, periodOptions, periodRange, shortDate } from './format.js'
import { Empty, FilterSelect, Loading } from './components.jsx'

const defaultRange = periodRange('mes_atual')

function Metric({ icon: Icon, tone, label, value, detail }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

export default function LancamentosCargasPage({ user, catalogs, refreshKey, onNew, onEdit, notify }) {
  const savedSearch = sessionStorage.getItem('cargo_global_search') || ''
  sessionStorage.removeItem('cargo_global_search')
  const [filters, setFilters] = useState({ busca: savedSearch, periodo: 'mes_atual', ...defaultRange, sedeId: '', colaboradorId: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (filters.periodo === 'personalizado' && (!filters.inicio || !filters.fim)) { setLoading(false); return }
    setLoading(true)
    try { setData(await api(`/api/lancamentos-cargas${qs({ ...filters, page, limit: 15 })}`)) }
    catch (err) { notify(err.message, 'error') } finally { setLoading(false) }
  }, [filters, page, notify])
  useEffect(() => { void load() }, [load, refreshKey])
  const setFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  const setPeriod = (periodo) => { const range = periodo === 'personalizado' ? { inicio: '', fim: '' } : periodRange(periodo); setFilters((current) => ({ ...current, periodo, ...range })); setPage(1) }

  async function remove(item) {
    if (!window.confirm(`Excluir o lançamento da carga #${item.numeroCarga}? A ação ficará registrada na auditoria.`)) return
    try { await api(`/api/lancamentos-cargas/${item.numeroLancamentoCarga}`, { method: 'DELETE' }); notify('Lançamento de carga excluído e auditado.'); await load() }
    catch (err) { notify(err.message, 'error') }
  }

  async function allRows(format) {
    try {
      const result = await api(`/api/lancamentos-cargas/exportacao${qs(filters)}`)
      if (!result.content.length) return notify('Não há lançamentos de cargas para exportar.', 'error')
      const rows = result.content
      const exporters = await import('./export.js')
      if (format === 'xlsx') await exporters.exportCargoExcel(rows); else exporters.exportCargoPdf(rows)
      notify(`${rows.length} lançamento(s) de cargas exportado(s).`)
    } catch (err) { notify(err.message, 'error') }
  }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15))
  const resumo = data?.resumo || {}
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">LOGÍSTICA</span><h1>Lançamentos de Cargas</h1><p>{user.podeVerTodos ? 'Consulte as despesas de cargas de todas as sedes.' : 'Consulte e gerencie somente as cargas lançadas por você.'}</p></div><div className="heading-actions">{user.podeVerTodos && <div className="export-actions"><button className="secondary" onClick={() => allRows('xlsx')}><Download size={17}/> Excel</button><button className="secondary" onClick={() => allRows('pdf')}><FileDown size={17}/> PDF</button></div>}<button className="primary desktop-only" onClick={onNew}><Plus size={18}/> Nova carga</button></div></div>
    <section className="panel filters launch-filters">
      <div className="search-field"><Search size={18}/><input value={filters.busca} onChange={(event) => setFilter('busca', event.target.value)} placeholder="Buscar carga, destino, motorista ou observação"/></div>
      <label><span>Período</span><FilterSelect options={periodOptions} value={filters.periodo} onChange={setPeriod} ariaLabel="Filtrar período"/></label>
      {filters.periodo === 'personalizado' && <><label><span>Data inicial</span><input type="date" value={filters.inicio} onChange={(event) => setFilter('inicio', event.target.value)}/></label><label><span>Data final</span><input type="date" value={filters.fim} onChange={(event) => setFilter('fim', event.target.value)}/></label></>}
      <label><span>Sede</span><FilterSelect options={[{ value: '', label: 'Todas as sedes' }, ...catalogs.sedes.map((row) => ({ value: String(row.id), label: row.nome }))]} value={filters.sedeId} onChange={(value) => setFilter('sedeId', value)} ariaLabel="Filtrar sede"/></label>
      {user.podeVerTodos && <label><span>Colaborador</span><FilterSelect options={[{ value: '', label: 'Todos os colaboradores' }, ...(catalogs.colaboradores || []).map((row) => ({ value: String(row.id), label: row.nome }))]} value={filters.colaboradorId} onChange={(value) => setFilter('colaboradorId', value)} ariaLabel="Filtrar colaborador"/></label>}
    </section>
    <section className={`metrics-grid launch-metrics ${loading ? 'loading-metrics' : ''}`}>
      <Metric icon={ReceiptText} tone="blue" label="Total das despesas" value={currency(resumo.valorTotal)} detail="Conforme os filtros"/>
      <Metric icon={Truck} tone="green" label="Quantidade de cargas" value={number(resumo.total)} detail="Lançamentos encontrados"/>
      <Metric icon={Calculator} tone="purple" label="Despesa média" value={currency(resumo.valorMedio)} detail="Média por carga"/>
      <Metric icon={TrendingUp} tone="orange" label="Lucro após despesas" value={currency(resumo.lucroFinal)} detail="Soma no período"/>
    </section>
    <section className="panel data-panel"><div className="table-caption"><strong>{data?.total || 0} registro(s)</strong><span>Módulo independente de cargas</span></div>{loading ? <Loading/> : data?.content.length ? <div className="table-scroll"><table><thead><tr><th>Nº / Carga</th><th>Pagamento</th>{user.podeVerTodos && <th>Colaborador</th>}<th>Sede</th><th>Destino / Motorista</th><th>Observação</th><th className="align-right">Despesas</th><th className="align-right">Lucro final</th><th>Ações</th></tr></thead><tbody>{data.content.map((item) => <tr key={item.numeroLancamentoCarga}><td><strong>#{item.numeroLancamentoCarga}</strong><small>Carga #{item.numeroCarga} · {shortDate(item.dataLancamento)} às {item.hora}</small></td><td>{shortDate(item.dataPagamento)}</td>{user.podeVerTodos && <td>{item.colaborador}</td>}<td><strong>{item.sede}</strong></td><td><strong>{item.destino || '—'}</strong><small>{item.motorista || 'Motorista não informado'}</small></td><td className="observation">{item.observacao || '—'}</td><td className="align-right amount">{currency(item.totalDespesas)}</td><td className={`align-right amount ${item.lucroFinal < 0 ? 'negative' : 'profit'}`}>{currency(item.lucroFinal)}</td><td className="action-cell"><div className="row-actions"><button className="icon-button" title="Ver e editar" onClick={() => onEdit(item)}><Eye size={17}/></button><button className="icon-button danger-text" title="Excluir" onClick={() => remove(item)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div> : <Empty title="Nenhuma carga encontrada" text="Os lançamentos de cargas aparecerão aqui."/>}<div className="pagination"><span>Página {page} de {pages}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft/></button><button className="icon-button" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight/></button></div></div></section>
  </>
}
