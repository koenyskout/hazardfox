import { z } from 'zod'
import { buildTables, defaultOptions, SECTIONS } from '../export/tables'
import { effectiveLosses, scenarioHazards } from '../model/derived'
import { compareLabels } from '../model/labels'
import { updateItem as patchItem, updateMeta, createItem, deleteItems, moveItem, reorder } from '../model/ops'
import { incoming } from '../model/refs'
import { children, flatten, itemsOfKind, parentKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { SEVERITIES, validate } from '../model/validate'
import { GUIDE_WORDS, KINDS, KIND_NAMES, STATUSES, type Id, type Item, type Kind, type Project } from '../model/types'
import { describeKind, internalize, Resolver, view } from './schema'

type Rec = Record<string, unknown>
export interface Outcome { project?: Project; result: unknown }
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  description: string
  shape: S
  /** Does the tool change the project file? */
  writes: boolean
  destructive?: boolean
  run: (p: Project, args: z.infer<z.ZodObject<S>>) => Outcome
}
const tool = <S extends z.ZodRawShape>(t: ToolDef<S>) => t

const kindEnum = z.enum(KINDS as [Kind, ...Kind[]])
const ref = z.string().describe('Item label such as "H-1.2" (case-insensitive), an item id, or "$alias" defined earlier in the same call')
const fieldsSchema = z.record(z.string(), z.unknown()).describe('Field values; call describe_kinds for the fields of each kind. References are labels like "H-1".')

/** Extra derived fields that make items easier to read than their raw fields. */
function extras(r: Resolver, it: Item): Rec {
  const p = r.p
  switch (it.kind) {
    case 'hazard': return { losses: effectiveLosses(p, it.id).map((l) => r.label(l)) }
    case 'uca': return { statement: generateUcaText(p, r.labels, it) }
    case 'scenario': return it.scenarioType === 'uca' ? { hazards: scenarioHazards(p, it).map((h) => r.label(h)) } : {}
    default: return {}
  }
}
const show = (r: Resolver, it: Item) => view(r, it, extras(r, it))

/** Items of a kind in label order (tree kinds depth-first). */
function ordered(p: Project, r: Resolver, kind: Kind): Item[] {
  if (parentKind(kind) && kind !== 'variable') return flatten(p, kind).map((x) => x.item)
  return Object.values(p.items).filter((i) => i.kind === kind).sort((a, b) => compareLabels(r.labels[a.id], r.labels[b.id]))
}

/** Warnings and errors from the validator that concern the touched items. */
function issuesFor(p: Project, ids: Id[]) {
  const set = new Set(ids)
  return validate(p).filter((i) => i.item && set.has(i.item) && i.severity !== 'info').map((i) => `${i.severity}: ${i.message}`)
}

const count = (p: Project) => Object.fromEntries(KINDS.map((k) => [k, itemsOfKind(p, k).length]).filter(([, n]) => n))

/** Where the analysis stands and what to do next, following the STPA steps. */
export function nextSteps(p: Project): string[] {
  const c = (k: Kind) => itemsOfKind(p, k).length
  const out: string[] = []
  if (!c('loss')) out.push('Step 1: define losses (create_items kind "loss").')
  if (!c('hazard')) out.push('Step 1: define system-level hazards linked to losses (kind "hazard", lossLinks).')
  else if (!c('constraint')) out.push('Step 1: derive a system constraint for every leaf hazard (kind "constraint").')
  if (!c('node')) out.push('Step 2: model the control structure: controllers/process/external elements (kind "node"), control actions (kind "ca") and feedback (kind "feedback"); add domain entities and process variables for the process models.')
  else if (!c('ca')) out.push('Step 2: add control actions between nodes (kind "ca").')
  const cas = itemsOfKind(p, 'ca')
  const missing = cas.filter((ca) => GUIDE_WORDS.some((g) => !itemsOfKind(p, 'uca').some((u) => u.ca === ca.id && u.guide === g)))
  if (cas.length && missing.length) out.push(`Step 3: analyse unsafe control actions; ${missing.length} of ${cas.length} control actions lack at least one guide word (see uca_coverage).`)
  const noScen = itemsOfKind(p, 'uca').filter((u) => !itemsOfKind(p, 'scenario').some((s) => s.scenarioType === 'uca' && s.uca === u.id))
  if (noScen.length) out.push(`Step 4: add loss scenarios for the ${noScen.length} UCAs without one, plus control-action scenarios (scenarioType "ca").`)
  if (c('scenario') && !c('requirement')) out.push('Step 4: derive requirements / mitigations from constraints, UCAs and scenarios.')
  const errs = validate(p).filter((i) => i.severity !== 'info').length
  if (errs) out.push(`Resolve the ${errs} validation warnings/errors (validate).`)
  if (!out.length) out.push('Analysis looks complete; review with validate, then export_report.')
  return out
}

export const TOOLS = [
  tool({
    name: 'project_summary',
    description: 'Overview of the open project: metadata, item counts per kind, validation counts and the suggested next STPA steps. Call this first.',
    shape: {},
    writes: false,
    run: (p) => {
      const issues = validate(p)
      return {
        result: {
          meta: p.meta,
          counts: count(p),
          validation: { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length },
          nextSteps: nextSteps(p),
        },
      }
    },
  }),

  tool({
    name: 'describe_kinds',
    description: 'Fields, types, allowed values and reference targets of the item kinds (loss, hazard, constraint, requirement, assumption, entity, relationship, variable, node, ca, feedback, uca, scenario).',
    shape: { kind: kindEnum.optional().describe('Only this kind; default all') },
    writes: false,
    run: (_p, { kind }) => ({
      result: Object.fromEntries((kind ? [kind] : KINDS).map((k) => [k, { name: KIND_NAMES[k], fields: describeKind(k) }])),
    }),
  }),

  tool({
    name: 'update_project_meta',
    description: 'Set project name, system description (important context for the analysis), author, or whether STRIDE categories are used for adversarial scenarios.',
    shape: { name: z.string().optional(), description: z.string().optional(), author: z.string().optional(), strideEnabled: z.boolean().optional() },
    writes: true,
    run: (p, args) => {
      const next = updateMeta(p, Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)))
      return { project: next, result: { meta: next.meta } }
    },
  }),

  tool({
    name: 'list_items',
    description: 'List items of one kind in label order (tree kinds depth-first) with resolved references. Labels (L-1, H-1.2, SC-3, CS-2, CA-1, UCA-4, LS-4.1 …) are derived from position and may change when items are inserted, moved or deleted; always use the labels from the latest result.',
    shape: {
      kind: kindEnum,
      parent: ref.optional().describe('Only direct children of this item (tree kinds) / variables of this entity'),
      refers_to: ref.optional().describe('Only items that reference this item (e.g. all UCAs of a control action)'),
      query: z.string().optional().describe('Case-insensitive substring of title/description'),
      status: z.enum(STATUSES).optional(),
      tag: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
    },
    writes: false,
    run: (p, a) => {
      const r = new Resolver(p)
      let items = ordered(p, r, a.kind)
      if (a.parent) { const id = r.resolve(a.parent); items = items.filter((i) => i.parent === id) }
      if (a.refers_to) { const id = r.resolve(a.refers_to); const inc = new Set(incoming(p, id).map((i) => i.id)); items = items.filter((i) => inc.has(i.id)) }
      if (a.query) { const q = a.query.toLowerCase(); items = items.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(q)) }
      if (a.status) items = items.filter((i) => i.status === a.status)
      if (a.tag) items = items.filter((i) => i.tags.includes(a.tag!))
      const total = items.length
      return { result: { total, items: items.slice(0, a.limit ?? 200).map((i) => show(r, i)) } }
    },
  }),

  tool({
    name: 'get_item',
    description: 'Full details of one item, including what it is linked to, who links to it and its children.',
    shape: { ref },
    writes: false,
    run: (p, a) => {
      const r = new Resolver(p)
      const it = p.items[r.resolve(a.ref)]
      const kids = it.kind === 'variable' ? [] : children(p, it.id, it.kind).map((c) => ({ ref: r.label(c.id), title: c.title }))
      return {
        result: {
          ...show(r, it),
          children: kids,
          referencedBy: incoming(p, it.id).filter((o) => o.parent !== it.id).map((o) => ({ ref: r.label(o.id), kind: o.kind, title: o.kind === 'uca' ? generateUcaText(p, r.labels, o) : o.title })),
          issues: issuesFor(p, [it.id]),
        },
      }
    },
  }),

  tool({
    name: 'create_items',
    description:
      'Create one or more items (batch = one atomic call; nothing is saved if any item is invalid). Items are appended at the end of their sibling group. ' +
      'Give an "alias" to refer to an item as "$alias" in later items of the same call (labels of later items can shift when earlier ones are inserted). ' +
      'Returns the new labels plus validator warnings for the created items. Create items as status "draft"; humans approve.',
    shape: {
      items: z.array(z.object({ kind: kindEnum, fields: fieldsSchema.optional(), alias: z.string().regex(/^\w+$/).optional(), index: z.number().int().min(0).optional().describe('Position among siblings; default: last') })).min(1).max(100),
    },
    writes: true,
    run: (p0, { items }) => {
      let p = p0
      const r = new Resolver(p)
      const made: { id: Id; alias?: string }[] = []
      items.forEach((spec, n) => {
        try {
          const init = internalize(r, spec.kind, (spec.fields ?? {}) as Rec, 'create')
          if (init.parent) {
            const par = p.items[init.parent as Id]
            if (par.kind !== parentKind(spec.kind)) throw new Error(`parent must be a ${parentKind(spec.kind)}`)
          }
          const res = createItem(p, spec.kind, init, spec.index)
          p = res.project
          if (spec.alias) r.aliases[spec.alias] = res.id
          made.push({ id: res.id, alias: spec.alias })
          r.refresh(p)
        } catch (e) {
          throw new Error(`items[${n}] (${spec.kind}): ${(e as Error).message}`)
        }
      })
      const fin = new Resolver(p)
      const issues = issuesFor(p, made.map((m) => m.id))
      return {
        project: p,
        result: {
          created: made.map((m) => ({ ref: fin.label(m.id), id: m.id, ...(m.alias ? { alias: m.alias } : {}), title: p.items[m.id].kind === 'uca' ? generateUcaText(p, fin.labels, p.items[m.id] as Extract<Item, { kind: 'uca' }>) : p.items[m.id].title })),
          issues,
        },
      }
    },
  }),

  tool({
    name: 'update_items',
    description:
      'Change fields of existing items (batch, atomic). Only the given fields change; list fields are replaced as a whole. ' +
      'Setting "parent" moves the item to the end of the new parent\'s children. Use move_item to reorder.',
    shape: { updates: z.array(z.object({ ref, fields: fieldsSchema })).min(1).max(100) },
    writes: true,
    run: (p0, { updates }) => {
      let p = p0
      const r = new Resolver(p)
      const ids: Id[] = []
      updates.forEach((u, n) => {
        try {
          const id = r.resolve(u.ref)
          const it = p.items[id]
          const patch = internalize(r, it.kind, u.fields as Rec, 'update')
          if ('parent' in patch) {
            const next = moveItem(p, id, patch.parent as Id | null, Number.MAX_SAFE_INTEGER)
            if (next === p && it.parent !== patch.parent) throw new Error('parent change not allowed (wrong kind or would create a cycle)')
            p = next
            delete patch.parent
          }
          p = patchItem(p, id, patch)
          ids.push(id)
          r.refresh(p)
        } catch (e) {
          throw new Error(`updates[${n}] (${u.ref}): ${(e as Error).message}`)
        }
      })
      const fin = new Resolver(p)
      return { project: p, result: { updated: ids.map((id) => ({ ref: fin.label(id), title: p.items[id].title })), issues: issuesFor(p, ids) } }
    },
  }),

  tool({
    name: 'delete_items',
    description:
      'Delete items. Deleting a tree item also deletes its descendants (or promotes them with promote=true); items that cannot exist without it are deleted too (a control action takes its UCAs and their scenarios with it); other links to it are removed. Use dry_run=true to see what would be deleted.',
    shape: { refs: z.array(ref).min(1), promote: z.boolean().optional().describe('Keep children, moving them up one level'), dry_run: z.boolean().optional() },
    writes: true,
    destructive: true,
    run: (p, a) => {
      const r = new Resolver(p)
      const next = deleteItems(p, a.refs.map((x) => r.resolve(x)), { promote: a.promote })
      const gone = Object.keys(p.items).filter((id) => !next.items[id]).map((id) => ({ ref: r.label(id), kind: p.items[id].kind, title: p.items[id].title }))
      return { project: a.dry_run ? undefined : next, result: { dry_run: !!a.dry_run, deleted: gone } }
    },
  }),

  tool({
    name: 'move_item',
    description: 'Reorder an item among its siblings (index only) or re-parent it (parent: label, or null for the top level; optional index). Tree kinds (loss, hazard, constraint, requirement, entity, node) nest under the same kind; variables belong to entities.',
    shape: { ref, parent: ref.nullable().optional(), index: z.number().int().min(0).optional() },
    writes: true,
    run: (p, a) => {
      const r = new Resolver(p)
      const id = r.resolve(a.ref)
      const idx = a.index ?? Number.MAX_SAFE_INTEGER
      const next = a.parent !== undefined ? moveItem(p, id, a.parent === null ? null : r.resolve(a.parent), idx) : reorder(p, id, idx)
      if (next === p) throw new Error('Nothing moved: no change, wrong parent kind, or it would create a cycle')
      const fin = new Resolver(next)
      return { project: next, result: { ref: fin.label(id), parent: fin.label(next.items[id].parent) } }
    },
  }),

  tool({
    name: 'uca_coverage',
    description: 'For every control action: which UCAs exist per guide word (not-provided, provided, too-early-late, stopped-too-soon) and which guide words are not analysed yet. Use it to work through STPA step 3 systematically.',
    shape: {},
    writes: false,
    run: (p) => {
      const r = new Resolver(p)
      const ucas = itemsOfKind(p, 'uca')
      return {
        result: itemsOfKind(p, 'ca').sort((a, b) => compareLabels(r.labels[a.id], r.labels[b.id])).map((ca) => {
          const from = p.items[ca.from]
          const by = Object.fromEntries(GUIDE_WORDS.map((g) => [g, ucas.filter((u) => u.ca === ca.id && u.guide === g).map((u) => r.label(u.id))]))
          return { ref: r.label(ca.id), title: ca.title, controller: from?.title, ucas: by, missing: GUIDE_WORDS.filter((g) => by[g].length === 0) }
        }),
      }
    },
  }),

  tool({
    name: 'validate',
    description: 'Check completeness and consistency (dangling links, hazards without constraint or loss, UCAs without hazards or scenarios, uncovered guide words, non-leaf hazard links, adversarial scenarios without STRIDE …).',
    shape: { severity: z.enum(SEVERITIES).optional().describe('Minimum severity; default info (everything)') },
    writes: false,
    run: (p, a) => {
      const min = SEVERITIES.indexOf(a.severity ?? 'info')
      const r = new Resolver(p)
      return { result: validate(p).filter((i) => SEVERITIES.indexOf(i.severity) <= min).map((i) => ({ severity: i.severity, ref: r.label(i.item), message: i.message })) }
    },
  }),

  tool({
    name: 'export_report',
    description: 'The analysis as Markdown tables with resolved labels (losses, hazards, constraints, domain model, control structure, UCAs, scenarios, requirements, assumptions, traceability). For a spreadsheet use export_xlsx.',
    shape: { sections: z.array(z.enum(SECTIONS.map((s) => s[0]) as [string, ...string[]])).optional().describe('Default: all') },
    writes: false,
    run: (p, a) => ({ result: markdownReport(p, a.sections) }),
  }),
]

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, '<br>')

export function markdownReport(p: Project, sections?: string[]): string {
  const o = defaultOptions()
  if (sections) o.sections = sections as typeof o.sections
  const out = [`# ${p.meta.name}`, p.meta.description]
  let section = ''
  for (const t of buildTables(p, o)) {
    if (t.section !== section) { section = t.section; out.push(`## ${SECTIONS.find((s) => s[0] === section)?.[1]}`) }
    out.push(`### ${t.name}`, `| ${t.columns.join(' | ')} |`, `|${t.columns.map(() => '---').join('|')}|`, ...t.rows.map((r) => `| ${t.columns.map((_, i) => cell(r[i] ?? '')).join(' | ')} |`))
  }
  return out.filter((l) => l !== '').join('\n')
}
