import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, CalendarDays, Landmark, Layers3, Plus, ReceiptText, RefreshCw, TrendingDown, WalletCards } from 'lucide-react'
import { api, qs } from './api.js'
import { currency, dashboardPeriodOptions, monthLabel, number, periodRange, shortDate } from './format.js'
import { Empty, Loading } from './components.jsx'

function Card({ icon: Icon, tone, label, value, detail }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

export default function DashboardPage({ user, catalogs, refreshKey, onNew, onSeeAll }) {
  const [filter, setFilter] = useState({ periodo: 'mes_atual', inicio: '', fim: '', sedeId: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const range = useMemo(() => periodRange(filter.periodo, filter), [filter])
  const load = useCallback(async () => {
    if (filter.periodo === 'personalizado' && (!range.inicio || !range.fim)) return
    setError('')
    try { setData(await api(`/api/dashboard${qs({ periodo: filter.periodo, ...range, sedeId: user.podeVerTodos ? filter.sedeId : '' })}`)) } catch (err) { setError(err.message) }
  }, [filter.periodo, filter.sedeId, range, user.podeVerTodos])
  useEffect(() => { void load() }, [load, refreshKey])

  if (!data && !error) return <Loading label="Montando sua visão geral..."/>
  if (error) return <div className="state-error"><p>{error}</p><button className="secondary" onClick={load}><RefreshCw size={17}/> Tentar novamente</button></div>
  const { cards, evolucao, grupos, recentes, periodo } = data
  const saldo = Number(cards.orcamentoTotal || 0) - Number(cards.total || 0)
  const average = cards.quantidade ? Number(cards.total) / Number(cards.quantidade) : 0
  const selectedSede = catalogs.sedes.find((item) => String(item.id) === String(filter.sedeId))
  const sedeLabel = selectedSede?.nome || 'Todas as sedes'
  const xLabel = (label) => periodo.granularidade === 'mes' ? monthLabel(label) : String(label ?? '')
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">VISÃO GERAL</span><h1>Olá, {user.nomeExibicao.split(' ')[0]}!</h1><p>Acompanhe os lançamentos {user.podeVerTodos ? 'de toda a empresa' : 'feitos por você'}.</p></div><div className="dashboard-heading-actions">{user.podeVerTodos && catalogs.sedes.length > 0 && <label className="dashboard-sede-select"><span>Sede</span><select value={filter.sedeId} onChange={(event) => setFilter((current) => ({ ...current, sedeId: event.target.value }))}><option value="">Todas as sedes</option>{catalogs.sedes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>}<button className="primary desktop-only" onClick={onNew}><Plus size={18}/> Novo lançamento</button></div></div>
    <section className="metrics-grid">
      {user.podeVerTodos ? <>
        <Card icon={Landmark} tone="green" label="Orçamento total" value={currency(cards.orcamentoTotal)} detail={`${periodo.label} · ${sedeLabel}`}/>
        <Card icon={WalletCards} tone="blue" label="Total lançado" value={currency(cards.total)} detail={periodo.label}/>
        <Card icon={TrendingDown} tone={saldo >= 0 ? 'blue' : 'orange'} label="Saldo do orçamento" value={currency(saldo)} detail={saldo >= 0 ? 'Disponível após despesas' : 'Orçamento excedido'}/>
        <Card icon={ReceiptText} tone="purple" label="Quantidade" value={number(cards.quantidade)} detail={periodo.label}/>
      </> : <>
        <Card icon={WalletCards} tone="blue" label="Total lançado" value={currency(cards.total)} detail={periodo.label}/>
        <Card icon={ReceiptText} tone="green" label="Quantidade" value={number(cards.quantidade)} detail="Lançamentos no período"/>
        <Card icon={TrendingDown} tone="orange" label="Média por lançamento" value={currency(average)} detail="Valor médio no período"/>
        <Card icon={Layers3} tone="purple" label="Grupos movimentados" value={number(cards.categorias)} detail="No período selecionado"/>
      </>}
    </section>
    <section className="charts-grid">
      <article className="panel chart-panel">
        <div className="panel-title"><div><h2>Evolução dos lançamentos</h2><p>{periodo.label} · visão por {periodo.granularidade === 'mes' ? 'meses' : periodo.granularidade === 'semana' ? 'semanas' : 'dias'}</p></div><label className="period-select"><CalendarDays size={16}/><select value={filter.periodo} onChange={(event) => setFilter((current) => ({ ...current, periodo: event.target.value }))}>{dashboardPeriodOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        {filter.periodo === 'personalizado' && <div className="dashboard-custom-period"><label>Início<input type="date" value={filter.inicio} onChange={(event) => setFilter((current) => ({ ...current, inicio: event.target.value }))}/></label><label>Fim<input type="date" value={filter.fim} onChange={(event) => setFilter((current) => ({ ...current, fim: event.target.value }))}/></label></div>}
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={evolucao} margin={{ top: 15, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2775e6" stopOpacity={0.28}/><stop offset="95%" stopColor="#2775e6" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e9eef5"/><XAxis dataKey="label" tickFormatter={xLabel} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => `${Math.round(value/1000)} mil`} axisLine={false} tickLine={false} width={48}/><Tooltip formatter={(value) => currency(value)} labelFormatter={xLabel}/><Area type="monotone" dataKey="total" stroke="#1f6fe5" strokeWidth={3} fill="url(#areaFill)"/></AreaChart></ResponsiveContainer></div>
      </article>
      <article className="panel chart-panel"><div className="panel-title"><div><h2>{user.podeVerTodos ? 'Orçamento e despesas por grupo' : 'Despesas por grupo'}</h2><p>{user.podeVerTodos ? `Soma das contas · ${sedeLabel} · ` : '8 grupos com maior despesa em '}{String(periodo.label || '').toLocaleLowerCase('pt-BR')}</p></div></div>{grupos.length ? <div className="horizontal-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={grupos.slice(0,8)} layout="vertical" margin={{ top: 12, right: 12, left: 5, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#e9eef5"/><XAxis type="number" tickFormatter={(value) => `${Math.round(value/1000)} mil`} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="nome" width={215} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => currency(value)}/><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }}/>{user.podeVerTodos && <Bar dataKey="orcamento" name="Orçamento" fill="#f59e0b" radius={[0,4,4,0]} barSize={9}/>}<Bar dataKey="total" name="Despesas" fill="#176fe5" radius={[0,4,4,0]} barSize={9}/></BarChart></ResponsiveContainer></div> : <Empty title="Sem grupos cadastrados" text="Os grupos aparecerão aqui."/>}</article>
    </section>
    <section className="panel recent-panel"><div className="panel-title"><div><h2>Últimos lançamentos</h2><p>Registros do período selecionado</p></div><button className="link-button" onClick={onSeeAll}>Ver todos <ArrowRight size={16}/></button></div>{recentes.length ? <div className="table-scroll"><table><thead><tr><th>Número</th><th>Pagamento</th><th>Conta</th><th>Grupo</th>{user.podeVerTodos && <th>Colaborador</th>}<th className="align-right">Valor</th></tr></thead><tbody>{recentes.map((item) => <tr key={item.numeroLancamento}><td><strong>#{item.numeroLancamento}</strong></td><td>{shortDate(item.dataPagamento)}</td><td>{item.conta}</td><td><span className="tag" style={{ '--tag-color': item.cor }}>{item.grupoConta}</span></td>{user.podeVerTodos && <td>{item.colaborador}</td>}<td className="align-right amount">{currency(item.valor)}</td></tr>)}</tbody></table></div> : <Empty/>}</section>
  </>
}
