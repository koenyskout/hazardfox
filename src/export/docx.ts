import {
  AlignmentType, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle,
} from 'docx'
import type { Project } from '../model/types'
import { structureSvg, svgToPng } from './structureImage'
import { buildTables, SECTIONS, type ExportOptions, type Table as Tbl } from './tables'

const FONT = 'Calibri'
const TOTAL = 14400 // usable width in twips on landscape A4 with 2 cm margins (~25 cm)

const cellParas = (text: string, bold = false, color?: string) =>
  (text || '').split('\n').map((line) => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: line, bold, color, size: 18, font: FONT })] }))

function table(t: Tbl): Table {
  const w = t.widths ?? t.columns.map(() => 1)
  const sum = w.reduce((a, b) => a + b, 0)
  const widths = w.map((x) => Math.round((x / sum) * TOTAL))
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC5CE' }
  const borders = { top: border, bottom: border, left: border, right: border }
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: t.columns.map((c, i) => new TableCell({
          width: { size: widths[i], type: WidthType.DXA }, borders,
          shading: { type: ShadingType.CLEAR, fill: '1F3A5F', color: 'auto' },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: cellParas(c, true, 'FFFFFF'),
        })),
      }),
      ...t.rows.map((r, n) => new TableRow({
        cantSplit: true,
        children: t.columns.map((_, i) => new TableCell({
          width: { size: widths[i], type: WidthType.DXA }, borders,
          shading: n % 2 ? { type: ShadingType.CLEAR, fill: 'F3F5F8', color: 'auto' } : undefined,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: cellParas(r[i] ?? '', i === 0),
        })),
      })),
    ],
  })
}

const H = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font: FONT })] })

/** Word report following the STPA steps; only selected sections, filtered by status/tag. */
export async function buildDocx(p: Project, o: ExportOptions): Promise<Blob> {
  const tables = buildTables(p, o)
  const kids: (Paragraph | Table)[] = []
  kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: p.meta.name, font: FONT })] }))
  kids.push(new Paragraph({ children: [new TextRun({ text: `STPA / STPA-Sec analysis${p.meta.author ? ' · ' + p.meta.author : ''} · ${new Date().toISOString().slice(0, 10)}`, color: '666666', font: FONT })] }))
  if (o.sections.includes('summary') && p.meta.description) {
    kids.push(H('System description', HeadingLevel.HEADING_1))
    for (const para of p.meta.description.split('\n')) kids.push(new Paragraph({ children: [new TextRun({ text: para, font: FONT })] }))
  }

  let n = 0
  for (const [key, title] of SECTIONS) {
    if (key === 'summary' || !o.sections.includes(key)) continue
    const ts = tables.filter((t) => t.section === key)
    const img = key === 'structure' ? await structureSvg(p).catch(() => null) : null
    if (ts.length === 0 && !img) continue
    kids.push(H(`${++n}. ${title}`, HeadingLevel.HEADING_1))
    if (img) {
      const png = await svgToPng(img, 2)
      const max = 940
      const k = Math.min(1, max / img.width)
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: png, transformation: { width: Math.round(img.width * k), height: Math.round(img.height * k) }, altText: { title: 'Control structure', description: 'Hierarchical control structure diagram', name: 'control-structure' } })] }))
    }
    for (const t of ts) {
      if (ts.length > 1 || key === 'step1') kids.push(H(t.name, HeadingLevel.HEADING_2))
      kids.push(table(t), new Paragraph({ text: '' }))
    }
  }

  const doc = new Document({
    creator: p.meta.author || 'HazardFox',
    title: p.meta.name,
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: '1F3A5F', font: FONT } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: '2F5C8F', font: FONT } },
      ],
    },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 16, color: '888888', font: FONT })] })] }) },
      children: kids,
    }],
  })
  return Packer.toBlob(doc)
}
