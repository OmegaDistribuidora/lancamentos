import { strToU8, zipSync } from 'fflate'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { currency, shortDate } from './format.js'

const rows = (items) => items.map((item) => ({
  Número: item.numeroLancamento,
  'Data lançamento': shortDate(item.dataLancamento),
  Hora: item.hora,
  Colaborador: item.colaborador,
  'Data pagamento': shortDate(item.dataPagamento),
  Sede: item.sede,
  'Centro de custo': item.centroCusto,
  'Grupo de contas': item.grupoConta,
  Conta: item.conta,
  Observação: item.observacao,
  Valor: Number(item.valor),
}))

const cargoRows = (items) => items.map((item) => ({
  Número: item.numeroLancamentoCarga,
  Carga: item.numeroCarga,
  'Data lançamento': shortDate(item.dataLancamento),
  Hora: item.hora,
  Colaborador: item.colaborador,
  'Data pagamento': shortDate(item.dataPagamento),
  Sede: item.sede,
  Situação: item.resumoCarga?.situacao,
  Filial: item.resumoCarga?.filialSaida,
  Destino: item.destino,
  Motorista: item.motorista,
  'Código motorista': item.resumoCarga?.motorista?.codigo,
  'Celular motorista': item.resumoCarga?.motorista?.celular,
  Veículo: item.resumoCarga?.veiculo?.descricao,
  Placa: item.resumoCarga?.veiculo?.placa,
  'Marca veículo': item.resumoCarga?.veiculo?.marca,
  'Tipo veículo': item.resumoCarga?.veiculo?.tipo,
  Rota: item.resumoCarga?.rota?.descricao,
  'Código rota': item.resumoCarga?.rota?.codigo,
  'Distância da rota (km)': item.resumoCarga?.rota?.quilometragem,
  Montagem: shortDate(item.resumoCarga?.datas?.montagem),
  Faturamento: shortDate(item.resumoCarga?.datas?.faturamento),
  Fechamento: shortDate(item.resumoCarga?.datas?.fechamento),
  Saída: shortDate(item.resumoCarga?.datas?.saidaVeiculo || item.resumoCarga?.datas?.saida),
  'Conferido por': item.resumoCarga?.operacao?.conferencia?.nome,
  'Faturado por': item.resumoCarga?.operacao?.faturamento?.nome,
  Observação: item.observacao,
  'Venda total da carga': Number(item.valorVendaCarga),
  'Valor dos documentos': Number(item.resumoCarga?.totais?.valorDocumentos),
  'Custo da carga': Number(item.resumoCarga?.totais?.custo),
  'Lucro da carga': Number(item.lucroCarga),
  Bonificações: Number(item.resumoCarga?.totais?.valorBonificacoes),
  'Outras despesas WinThor': Number(item.resumoCarga?.totais?.outrasDespesas),
  Despesas: Number(item.totalDespesas),
  'Lucro final': Number(item.lucroFinal),
  'Peso (kg)': item.resumoCarga?.totais?.pesoKg,
  Volume: item.resumoCarga?.totais?.volume,
  Caixas: item.resumoCarga?.totais?.caixas,
  Pedidos: item.resumoCarga?.totais?.pedidos,
  Clientes: item.resumoCarga?.totais?.clientes,
  'Notas emitidas': item.resumoCarga?.totais?.notasEmitidas,
  Itens: item.resumoCarga?.totais?.itens,
  Entregas: item.resumoCarga?.totais?.entregas,
  Frete: Number(item.resumoCarga?.logistica?.valorFrete),
}))

const tripSheetTotal = (item) => ['diariasMotoristas', 'diariasAjudantes', 'descarrego', 'avarias', 'alimentacao', 'ajudanteExtra', 'manutencaoVeiculo', 'outros']
  .reduce((sum, key) => sum + Number(item[key] || 0), 0)

const cargoExpenseRows = (items) => items.map((item) => ({
  Número: item.numeroLancamentoCarga,
  Carga: item.numeroCarga,
  Sede: item.sede,
  'Km/L': item.kmPorLitro,
  'Valor do combustível': Number(item.valorCombustivel),
  'Km inicial': item.kmInicial,
  'Km final': item.kmFinal,
  'Total percorrido (km)': item.totalPercorrido,
  'Despesa com combustível': Number(item.despesaCombustivel),
  'Salário de funcionários': Number(item.salarioFuncionarios),
  'Diárias de motoristas': Number(item.diariasMotoristas),
  'Diárias de ajudantes': Number(item.diariasAjudantes),
  Descarrego: Number(item.descarrego),
  Avarias: Number(item.avarias),
  Alimentação: Number(item.alimentacao),
  'Ajudante extra': Number(item.ajudanteExtra),
  'Manutenção de veículo': Number(item.manutencaoVeiculo),
  Outros: Number(item.outros),
  'Despesa da ficha de viagem': tripSheetTotal(item),
  'Total das despesas': Number(item.totalDespesas),
  'Lucro da carga': Number(item.lucroCarga),
  'Lucro após despesas': Number(item.lucroFinal),
  '% despesas / venda': Number(item.valorVendaCarga) ? (Number(item.totalDespesas) / Number(item.valorVendaCarga)) * 100 : null,
  '% despesas / lucro final': Number(item.lucroFinal) ? (Number(item.totalDespesas) / Number(item.lucroFinal)) * 100 : null,
}))

const cargoOrderRows = (items) => items.flatMap((item) => (item.detalhesCarga?.pedidos || []).map((order) => ({
  Lançamento: item.numeroLancamentoCarga,
  Carga: item.numeroCarga,
  Pedido: order.numeroPedido,
  'Data pedido': shortDate(order.data),
  'Data faturamento': shortDate(order.dataFaturamento),
  Nota: order.numeroNota,
  Posição: order.posicao,
  Vendedor: order.codigoVendedor,
  'Condição de venda': order.condicaoVenda,
  Cobrança: order.codigoCobranca,
  Bonificação: order.bonificacao ? 'Sim' : 'Não',
  'Código cliente': order.cliente?.codigo,
  Cliente: order.cliente?.nome,
  Fantasia: order.cliente?.fantasia,
  'CPF/CNPJ': order.cliente?.cpfCnpj,
  'Endereço de entrega': order.cliente?.enderecoEntrega,
  Município: order.cliente?.municipio,
  UF: order.cliente?.uf,
  Telefone: order.cliente?.telefone,
  'Valor do pedido': Number(order.totais?.valor),
  'Valor original': Number(order.totais?.valorOriginal),
  'Peso (kg)': order.totais?.pesoKg,
  Volume: order.totais?.volume,
  Itens: order.totais?.itens,
})))

const cargoItemRows = (items) => items.flatMap((item) => (item.detalhesCarga?.itens || []).map((product) => ({
  Lançamento: item.numeroLancamentoCarga,
  Carga: item.numeroCarga,
  Pedido: product.numeroPedido,
  Sequência: product.sequencia,
  'Código produto': product.codigoProduto,
  Produto: product.descricao,
  Embalagem: product.embalagem,
  Unidade: product.unidade,
  Bonificação: product.bonificacao ? 'Sim' : 'Não',
  Quantidade: product.quantidade,
  Caixas: product.quantidadeCaixas,
  'Unidades por caixa': product.unidadesPorCaixa,
  'Preço de venda': Number(product.precoVenda),
  'Preço original': Number(product.precoVendaOriginal),
  'Preço de tabela': Number(product.precoTabela),
  'Venda total': Number(product.valorTotal),
  'Custo unitário': Number(product.custoUnitario),
  'Custo total': Number(product.custoTotal),
  Lucro: Number(product.lucroTotal),
  'Volume unitário': product.volumeUnitario,
  'Volume total': product.volumeTotal,
  'Peso unitário (kg)': product.pesoBrutoUnitarioKg,
  'Peso total (kg)': product.pesoBrutoTotalKg,
  'Código fornecedor': product.fornecedor?.codigo,
  Fornecedor: product.fornecedor?.nome,
  'Condição de venda': product.condicaoVenda,
  Cobrança: product.codigoCobranca,
})))

const escapeXml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const excelColumn = (index) => { let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result }
const MONEY_COLUMNS = new Set(['Valor', 'Venda total da carga', 'Valor dos documentos', 'Custo da carga', 'Lucro da carga', 'Bonificações', 'Outras despesas WinThor', 'Despesas', 'Lucro final', 'Frete', 'Valor do combustível', 'Despesa com combustível', 'Salário de funcionários', 'Diárias de motoristas', 'Diárias de ajudantes', 'Descarrego', 'Avarias', 'Alimentação', 'Ajudante extra', 'Manutenção de veículo', 'Outros', 'Despesa da ficha de viagem', 'Total das despesas', 'Lucro após despesas', 'Valor do pedido', 'Valor original', 'Preço de venda', 'Preço original', 'Preço de tabela', 'Venda total', 'Custo unitário', 'Custo total', 'Lucro'])

function sheetXml(data) {
  const headers = Object.keys(data[0] || {})
  const sheetRows = [headers, ...data.map((row) => headers.map((key) => row[key]))].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => {
    const ref = `${excelColumn(colIndex)}${rowIndex + 1}`
    if (rowIndex > 0 && MONEY_COLUMNS.has(headers[colIndex])) return `<c r="${ref}" s="2"><v>${Number(value || 0)}</v></c>`
    return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t>${escapeXml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  const widths = headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(12, header.length + 3))}" customWidth="1"/>`).join('')
  const filterEnd = headers.length ? excelColumn(headers.length - 1) : 'A'
  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${filterEnd}${data.length + 1}"/></worksheet>`
}

export async function exportExcel(items, type = 'normal') {
  const data = type === 'carga' ? cargoRows(items) : rows(items)
  const headers = Object.keys(data[0] || rows([{}])[0])
  const escape = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const column = (index) => { let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result }
  const sheetRows = [headers, ...data.map((row) => headers.map((key) => row[key]))].map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${column(colIndex)}${rowIndex + 1}`
      if (rowIndex > 0 && ['Valor', 'Venda total da carga', 'Despesas', 'Lucro final'].includes(headers[colIndex])) return `<c r="${ref}" s="2"><v>${Number(value || 0)}</v></c>`
      return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t>${escape(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const widths = (type === 'carga' ? [10,12,16,24,16,18,25,24,38,18,14,14] : [10,16,8,24,16,18,22,22,25,38,14]).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${type === 'carga' ? 'Lançamentos de Cargas' : 'Lançamentos'}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF104071"/><bgColor rgb="FF104071"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${column(headers.length - 1)}${data.length + 1}"/></worksheet>`),
  }
  const buffer = zipSync(files, { level: 6 })
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = `${type === 'carga' ? 'lancamentos-cargas' : 'lancamentos'}-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click()
  URL.revokeObjectURL(url)
}

export async function exportCargoExcel(items) {
  const sheets = [
    { name: 'Cargas', data: cargoRows(items) },
    { name: 'Despesas', data: cargoExpenseRows(items) },
    { name: 'Pedidos', data: cargoOrderRows(items) },
    { name: 'Itens', data: cargoItemRows(items) },
  ]
  const contentTypes = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF104071"/><bgColor rgb="FF104071"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'),
  }
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.data)) })
  const buffer = zipSync(files, { level: 6 })
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = `lancamentos-cargas-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click()
  URL.revokeObjectURL(url)
}

export function exportPdf(items) {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(16); doc.text('Ômega Distribuidora — Lançamentos', 14, 15)
  doc.setFontSize(9); doc.setTextColor(90); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 21)
  autoTable(doc, {
    startY: 27,
    head: [['Nº', 'Pagamento', 'Colaborador', 'Sede', 'Centro de custo', 'Grupo', 'Conta', 'Valor']],
    body: items.map((item) => [item.numeroLancamento, shortDate(item.dataPagamento), item.colaborador, item.sede, item.centroCusto, item.grupoConta, item.conta, currency(item.valor)]),
    styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [16, 64, 113] },
  })
  doc.save(`lancamentos-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export function exportCargoPdf(items) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const section = (title, head, body, first = false) => {
    if (!first) doc.addPage('a4', 'landscape')
    doc.setTextColor(20, 42, 70); doc.setFontSize(first ? 16 : 13); doc.text(title, 14, 15)
    if (first) { doc.setFontSize(8); doc.setTextColor(90); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${items.length} carga(s)`, 14, 21) }
    autoTable(doc, {
      startY: first ? 27 : 21, head: [head], body,
      styles: { fontSize: head.length > 18 ? 4.2 : head.length > 12 ? 5 : 6, cellPadding: 1.15, overflow: 'linebreak' },
      headStyles: { fillColor: [16, 64, 113], fontSize: head.length > 18 ? 4 : 5.5 },
      margin: { left: 7, right: 7 },
    })
  }

  section('Ômega Distribuidora — Resumo das cargas', ['Nº', 'Carga', 'Lançamento', 'Pagamento', 'Colaborador', 'Sede', 'Situação', 'Filial', 'Destino', 'Motorista', 'Veículo / placa', 'Rota', 'Venda', 'Custo', 'Despesa', 'Lucro final', 'Peso', 'Caixas', 'Pedidos', 'Clientes', 'Observação'], items.map((item) => {
    const cargo = item.resumoCarga || {}
    return [item.numeroLancamentoCarga, item.numeroCarga, `${shortDate(item.dataLancamento)} ${item.hora || ''}`, shortDate(item.dataPagamento), item.colaborador, item.sede, cargo.situacao || '—', cargo.filialSaida || '—', item.destino || '—', item.motorista || '—', [cargo.veiculo?.descricao, cargo.veiculo?.placa].filter(Boolean).join(' / ') || '—', cargo.rota?.descricao || '—', currency(item.valorVendaCarga), currency(cargo.totais?.custo), currency(item.totalDespesas), currency(item.lucroFinal), cargo.totais?.pesoKg ?? '—', cargo.totais?.caixas ?? '—', cargo.totais?.pedidos ?? '—', cargo.totais?.clientes ?? '—', item.observacao || '—']
  }), true)

  section('Logística e operação', ['Carga', 'Montagem', 'Faturamento', 'Fechamento', 'Saída', 'Motorista cód.', 'Celular', 'Veículo cód.', 'Veículo', 'Placa', 'Marca', 'Tipo', 'Rota cód.', 'Rota', 'Distância km', 'Conferido por', 'Faturado por', 'Frete', 'Volume', 'Notas', 'Itens', 'Entregas'], items.map((item) => {
    const cargo = item.resumoCarga || {}
    return [item.numeroCarga, shortDate(cargo.datas?.montagem), shortDate(cargo.datas?.faturamento), shortDate(cargo.datas?.fechamento), shortDate(cargo.datas?.saidaVeiculo || cargo.datas?.saida), cargo.motorista?.codigo ?? '—', cargo.motorista?.celular || '—', cargo.veiculo?.codigo ?? '—', cargo.veiculo?.descricao || '—', cargo.veiculo?.placa || '—', cargo.veiculo?.marca || '—', cargo.veiculo?.tipo || '—', cargo.rota?.codigo ?? '—', cargo.rota?.descricao || '—', cargo.rota?.quilometragem ?? '—', cargo.operacao?.conferencia?.nome || '—', cargo.operacao?.faturamento?.nome || '—', currency(cargo.logistica?.valorFrete), cargo.totais?.volume ?? '—', cargo.totais?.notasEmitidas ?? '—', cargo.totais?.itens ?? '—', cargo.totais?.entregas ?? '—']
  }))

  section('Despesas detalhadas', ['Carga', 'Km/L', 'Combustível/L', 'Km inicial', 'Km final', 'Percorrido', 'Desp. combustível', 'Salários', 'Diária motoristas', 'Diária ajudantes', 'Descarrego', 'Avarias', 'Alimentação', 'Ajudante extra', 'Manutenção', 'Outros', 'Ficha viagem', 'Total despesas', 'Venda', 'Lucro carga', 'Lucro final', '% desp./venda', '% desp./lucro'], cargoExpenseRows(items).map((row) => [row.Carga, row['Km/L'], currency(row['Valor do combustível']), row['Km inicial'], row['Km final'], row['Total percorrido (km)'], currency(row['Despesa com combustível']), currency(row['Salário de funcionários']), currency(row['Diárias de motoristas']), currency(row['Diárias de ajudantes']), currency(row.Descarrego), currency(row.Avarias), currency(row.Alimentação), currency(row['Ajudante extra']), currency(row['Manutenção de veículo']), currency(row.Outros), currency(row['Despesa da ficha de viagem']), currency(row['Total das despesas']), currency(items.find((item) => item.numeroCarga === row.Carga)?.valorVendaCarga), currency(row['Lucro da carga']), currency(row['Lucro após despesas']), row['% despesas / venda'] == null ? '—' : `${row['% despesas / venda'].toFixed(2)}%`, row['% despesas / lucro final'] == null ? '—' : `${row['% despesas / lucro final'].toFixed(2)}%`]))

  const orders = cargoOrderRows(items)
  if (orders.length) section('Pedidos e clientes', ['Carga', 'Pedido', 'Data', 'NF', 'Posição', 'BNF', 'Cliente cód.', 'Cliente', 'Fantasia', 'CPF/CNPJ', 'Município/UF', 'Telefone', 'Venda', 'Valor original', 'Peso', 'Volume', 'Itens'], orders.map((row) => [row.Carga, row.Pedido, row['Data pedido'], row.Nota || '—', row.Posição || '—', row.Bonificação, row['Código cliente'], row.Cliente, row.Fantasia || '—', row['CPF/CNPJ'] || '—', `${row.Município || '—'}/${row.UF || '—'}`, row.Telefone || '—', currency(row['Valor do pedido']), currency(row['Valor original']), row['Peso (kg)'] ?? '—', row.Volume ?? '—', row.Itens ?? '—']))

  const products = cargoItemRows(items)
  if (products.length) section('Itens e produtos', ['Carga', 'Pedido', 'Produto cód.', 'Produto', 'BNF', 'Qtd.', 'Caixas', 'Un./cx.', 'Preço venda', 'Venda total', 'Custo un.', 'Custo total', 'Lucro', 'Volume', 'Peso', 'Fornecedor cód.', 'Fornecedor', 'Cond. venda', 'Cobrança'], products.map((row) => [row.Carga, row.Pedido, row['Código produto'], row.Produto, row.Bonificação, row.Quantidade, row.Caixas, row['Unidades por caixa'], currency(row['Preço de venda']), currency(row['Venda total']), currency(row['Custo unitário']), currency(row['Custo total']), currency(row.Lucro), row['Volume total'] ?? '—', row['Peso total (kg)'] ?? '—', row['Código fornecedor'] ?? '—', row.Fornecedor || '—', row['Condição de venda'] ?? '—', row.Cobrança || '—']))
  doc.save(`lancamentos-cargas-${new Date().toISOString().slice(0, 10)}.pdf`)
}
