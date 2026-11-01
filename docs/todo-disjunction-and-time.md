# Pick-up notes: any-of conditions and time/event conditions

Status: nothing implemented yet. An attempt to change `conditions: Condition[]` to `When[]` on Hazard
(types.ts ~94) and Uca (~244) was reverted; it gave ~100 tsc errors (listed by file below). Main is clean.

## 1. Any-of (disjunction) in hazard / UCA conditions
Existing: `Group {any, of: When[]}`, `When = Condition | Group`, `allOf/anyOf/leaves/mapLeaves/whenText` (variables.ts ~187),
`whenHolds` (traces.ts ~73), used so far only for variable refinement `rules`.

Plan: change both `conditions` fields to `When[]` (top level stays all-of; groups nest any-of/all-of). Then per file:
- Leaf-only uses -> `.flatMap(leaves)`: refs.ts (mention scan ~73, rewrite ~110 via mapLeaves), validate.ts (~148-164),
  variables.ts `nameAllInstances`/`nameInstances` (~230), ui/VariableMap.tsx (39), ui/Trace.tsx (62-64),
  ui/Details.tsx (740, 752), ui/views1.tsx (74), export/tables.ts (55).
- Truth/text uses -> `whenHolds` / `whenText`: traces.ts `contextHolds`, `witness`, `draftTrace`, `mismatches`,
  `diagnose` (lines ~70, 126-128, 210-268; an any-of needs "which branch held" for witness/diagnose),
  uca.ts line 17 (`generateUcaText`).
- refinement.ts 77-86: `expand`/`refineUca` index `u.conditions[i]`; substitute inside groups (use mapLeaves).
- UI: `ConditionList`/`Declarations` in Details.tsx (415, 442, 464) need nested group editing (add "any of" group,
  add condition into group); naming of "some" instances applies per leaf.
- MCP: schema.ts (58, 181, 269) and guide.ts accept/describe nested `{any, of}`.
- Tests/formalize modules: formalize/*.ts and their tests (aeb-msiv, autohold-htv, crew-bscu, hazards, train-vtt),
  model.test.ts, quantifier.test.ts index conditions directly; adjust, then use any-of where the gap docs
  (docs/formalize-*.md) asked for it. Idea: derive a parent hazard's condition as any-of its children.
- Fallback if too big: allow `any` groups only as top-level list elements.
- Principle: optional, text-only stays valid; defaults `conditions: []` unchanged; old files load as-is (plain conditions).
- Validate by `npx tsc -b && npx vitest run` and check output before committing.

## 2. First-class time / event conditions
Not designed yet. Ideas: a condition kind "state held for >= / > duration" and "within duration after a state change
or event". Trace steps have `t` as a string and `condHolds` sees only the current state, so evaluation needs
parsing `t` (or a numeric time) and history (`stateAt` over earlier steps). Must be optional, with a free-text
equivalent (existing `text` condition); validation only where used; UI in the condition editor and trace editor.
First consumers: the ~12 crew/BSCU timing UCAs (see docs/formalize-crew-bscu.md).

## 3. Other open items
- Wire `formalize*` functions (src/model/formalize) into the Example menu (user not yet asked/answered).
- docs/instance-quantification.md is outdated (no oAs/oAs2, two-end picker, auto-naming, mandatory names).
- Train end offers "another Train than t1" but not "than t3".
- MCP exposure of quantifiers and instance names is incomplete.
- Work only in /Users/koeny/Development/hazardfox (main), not the stale worktree.
