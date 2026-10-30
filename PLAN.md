# HazardFox – plan

**Goal:** a single-page, fully client-side web app for STPA and STPA-Sec (Young/Leveson) analyses that manages
artifacts and their links: stable links with automatic renumbering, a domain model with process variables,
an auto-drawn control-structure hierarchy, a clean layout, and Word/Excel export. No server; the project is one
pretty-printed JSON file (File System Access API, IndexedDB autosave as safety net).

## Decisions
- Method: STPA (losses → hazards → system constraints → control structure → UCAs → loss scenarios) + STPA-Sec
  as in Young/Leveson: security folded into the same artifacts; scenarios carry STRIDE tags + threat text.
- Solo use. React + TypeScript + Vite, Zustand + Immer store with undo/redo, ELK.js layout (own SVG renderer),
  `docx` + `exceljs` for export (fixed templates; Word has selectable sections and status/tag filters).
- Extras: risk ratings, requirements/mitigations, assumptions & notes, status & tags on every artifact.
- UX: undo/redo, validation panel, global search/jump (Ctrl+K), keyboard-first tables.

## Model
- One normalized map `items: Record<Id, Item>`; ids are immutable UUIDs. **Labels are derived**
  (L-1, H-2.1, UCA-3, LS-3.2 …) from kind + tree position, so any move/regroup renumbers without breaking links.
- Links are id references, declared per kind in `REF_FIELDS`; this drives dangling detection, cascade cleanup
  and trace views. Rich text references use `@[id]` tokens that render as the live label.
- Hierarchies (loss, hazard, constraint, requirement, entity, control-structure node) share one tree engine:
  move, indent/outdent, group, split, merge – all undoable.
- Rules: UCAs and system constraints link to **leaf** hazards only; parents roll up. Hazard→loss links are
  many-to-many; sub-hazards inherit parent loss links unless overridden (added / excluded).
  Split of a linked leaf asks to reassign links; unassigned links stay on the parent and are flagged.
  Group: parent rolls up. Merge: union of links.
- Domain model: entities (tree) with attributes, relationships, and *variables* (name + states) owned by an entity;
  layered as world / signal / belief / internal (designation `about`, refinement `definition`, `ca.affects`); controllers own
  beliefs and internal state, feedback owns signals. Scenarios carry a trace (steps of variable values + events) that is
  checked against the UCA context, diagnosed against the causal factor and animated on the control structure. UCA contexts are structured
  `variable = state` conditions plus optional free text, with a generated sentence that can be overridden.
  Control actions can map to an entity operation.

## Milestones
1. ✅ Store, id/label engine, hierarchy ops, undo/redo, file I/O, schema versioning, tests.
2. ✅ Losses/hazards/constraints UI with tree editing, trace links, mentions.
3. ✅ Domain model + variables.
4. ✅ Control structure editor, ELK auto-layout, pinned nudges, SVG export.
5. ✅ UCA grid + contexts, scenarios (STRIDE, risk), requirements/mitigations, assumptions.
6. ✅ Validation, CA × guide-word coverage, trace views, search palette. (Open: context-space coverage per CA from domain variables.)
7. ✅ Excel + Word export.
8. ◐ Polish: browser verification (partly done), README ✅, bundle splitting (open).
9. ✅ Scenario types (UCA-based and control-action-based), icon buttons + clearer delete dialog, Losses first,
   Ollama AI review (`llm/`, `ui/Review.tsx`).
10. ✅ Formal variable layers, variable map, scenario traces with witness/diagnosis checks and animation (branch `formal-variables`).

## Open items / defaults
- English UI only; project name "hazardfox".
- Verify guide words / STPA-Sec specifics against Handbook and Young/Leveson paper before release.
