import { useState } from 'react'
import { ArrowLeft, Box, CalendarDays, Eye, Info, MapPin, PackageSearch, ReceiptText, Search, Truck, UserRound } from 'lucide-react'
import { api } from './api.js'
import { currency, number } from './format.js'
import { FilterSelect, Modal } from './components.jsx'

const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: String(value).includes('T') ? 'short' : undefined, timeZone: 'America/Fortaleza',
}).format(new Date(value)) : '—'

function Detail({ label, value }) {
  return <div className="cargo-detail"><span>{label}</span><strong>{display(value)}</strong></div>
}

function Section({ icon: Icon, title, action, children }) {
  return <section className="cargo-section"><header><Icon size={18}/><h3>{title}</h3>{action}</header><div className="cargo-detail-grid">{children}</div></section>
}

function Choice({ onClose, onNormal, onCargo }) {
  return <Modal title="Novo lançamento" subtitle="Escolha o tipo de despesa que deseja consultar ou lançar." onClose={onClose}>
    <div className="modal-body launch-type-grid">
      <button type="button" className="launch-type-card" onClick={onNormal}>
        <span className="launch-type-icon normal"><ReceiptText/></span>
        <span><strong>Despesa normal</strong><small>Preencha sede, centro de custo, conta e valor.</small></span>
      </button>
      <button type="button" className="launch-type-card" onClick={onCargo}>
        <span className="launch-type-icon cargo"><Truck/></span>
        <span><strong>Despesa de carga</strong><small>Consulte uma carga diretamente no WinThor.</small></span>
      </button>
    </div>
  </Modal>
}

function CargoLookup({ onClose, onBack }) {
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

  return <Modal title="Despesa de carga" subtitle="Consulte os dados logísticos registrados no WinThor. Nenhum lançamento será salvo nesta etapa." onClose={onClose} wide>
    <div className="cargo-modal-body">
      <form className="cargo-search" onSubmit={search}>
        <label>Número da carga<input autoFocus inputMode="numeric" pattern="[0-9]*" value={numeroCarga} onChange={(event) => setNumeroCarga(event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 174331"/></label>
        <button className="primary" disabled={loading || !numeroCarga}><Search size={17}/>{loading ? 'Consultando...' : 'Consultar carga'}</button>
      </form>
      {error && <div className="form-error cargo-message">{error}</div>}
      {!data && !error && <div className="cargo-placeholder"><PackageSearch size={34}/><strong>Informe o número da carga</strong><span>Os dados abaixo serão consultados em tempo real na filial do WinThor.</span></div>}
      {data && <div className="cargo-result">
        <div className="cargo-summary">
          <div><span>Carga</span><strong>#{data.numeroCarga}</strong></div>
          <span className={`cargo-status ${String(data.situacao).toLowerCase().replace(/\s/g, '-')}`}>{data.situacao}</span>
          <div><span>Destino</span><strong>{display(data.destino)}</strong></div>
          <div><span>Valor total</span><strong>{currency(data.totais?.valor)}</strong></div>
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
            <Detail label="Caixas" value={data.totais?.caixas == null ? null : number(data.totais.caixas)}/><Detail label="Itens" value={data.totais?.itens == null ? null : number(data.totais.itens)}/>
          </Section>
          <Section icon={CalendarDays} title="Datas e operação">
            <Detail label="Montagem" value={date(data.datas?.montagem)}/><Detail label="Faturamento" value={date(data.datas?.faturamento)}/>
            <Detail label="Fechamento" value={date(data.datas?.fechamento)}/><Detail label="Saída" value={date(data.datas?.saidaVeiculo || data.datas?.saida)}/>
            <Detail label="Previsão de chegada" value={date(data.datas?.previsaoChegada)}/><Detail label="Retorno" value={date(data.datas?.retorno)}/>
            <Detail label="Frete" value={currency(data.logistica?.valorFrete)}/><Detail label="Lacre" value={data.logistica?.lacre}/>
          </Section>
        </div>
        <div className="cargo-source-note"><Info size={15}/><span><strong>Origem dos totais:</strong> distância é o KM cadastrado na rota principal; volume é o total consolidado pelo WinThor a partir dos pedidos/itens; caixas é o valor informado no cabeçalho da carga e pode estar vazio.</span></div>
        {detailsOpen && <section className="cargo-details-browser">
          <header><div><h3>Pedidos e itens da carga</h3><p>Consulte um pedido específico ou todos os produtos carregados.</p></div><div className="cargo-detail-tabs"><button type="button" className={detailMode === 'pedido' ? 'active' : ''} onClick={() => setDetailMode('pedido')}>Por pedido</button><button type="button" className={detailMode === 'todos' ? 'active' : ''} onClick={() => setDetailMode('todos')}>Todos os itens</button></div></header>
          {detailsError && <div className="form-error">{detailsError}</div>}
          {details && <>
            {detailMode === 'pedido' && <div className="cargo-order-selector"><label>Pedido<FilterSelect ariaLabel="Selecionar pedido" value={selectedPedido} onChange={(value) => setSelectedPedido(String(value))} options={details.pedidos.map((item) => ({ value: String(item.numeroPedido), label: `#${item.numeroPedido} · ${item.cliente.nome}` }))}/></label></div>}
            {detailMode === 'pedido' && selectedOrder && <div className="cargo-customer-card">
              <div><span>Cliente</span><strong>{selectedOrder.cliente.nome}</strong><small>{selectedOrder.cliente.fantasia || 'Sem nome fantasia'} · Código {selectedOrder.cliente.codigo}</small></div>
              <div><span>CPF/CNPJ</span><strong>{display(selectedOrder.cliente.cpfCnpj)}</strong></div>
              <div><span>Entrega</span><strong>{[selectedOrder.cliente.enderecoEntrega, selectedOrder.cliente.municipio, selectedOrder.cliente.uf].filter(Boolean).join(' · ') || '—'}</strong><small>{selectedOrder.cliente.telefone || 'Telefone não informado'}</small></div>
              <div><span>Pedido / nota</span><strong>{currency(selectedOrder.totais.valor)}</strong><small>NF {selectedOrder.numeroNota || '—'} · {number(selectedOrder.totais.itens)} itens</small></div>
            </div>}
            <div className="cargo-items-table"><table><thead><tr>{detailMode === 'todos' && <th>Pedido</th>}<th>Produto</th><th>Fornecedor</th><th className="align-right">Quantidade</th><th className="align-right">Preço venda</th><th className="align-right">Total</th><th className="align-right">Volume</th><th className="align-right">Peso</th><th className="align-right">Caixas</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={`${item.numeroPedido}-${item.sequencia}`}>{detailMode === 'todos' && <td><strong>#{item.numeroPedido}</strong></td>}<td><strong>{item.codigoProduto}</strong><span className="cargo-product-name">{item.descricao}</span><small>{[item.embalagem, item.unidade].filter(Boolean).join(' · ')}</small></td><td>{item.fornecedor?.nome || '—'}<small>{item.fornecedor?.codigo ? `Código ${item.fornecedor.codigo}` : ''}</small></td><td className="align-right">{number(item.quantidade)}</td><td className="align-right amount">{currency(item.precoVenda)}</td><td className="align-right amount">{currency(item.valorTotal)}</td><td className="align-right">{number(item.volumeTotal)}</td><td className="align-right">{number(item.pesoBrutoTotalKg)} kg</td><td className="align-right">{item.quantidadeCaixas == null ? '—' : number(item.quantidadeCaixas)}</td></tr>)}</tbody></table>{!visibleItems.length && <div className="cargo-no-items">Nenhum item encontrado para esta seleção.</div>}</div>
          </>}
        </section>}
      </div>}
    </div>
    <footer className="modal-footer cargo-footer"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</button><span>Consulta somente leitura</span><button type="button" className="secondary" onClick={onClose}>Fechar</button></footer>
  </Modal>
}

export default function NovoLancamentoFlow({ mode, onClose, onMode, onNormal }) {
  return mode === 'carga'
    ? <CargoLookup onClose={onClose} onBack={() => onMode('choice')}/>
    : <Choice onClose={onClose} onNormal={onNormal} onCargo={() => onMode('carga')}/>
}
