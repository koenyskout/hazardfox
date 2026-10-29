import ExcelJS from 'exceljs'
import type { Project } from '../model/types'
import { buildTables, type ExportOptions } from './tables'

const sheetName = (n: string, used: Set<string>) => {
  let s = n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
  while (used.has(s.toLowerCase())) s = s.slice(0, 28) + '…' + used.size
  used.add(s.toLowerCase())
  return s
}

/** One worksheet per artifact table, with resolved labels and ready-to-filter headers. */
export async function buildXlsx(p: Project, o: ExportOptions): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = p.meta.author || 'HazardFox'
  wb.title = p.meta.name
  const used = new Set<string>()

  const info = wb.addWorksheet(sheetName('Project', used))
  info.columns = [{ width: 18 }, { width: 90 }]
  info.addRows([['Name', p.meta.name], ['Author', p.meta.author], ['Description', p.meta.description], ['Exported', new Date().toISOString().slice(0, 10)]])
  info.getColumn(1).font = { bold: true }
  info.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  for (const t of buildTables(p, o)) {
    const ws = wb.addWorksheet(sheetName(t.name, used), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = t.columns.map((c, i) => {
      const longest = Math.max(c.length, ...t.rows.slice(0, 200).map((r) => Math.max(...(r[i] ?? '').split('\n').map((l) => l.length), 0)))
      return { header: c, key: `c${i}`, width: Math.min(60, Math.max(8, longest + 2)) }
    })
    ws.addRows(t.rows)
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }
    head.alignment = { vertical: 'middle', wrapText: true }
    head.height = 22
    ws.eachRow((row, n) => {
      if (n > 1) row.alignment = { wrapText: true, vertical: 'top' }
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } }
    ws.getColumn(1).font = { bold: true }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
