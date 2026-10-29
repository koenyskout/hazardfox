import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { applyOverrides, layoutStructure } from '../model/structure'
import type { Project } from '../model/types'
import { StructureSvg } from '../ui/StructureSvg'

export interface StructureImage { svg: string; width: number; height: number }

export async function structureSvg(p: Project): Promise<StructureImage | null> {
  if (!Object.values(p.items).some((i) => i.kind === 'node')) return null
  const d = applyOverrides(p, await layoutStructure(p))
  const svg = renderToStaticMarkup(createElement(StructureSvg, { p, d }))
  return { svg, width: d.width, height: d.height }
}

/** Rasterise an SVG string to PNG bytes (browser only). */
export async function svgToPng(img: StructureImage, scale = 2): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([img.svg], { type: 'image/svg+xml' }))
  const el = new Image()
  await new Promise<void>((res, rej) => { el.onload = () => res(); el.onerror = () => rej(new Error('SVG render failed')); el.src = url })
  const c = document.createElement('canvas')
  c.width = Math.ceil(img.width * scale)
  c.height = Math.ceil(img.height * scale)
  const ctx = c.getContext('2d')!
  ctx.drawImage(el, 0, 0, c.width, c.height)
  URL.revokeObjectURL(url)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
