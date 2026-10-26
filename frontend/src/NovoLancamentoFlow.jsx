import { useState } from 'react'
import { ArrowLeft, ArrowRight, Box, CalendarDays, Eye, MapPin, PackageSearch, Search, UserRound, X } from 'lucide-react'
import { api } from './api.js'
import CargoExpenseForm from './CargoExpenseForm.jsx'
import { currency, number } from './format.js'
import { FilterSelect, Modal } from './components.jsx'

const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const date = (value) => {
  if (!value) return '—'
  const hasTime = /T(?!00:00(?::00)?(?:\.\d+)?$)\d{2}:\d{2}/.test(String(value))
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', ...(hasTime ? { timeStyle: 'short' } : {}), timeZone: 'America/Fortaleza',
  }).format(new Date(value))
}
const decimal2 = (value) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))

function Detail({ label, value }) {
  return <div className="cargo-detail"><span>{label}</span><strong>{display(value)}</strong></div>
}

function Section({ icon: Icon, title, action, children }) {
  return <section className="cargo-section"><header><Icon size={18}/><h3>{title}</h3>{action}</header><div className="cargo-detail-grid">{children}</div></section>
}

function CargoLookup({ onClose, onBack, catalogs, onSaved }) {
  const [numeroCarga, setNumeroCarga] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailMode, setDetailMode] = useState('pedido')
  const [selectedPedido, setSelectedPedido] = useState('')
  const [expenseOpen, setExpenseOpen] = useState(false)

  async function search(event) {
    event.preventDefault()
    const numero = Number(numeroCarga)
    if (!Number.isSafeInteger(numero) || numero <= 0) return setError('Informe um número de carga válido.')
    setLoading(true); setError(''); setData(null); setDetails(null); setDetailsOpen(false); setDetailsError('')
    try { setData(await api(`/api/cargas/${numero}`)) } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function loadDetails() {
    if (details) return setDetailsOpen((current) => !current)
    setDetailsLoading(true); setDetailsError('')
    try {
      const result = await api(`/api/cargas/${data.numeroCarga}/detalhes`)
      setDetails(result); setDetailsOpen(true)
      setSelectedPedido(result.pedidos[0] ? String(result.pedidos[0].numeroPedido) : '')
    } catch (err) { setDetailsError(err.message); setDetailsOpen(true) } finally { setDetailsLoading(false) }
  }

  const selectedOrder = details?.pedidos.find((item) => String(item.numeroPedido) === String(selectedPedido))
  const visibleItems = !details ? [] : detailMode === 'todos' ? details.itens : details.itens.filter((item) => String(item.numeroPedido) === String(selectedPedido))

  if (expenseOpen) return <Modal title={`Despesa da carga #${data.numeroCarga}`} subtitle="Complete os custos da viagem. O grupo e a conta são definidos automaticamente." onClose={onClose} wide>
    <CargoExpenseForm cargo={data} catalogs={catalogs} onBack={() => setExpenseOpen(false)} onSaved={onSaved}/>
  </Modal>

  return <Modal title="Despesa de carga" subtitle="Consulte os dados logísticos registrados no WinThor. Nenhum lançamento será salvo nesta etapa." onClose={onClose} wide>
    <div className="cargo-modal-body">
      <form className="cargo-search" onSubmit={search}>
        <label>Número da carga<input autoFocus inputMode="numeric" pattern="[0-9]*" value={numeroCarga} onChange={(event) => setNumeroCarga(event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 174331"/></label>
        <button className="primary" disabled={loading || !numeroCarga}><Search size={17}/>{loading ? 'Consultando...' : 'Consultar carga'}</button>
      </form>
      {error && <div className="form-error cargo-message">{error}</div>}
      {!data && !error && <div className="cargo-placeholder"><PackageSearch size={34}/><strong>Informe o número da carga</strong><span>Os dados abaixo serão consultados em tempo real na filial do WinThor.</span></div>}
      {data && <div className="cargo-result">
        <div className={`cargo-summary ${data.situacao === 'EM ROTA' ? 'no-status' : ''}`}>
          <div><span>Carga</span><strong>#{data.numeroCarga}</strong></div>
          {data.situacao !== 'EM ROTA' && <span className={`cargo-status ${String(data.situacao).toLowerCase().replace(/\s/g, '-')}`}>{data.situacao}</span>}
          <div><span>Destino</span><strong>{display(data.destino)}</strong></div>
          <div className="cargo-financial-summary"><span><small>Venda</small><strong>{currency(data.totais?.valor)}</strong></span><span><small>Custo</small><strong>{currency(data.totais?.custo)}</strong></span><span><small>Lucro</small><strong>{currency(data.totais?.lucro)}</strong></span></div>
        </div>
        <div className="cargo-sections">
          <Section icon={UserRound} title="Motorista e veículo">
            <Detail label="Motorista" value={data.motorista?.nome}/><Detail label="Código" value={data.motorista?.codigo}/>
            <Detail label="Veículo" value={data.veiculo?.descricao}/><Detail label="Placa" value={data.veiculo?.placa}/>
            <Detail label="Marca / tipo" value={[data.veiculo?.marca, data.veiculo?.tipo].filter(Boolean).join(' · ')}/><Detail label="Código do veículo" value={data.veiculo?.codigo}/>
          </Section>
          <Section icon={MapPin} title="Rota e destino">
            <Detail label="Rota" value={data.rota?.descricao}/><Detail label="Código da rota" value={data.rota?.codigo}/>
            <Detail label="Distância da rota" value={data.rota?.quilometragem != null ? `${number(data.rota.quilometragem)} km` : null}/><Detail label="Filial de saída" value={data.filialSaida}/>
          </Section>
          <Section icon={Box} title="Totais da carga" action={<button type="button" className="cargo-details-link" onClick={loadDetails} disabled={detailsLoading}><Eye size={14}/>{detailsLoading ? 'Carregando...' : detailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}</button>}>
            <Detail label="Pedidos" value={number(data.totais?.pedidos)}/><Detail label="Clientes" value={number(data.totais?.clientes)}/>
            <Detail label="Notas emitidas" value={number(data.totais?.notasEmitidas)}/><Detail label="Entregas" value={number(data.totais?.entregas)}/>
            <Detail label="Peso" value={data.totais?.pesoKg != null ? `${number(data.totais.pesoKg)} kg` : null}/><Detail label="Volume" value={number(data.totais?.volume)}/>
            <Detail label="Caixas calculadas" value={decimal2(data.totais?.caixas)}/><Detail label="Itens" value={data.totais?.itens == null ? null : number(data.totais.itens)}/>
            <Detail label="Venda" value={currency(data.totais?.valor)}/><Detail label="Custo" value={currency(data.totais?.custo)}/>
            <Detail label="Lucro" value={currency(data.totais?.lucro)}/>
          </Section>
          <Section icon={CalendarDays} title="Datas e operação">
            <Detail label="Montagem" value={date(data.datas?.montagem)}/><Detail label="Faturamento" value={date(data.datas?.faturamento)}/>
            <Detail label="Fechamento" value={date(data.datas?.fechamento)}/><Detail label="Saída" value={date(data.datas?.saidaVeiculo || data.datas?.saida)}/>
            <Detail label="Conferido por" value={data.operacao?.conferencia?.nome}/><Detail label="Faturado por" value={data.operacao?.faturamento?.nome}/>
            <Detail label="Frete" value={currency(data.logistica?.valorFrete)}/>
          </Section>
        </div>
        {detailsOpen && <><div className="cargo-details-backdrop" onClick={() => setDetailsOpen(false)}/><section className="cargo-details-browser" role="dialog" aria-modal="true" aria-label="Pedidos e itens da carga">
          <header><div><h3>Pedidos e itens da carga #{data.numeroCarga}</h3><p>Consulte um pedido específico ou todos os produtos carregados.</p></div><div className="cargo-detail-tabs"><button type="button" className={detailMode === 'pedido' ? 'active' : ''} onClick={() => setDetailMode('pedido')}>Por pedido</button><button type="button" className={detailMode === 'todos' ? 'active' : ''} onClick={() => setDetailMode('todos')}>Todos os itens</button></div><button type="button" className="icon-button cargo-details-close" onClick={() => setDetailsOpen(false)} aria-label="Fechar detalhes"><X size={19}/></button></header>
          {detailsError && <div className="form-error">{detailsError}</div>}
          {details && <>
            {detailMode === 'pedido' && <div className="cargo-order-selector"><label>Pedido<FilterSelect ariaLabel="Selecionar pedido" value={selectedPedido} onChange={(value) => setSelectedPedido(String(value))} options={details.pedidos.map((item) => ({ value: String(item.numeroPedido), label: `#${item.numeroPedido} · ${item.cliente.nome}` }))}/></label></div>}
            {detailMode === 'pedido' && selectedOrder && <div className="cargo-customer-card">
              <div><span>Cliente</span><strong>{selectedOrder.cliente.nome}</strong><small>{selectedOrder.cliente.fantasia || 'Sem nome fantasia'} · Código {selectedOrder.cliente.codigo}</small></div>
              <div><span>CPF/CNPJ</span><strong>{display(selectedOrder.cliente.cpfCnpj)}</strong></div>
              <div><span>Entrega</span><strong>{[selectedOrder.cliente.enderecoEntrega, selectedOrder.cliente.municipio, selectedOrder.cliente.uf].filter(Boolean).join(' · ') || '—'}</strong><small>{selectedOrder.cliente.telefone || 'Telefone não informado'}</small></div>
              <div><span>Pedido / nota</span><strong>{currency(selectedOrder.totais.valor)}</strong><small>NF {selectedOrder.numeroNota || '—'} · {number(selectedOrder.totais.itens)} itens</small></div>
            </div>}
            <div className="cargo-items-table"><table><thead><tr>{detailMode === 'todos' && <th>Pedido</th>}<th>Produto</th><th>Fornecedor</th><th className="align-right">Qtd. / caixas</th><th className="align-right">Venda</th><th className="align-right">Custo</th><th className="align-right">Lucro</th><th className="align-right">Volume / peso</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={`${item.numeroPedido}-${item.sequencia}`}>{detailMode === 'todos' && <td><strong>#{item.numeroPedido}</strong></td>}<td><strong>{item.codigoProduto}{item.bonificacao && <span className="bonus-badge">BNF</span>}</strong><span className="cargo-product-name">{item.descricao}</span><small>{[item.embalagem, item.unidade].filter(Boolean).join(' · ')}</small></td><td>{item.fornecedor?.nome || '—'}<small>{item.fornecedor?.codigo ? `Código ${item.fornecedor.codigo}` : ''}</small></td><td className="align-right"><strong>{number(item.quantidade)} un.</strong><small>{decimal2(item.quantidadeCaixas)} caixas · {number(item.unidadesPorCaixa)} un./cx.</small></td><td className="align-right amount">{currency(item.valorTotal)}<small>{currency(item.precoVenda)} por un.</small></td><td className="align-right amount">{currency(item.custoTotal)}<small>{currency(item.custoUnitario)} por un.</small></td><td className={`align-right amount ${item.lucroTotal < 0 ? 'negative' : 'profit'}`}>{currency(item.lucroTotal)}</td><td className="align-right">{number(item.volumeTotal)}<small>{number(item.pesoBrutoTotalKg)} kg</small></td></tr>)}</tbody></table>{!visibleItems.length && <div className="cargo-no-items">Nenhum item encontrado para esta seleção.</div>}</div>
          </>}
        </section></>}
      </div>}
    </div>
    <footer className="modal-footer cargo-footer"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</button><button type="button" className="primary" disabled={!data} onClick={() => setExpenseOpen(true)}>Avançar <ArrowRight size={16}/></button></footer>
  </Modal>
}

export default function NovoLancamentoFlow({ onClose, catalogs, onSaved }) {
  return <CargoLookup onClose={onClose} onBack={onClose} catalogs={catalogs} onSaved={onSaved}/>
}
