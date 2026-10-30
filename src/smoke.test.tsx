// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { buildDocx } from './export/docx'
import { defaultOptions } from './export/tables'
import { buildXlsx } from './export/xlsx'
import { exampleProject } from './model/example'
import { deserialize, serialize } from './model/serialize'
import { useStore, type View } from './model/store'
import { validate } from './model/validate'
import { itemsOfKind } from './model/tree'
import { TraceEditor } from './ui/Trace'
import { VariableMap } from './ui/VariableMap'

const VIEWS: View[] = ['welcome', 'overview', 'step1', 'domain', 'structure', 'ucas', 'scenarios', 'requirements', 'trace', 'validation', 'review']

describe('smoke', () => {
  it('renders every view with the example project and any selection', () => {
    const p = exampleProject()
    useStore.getState().load(p, null)
    for (const v of VIEWS) {
      useStore.setState({ view: v, selected: null })
      expect(renderToString(<App />).length).toBeGreaterThan(500)
      for (const id of Object.keys(p.items)) {
        useStore.setState({ selected: id })
        renderToString(<App />)
      }
    }
  })

  it('renders the variable map and every trace editor', () => {
    const p = exampleProject()
    useStore.getState().load(p, null)
    const el = document.createElement('div')
    const root = createRoot(el)
    act(() => root.render(<VariableMap />))
    expect(el.querySelectorAll('.varmap td.ok').length).toBeGreaterThan(2)
    for (const s of itemsOfKind(p, 'scenario')) {
      act(() => root.render(<TraceEditor s={s} />))
      expect(!!el.querySelector('.trace-grid')).toBe(s.trace.steps.length > 0)
    }
    act(() => root.unmount())
  })

  it('round-trips the file format and validates', () => {
    const p = exampleProject()
    const q = deserialize(serialize(p))
    expect(serialize(q)).toBe(serialize(p))
    expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('builds xlsx and docx', async () => {
    const p = exampleProject()
    const x = await buildXlsx(p, defaultOptions())
    expect(x.size).toBeGreaterThan(3000)
    const o = defaultOptions()
    o.sections = o.sections.filter((s) => s !== 'structure')
    const d = await buildDocx(p, o)
    expect(d.size).toBeGreaterThan(3000)
  })
})
