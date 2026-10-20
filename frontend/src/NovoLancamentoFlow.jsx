import { useState } from 'react'
import { ArrowLeft, Box, CalendarDays, MapPin, PackageSearch, ReceiptText, Search, Truck, UserRound } from 'lucide-react'
import { api } from './api.js'
import { currency, number } from './format.js'
import { Modal } from './components.jsx'

const display = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: String(value).includes('T') ? 'short' : undefined, timeZone: 'America/Fortaleza',
}).format(new Date(value)) : '—'

function Detail({ label, value }) {
  return <div className="cargo-detail"><span>{label}</span><strong>{display(value)}</strong></div>
}

function Section({ icon: Icon, title, children }) {
  return <section className="cargo-section"><header><Icon size={18}/><h3>{title}</h3></header><div className="cargo-detail-grid">{children}</div></section>
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

  async function search(event) {
    event.preventDefault()
    const numero = Number(numeroCarga)
    if (!Number.isSafeInteger(numero) || numero <= 0) return setError('Informe um número de carga válido.')
    setLoading(true); setError(''); setData(null)
    try { setData(await api(`/api/cargas/${numero}`)) } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

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
          <Section icon={Box} title="Totais da carga">
            <Detail label="Pedidos" value={number(data.totais?.pedidos)}/><Detail label="Clientes" value={number(data.totais?.clientes)}/>
            <Detail label="Notas emitidas" value={number(data.totais?.notasEmitidas)}/><Detail label="Entregas" value={number(data.totais?.entregas)}/>
            <Detail label="Peso" value={data.totais?.pesoKg != null ? `${number(data.totais.pesoKg)} kg` : null}/><Detail label="Volume" value={number(data.totais?.volume)}/>
            <Detail label="Caixas" value={number(data.totais?.caixas)}/><Detail label="Itens" value={number(data.totais?.itens)}/>
          </Section>
          <Section icon={CalendarDays} title="Datas e operação">
            <Detail label="Montagem" value={date(data.datas?.montagem)}/><Detail label="Faturamento" value={date(data.datas?.faturamento)}/>
            <Detail label="Fechamento" value={date(data.datas?.fechamento)}/><Detail label="Saída" value={date(data.datas?.saidaVeiculo || data.datas?.saida)}/>
            <Detail label="Previsão de chegada" value={date(data.datas?.previsaoChegada)}/><Detail label="Retorno" value={date(data.datas?.retorno)}/>
            <Detail label="Frete" value={currency(data.logistica?.valorFrete)}/><Detail label="Lacre" value={data.logistica?.lacre}/>
          </Section>
        </div>
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
