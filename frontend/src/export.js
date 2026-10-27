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

const tripDays = (departure, arrival) => {
  if (!departure || !arrival) return null
  const start = new Date(`${String(departure).slice(0, 10)}T12:00:00Z`)
  const end = new Date(`${String(arrival).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

const ratio = (value, base) => Number(base) ? Number(value || 0) / Number(base) : null

const cargoRows = (items) => items.map((item) => ({
  Número: item.numeroLancamentoCarga,
  Carga: item.numeroCarga,
  'Data lançamento': shortDate(item.dataLancamento),
  Hora: item.hora,
  Colaborador: item.colaborador,
  'Data pagamento': shortDate(item.dataPagamento),
  Sede: item.sede,
  Situação: item.resumoCarga?.situacao,
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
  'Data de saída': shortDate(item.resumoCarga?.datas?.saidaVeiculo || item.resumoCarga?.datas?.saida),
  'Data de chegada': shortDate(item.dataChegada),
  'Tempo de viagem (dias)': tripDays(item.resumoCarga?.datas?.saidaVeiculo || item.resumoCarga?.datas?.saida, item.dataChegada),
  'Faturado por': item.resumoCarga?.operacao?.faturamento?.nome,
  Observação: item.observacao,
  'Venda total da carga': Number(item.valorVendaCarga),
  'Valor dos documentos': Number(item.resumoCarga?.totais?.valorDocumentos),
  'Custo da carga': Number(item.resumoCarga?.totais?.custo),
  'Lucro da carga': Number(item.lucroCarga),
  '% Lucro Carga': ratio(item.lucroCarga, item.resumoCarga?.totais?.custo),
  Bonificações: Number(item.resumoCarga?.totais?.valorBonificacoes),
  Despesas: Number(item.totalDespesas),
  '% despesas / venda': ratio(item.totalDespesas, item.valorVendaCarga),
  '% despesas / lucro total da carga': ratio(item.totalDespesas, item.lucroCarga),
  'Lucro final': Number(item.lucroFinal),
  'Peso (kg)': item.resumoCarga?.totais?.pesoKg,
  Pedidos: item.resumoCarga?.totais?.pedidos,
  Clientes: item.resumoCarga?.totais?.clientes,
  'Total percorrido (km)': item.totalPercorrido,
  'Km/L': item.kmPorLitro,
  'Valor do combustível': Number(item.valorCombustivel),
  'Despesa com combustível': Number(item.despesaCombustivel),
}))

const escapeXml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const excelColumn = (index) => { let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result }
const MONEY_COLUMNS = new Set(['Valor', 'Venda total da carga', 'Valor dos documentos', 'Custo da carga', 'Lucro da carga', 'Bonificações', 'Despesas', 'Lucro final', 'Valor do combustível', 'Despesa com combustível'])
const PERCENT_COLUMNS = new Set(['% Lucro Carga', '% despesas / venda', '% despesas / lucro total da carga'])

function sheetXml(data) {
  const headers = Object.keys(data[0] || {})
  const sheetRows = [headers, ...data.map((row) => headers.map((key) => row[key]))].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => {
    const ref = `${excelColumn(colIndex)}${rowIndex + 1}`
    if (rowIndex > 0 && MONEY_COLUMNS.has(headers[colIndex])) return `<c r="${ref}" s="2"><v>${Number(value || 0)}</v></c>`
    if (rowIndex > 0 && PERCENT_COLUMNS.has(headers[colIndex]) && value != null) return `<c r="${ref}" s="3"><v>${Number(value)}</v></c>`
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
  const sheets = [{ name: 'Cargas', data: cargoRows(items) }]
  const contentTypes = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF104071"/><bgColor rgb="FF104071"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'),
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
  const formatValue = (field, value) => {
    if (value === null || value === undefined || value === '') return '—'
    if (MONEY_COLUMNS.has(field)) return currency(value)
    if (PERCENT_COLUMNS.has(field)) return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) * 100)}%`
    return String(value)
  }
  cargoRows(items).forEach((record, index) => {
    if (index) doc.addPage('a4', 'landscape')
    doc.setTextColor(20, 42, 70); doc.setFontSize(16); doc.text(`Ômega Distribuidora — Carga #${record.Carga}`, 14, 15)
    doc.setFontSize(8); doc.setTextColor(90); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Lançamento #${record.Número}`, 14, 21)
    const entries = Object.entries(record)
    const body = []
    for (let position = 0; position < entries.length; position += 2) {
      const [leftField, leftValue] = entries[position]
      const right = entries[position + 1]
      body.push([leftField, formatValue(leftField, leftValue), right?.[0] || '', right ? formatValue(right[0], right[1]) : ''])
    }
    autoTable(doc, {
      startY: 27,
      head: [['Campo', 'Valor', 'Campo', 'Valor']],
      body,
      styles: { fontSize: 7.2, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [16, 64, 113] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 53 }, 1: { cellWidth: 81 }, 2: { fontStyle: 'bold', cellWidth: 53 }, 3: { cellWidth: 81 } },
    })
  })
  doc.save(`lancamentos-cargas-${new Date().toISOString().slice(0, 10)}.pdf`)
}
