import { describe, expect, it } from 'vitest'
import { whenToExpr } from './bridge'
import { exampleProject } from './example'
import { holds as newHolds, type Env } from './lang'
import { publishedExampleProject, PUBLISHED_EXAMPLES } from './publishedExamples'
import { handbookExampleProject, HANDBOOK_EXAMPLES } from './handbookExamples'
import { formalizeAebMsiv } from './formalize/aeb-msiv'
import { formalizeTrainVtt } from './formalize/train-vtt'
import { formalizeAutoholdHtv } from './formalize/autohold-htv'
import { formalizeCrewBscu } from './formalize/crew-bscu'
import { clockAt, getter, traceState, whenHolds } from './traces'
import { itemsOfKind } from './tree'
import { laneParts } from './variables'
import { isA } from './formal'
import type { Id, Project, When } from './types'

const projects = (): [string, Project][] => {
  const out: [string, Project][] = [['example', exampleProject()]]
  for (const x of PUBLISHED_EXAMPLES) {
    let p = publishedExampleProject(x.id)
    if (x.id === 'pub-aeb' || x.id === 'pub-thomas-msiv') p = formalizeAebMsiv(x.id, p)
    if (x.id === 'pub-train-door' || x.id === 'pub-vtt-am') p = formalizeTrainVtt(x.id, p)
    out.push([x.id, p])
  }
  for (const x of HANDBOOK_EXAMPLES) {
    let p = handbookExampleProject(x.id)
    if (x.id === 'hb-autohold' || x.id === 'hb-htv') p = formalizeAutoholdHtv(x.id, p)
    if (x.id === 'hb-crew' || x.id === 'hb-bscu') p = formalizeCrewBscu(x.id, p)
    out.push([x.id, p])
  }
  return out
}

describe('Expr agrees with the old condition trees on every example trace', () => {
  for (const [name, p] of projects()) it(name, () => {
    let compared = 0
    const lists: When[][] = []
    for (const u of itemsOfKind(p, 'uca')) lists.push(u.conditions)
    for (const h of itemsOfKind(p, 'hazard')) lists.push(h.conditions)
    for (const s of itemsOfKind(p, 'scenario')) {
      const t = s.trace
      if (!t) continue
      for (let i = 0; i < t.steps.length; i++) {
        const state = traceState(p, t, i)
        const get = getter(state, clockAt(p, t, i))
        const env: Env = {
          get: (l) => state[l as Id],
          before: () => null,
          time: null,
          since: (id) => get.clock?.since(id) ?? null,
          instances: (ent) => [...new Set(Object.keys(state).flatMap((l) => { const { id, names } = laneParts(l as never); const v = p.items[id]; return v?.kind === 'variable' && v.layer === 'domain' && v.parent ? names.filter((_, k) => isA(p, (p.items[v.parent!] as { id: Id }).id, ent) && k === 0) : [] }))],
        }
        for (const ws of lists) {
          if (!ws.length) continue
          const old = whenHolds(p, { kind: 'group', any: false, of: ws }, get)
          if (old === undefined) continue
          const now = newHolds({ p }, whenToExpr(p, ws)!, env)
          compared++
          expect({ s: s.id, i, now }, JSON.stringify(ws).slice(0, 200)).toEqual({ s: s.id, i, now: old })
        }
      }
    }
    console.log('compared', name, compared)
  })
})
