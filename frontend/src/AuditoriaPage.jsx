import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Eye, FileClock, Search } from 'lucide-react'
import { api, qs } from './api.js'
import { dateTime } from './format.js'
import { Empty, Loading, Modal } from './components.jsx'

const ACTIONS = { INSERCAO: 'Inserção', EDICAO: 'Edição', EXCLUSAO: 'Exclusão' }
const FIELDS = { dataPagamento: 'Data de pagamento', sedeId: 'Sede', centroCustoId: 'Centro de custo', grupoContaId: 'Grupo de contas', contaId: 'Conta', observacao: 'Observação', valor: 'Valor', nome: 'Nome', sede: 'Sede' }
const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const isCostCenter = (item) => item.entidadeTipo === 'CENTRO_CUSTO'
const snapshot = (item) => item.dadosNovos || item.dadosAnteriores || {}
const entityTitle = (item) => isCostCenter(item) ? `Centro de custo — ${snapshot(item).nome || `#${item.centroCustoId}`}` : `Lançamento #${item.numeroLancamento}`
const description = (item) => {
  if (item.acao === 'EDICAO') return `${Object.keys(item.alteracoes || {}).length} campo(s) alterado(s)`
  if (item.acao === 'EXCLUSAO') return isCostCenter(item) ? 'Centro removido dos cadastros ativos' : 'Registro removido das telas ativas'
  return isCostCenter(item) ? `Novo centro incluído em ${snapshot(item).sede}` : 'Novo registro incluído'
}

export default function AuditoriaPage({ notify }) {
  const [filters, setFilters] = useState({ numero: '', data: '' })
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const load = useCallback(async () => {
    try { setData(await api(`/api/auditoria${qs(filters)}`)) } catch (err) { notify(err.message, 'error') }
  }, [filters, notify])
  useEffect(() => { void load() }, [load])
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">RASTREABILIDADE</span><h1>Auditoria</h1><p>Consulte inserções, edições e exclusões realizadas no sistema.</p></div></div>
    <section className="panel filters audit-filters"><div className="search-field"><Search size={18}/><input type="number" min="1" value={filters.numero} onChange={(e) => setFilters({ ...filters, numero: e.target.value })} placeholder="Número do lançamento"/></div><label><span>Data da ação</span><input type="date" value={filters.data} onChange={(e) => setFilters({ ...filters, data: e.target.value })}/></label></section>
    <section className="panel data-panel">{!data ? <Loading/> : data.content.length ? <div className="audit-list">{data.content.map((item) => <article key={`${item.entidadeTipo}-${item.id}`}><div className={`audit-symbol ${item.acao.toLowerCase()}`}><FileClock size={19}/></div><div className="audit-main"><div><span className={`status ${item.acao.toLowerCase()}`}>{ACTIONS[item.acao]}</span><strong>{entityTitle(item)}</strong></div><p>{description(item)}</p></div><div className="audit-who"><strong>{item.usuario}</strong><span>{dateTime(item.ocorridoEm)}</span></div><button className="icon-button" onClick={() => setSelected(item)}><Eye size={18}/></button></article>)}</div> : <Empty title="Nenhum evento encontrado" text="Os eventos de auditoria aparecerão aqui."/>}</section>
    {selected && <Modal title={`${ACTIONS[selected.acao]} — ${entityTitle(selected)}`} subtitle={`${selected.usuario} em ${dateTime(selected.ocorridoEm)}`} onClose={() => setSelected(null)} wide><div className="modal-body">{selected.acao === 'EDICAO' ? <div className="diff-table"><div className="diff-head"><span>Campo</span><span>De</span><span></span><span>Para</span></div>{Object.entries(selected.alteracoes || {}).map(([field, values]) => <div className="diff-row" key={field}><strong>{FIELDS[field] || field}</strong><span>{display(values.de)}</span><ArrowRight size={16}/><span>{display(values.para)}</span></div>)}</div> : <pre className="snapshot">{JSON.stringify(selected.acao === 'EXCLUSAO' ? selected.dadosAnteriores : selected.dadosNovos, null, 2)}</pre>}</div><footer className="modal-footer"><button className="primary" onClick={() => setSelected(null)}>Fechar</button></footer></Modal>}
  </>
}
