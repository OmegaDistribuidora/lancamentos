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

export async function exportExcel(items) {
  const data = rows(items)
  const headers = Object.keys(data[0] || rows([{}])[0])
  const escape = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const column = (index) => { let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result }
  const sheetRows = [headers, ...data.map((row) => headers.map((key) => row[key]))].map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${column(colIndex)}${rowIndex + 1}`
      if (rowIndex > 0 && headers[colIndex] === 'Valor') return `<c r="${ref}" s="2"><v>${Number(value || 0)}</v></c>`
      return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t>${escape(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const widths = [10,16,8,24,16,18,22,22,25,38,14].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lançamentos" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF104071"/><bgColor rgb="FF104071"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:K${data.length + 1}"/></worksheet>`),
  }
  const buffer = zipSync(files, { level: 6 })
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = `lancamentos-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click()
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
