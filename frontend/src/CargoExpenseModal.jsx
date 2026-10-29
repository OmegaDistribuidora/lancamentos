import { useEffect, useState } from 'react'
import { Box, Truck } from 'lucide-react'
import { api } from './api.js'
import { currency, number } from './format.js'
import { Loading, Modal } from './components.jsx'
import CargoExpenseForm from './CargoExpenseForm.jsx'

export default function CargoExpenseModal({ item, catalogs, onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/api/lancamentos-cargas/${item.numeroLancamentoCarga}`).then(setData).catch((err) => setError(err.message))
  }, [item.numeroLancamentoCarga])
  const cargo = data?.resumoCarga
  const details = data?.detalhesCarga
  const readOnly = data?.podeEditar === false
  return <Modal title={`Lançamento de carga #${item.numeroLancamentoCarga}`} subtitle={readOnly ? 'Consulte o retrato e os custos informados neste lançamento.' : 'Consulte o retrato salvo da carga e edite os custos informados.'} onClose={onClose} wide>
    {!data && !error && <Loading label="Carregando despesa da carga..."/>}
    {error && <div className="modal-body"><div className="form-error">{error}</div></div>}
    {data && <>
      <div className="cargo-snapshot">
        <div className="cargo-snapshot-summary"><Truck size={20}/><div><span>Carga</span><strong>#{cargo.numeroCarga}</strong></div><div><span>Destino</span><strong>{cargo.destino || '—'}</strong></div><div><span>Motorista</span><strong>{cargo.motorista?.nome || '—'}</strong></div><div><span>Venda</span><strong>{currency(cargo.totais?.valor)}</strong></div><div><span>Custo</span><strong>{currency(cargo.totais?.custo)}</strong></div><div><span>Lucro Bruto</span><strong>{currency(cargo.totais?.lucro)}</strong></div></div>
        <details className="cargo-snapshot-details"><summary><Box size={17}/> Ver todos os dados e produtos salvos</summary>
          <div className="cargo-snapshot-facts"><span>Rota <strong>{cargo.rota?.descricao || '—'}</strong></span><span>Veículo <strong>{cargo.veiculo?.descricao || '—'} · {cargo.veiculo?.placa || '—'}</strong></span><span>Pedidos <strong>{number(cargo.totais?.pedidos)}</strong></span><span>Clientes <strong>{number(cargo.totais?.clientes)}</strong></span><span>Caixas <strong>{number(cargo.totais?.caixas)}</strong></span><span>Peso <strong>{number(cargo.totais?.pesoKg)} kg</strong></span></div>
          <div className="cargo-items-table snapshot-items"><table><thead><tr><th>Pedido</th><th>Produto</th><th>Fornecedor</th><th className="align-right">Quantidade</th><th className="align-right">Venda</th><th className="align-right">Custo</th><th className="align-right">Lucro</th></tr></thead><tbody>{details.itens.map((product) => <tr key={`${product.numeroPedido}-${product.sequencia}`}><td>#{product.numeroPedido}</td><td><strong>{product.codigoProduto}{product.bonificacao && <span className="bonus-badge">BNF</span>}</strong><span className="cargo-product-name">{product.descricao}</span></td><td>{product.fornecedor?.nome || '—'}</td><td className="align-right">{number(product.quantidade)}</td><td className="align-right amount">{currency(product.valorTotal)}</td><td className="align-right amount">{currency(product.custoTotal)}</td><td className={`align-right amount ${product.lucroTotal < 0 ? 'negative' : 'profit'}`}>{currency(product.lucroTotal)}</td></tr>)}</tbody></table></div>
        </details>
      </div>
      <CargoExpenseForm cargo={cargo} catalogs={catalogs} initial={data} numeroLancamento={item.numeroLancamentoCarga} onBack={onClose} onSaved={onSaved} readOnly={readOnly}/>
    </>}
  </Modal>
}
