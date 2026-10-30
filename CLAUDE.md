# HazardFox

Client-only React + TypeScript SPA for STPA / STPA-Sec analyses (Young/Leveson). No backend; the project is a
single pretty-printed JSON file (File System Access API, with download/upload fallback; IndexedDB autosave).
Read `PLAN.md` for goals, decisions and milestone status.

## Workflow
- Commit after every finished change (git repo initialised in this session; no remote).

## Commands
- `npm run dev` – Vite dev server (http://localhost:5173)
- `npm run typecheck` (`npx tsc -b`) – must be clean
- `npm test` (`npx vitest run`) – model tests + a smoke test rendering every view
- `npm run build` – typecheck + production build (~2 MB, mostly ELK)

## Architecture (src/)
- `model/` – pure, UI-free. `types.ts` (item kinds), `create.ts` (defaults), `ops.ts` (immutable Immer ops: create,
  update, delete+cascade, shift/indent/outdent, group/split/merge), `refs.ts` (typed link-field registry, mention
  helpers, ref rewriting/cascade), `derived.ts` (effective losses, scenario hazards, hazard trace), `labels.ts`
  (derived labels, `byLabel` natural sort, `DELETED`), `tree.ts` (`TREE_KINDS`, `parentKind`), `build.ts`
  (`projectBuilder` for examples/tests), `validate.ts`, `serialize.ts` (stable JSON, fills defaults for older files),
  `store.ts` (Zustand: project, selection, view, undo/redo with coalescing), `persist.ts`, `structure.ts`
  (ELK layout + pinned nudges), `uca.ts` (UCA sentence generation), `example.ts` (demo project).
- `ui/` – React views (`views1.tsx` step 1–4, `views2.tsx` requirements/trace/validation/overview), generic
  `TreeTable<K>` / `FlatTable<K>`, `Details.tsx` side panel, `Structure*.tsx` diagram, `Review.tsx` AI review, `Icon.tsx`.
- `export/` – `tables.ts` (shared row builders), `xlsx.ts` (exceljs), `docx.ts` (docx; diagram embedded as PNG via
  `structureImage.ts`).
- `mcp/` – stdio MCP server for agents (`server.ts` file I/O + wiring, `tools.ts` pure tool handlers `(Project, args) -> {project?, result}`, `schema.ts` field validation + label↔id mapping derived from `makeItem` defaults and `refs.ts`, `guide.ts` method text). Run: `npm run mcp -- file.hazardfox.json`. New item field/kind: check `TARGETS`/`ENUMS` in `schema.ts`.
- `llm/` – `ollama.ts` (browser → http://localhost:11434, streaming), `review.ts` (per-kind STPA Handbook rules, prompts).

## Invariants / conventions
- `items: Record<Id, Item>`, ids are immutable UUIDs. **Labels are derived, never stored** (L-, H-, SC-, R-, E-, CS-,
  V-, CA-, FB-, REL-, A-, UCA-n, LS-n.m for UCA scenarios, LS-CA-n.m for control-action scenarios).
  Free text references items as `@[id]`, rendered as live labels.
- Every link field must be declared in `REQUIRED_REFS` / `OPTIONAL_REFS` / `LIST_REFS` (`refs.ts`); this drives
  dangling-link cleanup, cascade delete (`cascadeSet`) and traceability. The registries are typed per kind, so only
  real fields of the right type can be listed; untyped field access is confined to `getField`/`setField`/`getList`.
- Typing: `ItemOf<K>` is the item of kind K, `Patch<K>` a partial update of it; `makeItem`, `createItem`, `itemsOfKind`,
  `children`, `flatten` and `addItem` (`ui/hooks.ts`: commit + select) are generic over the kind. Enumerations
  (`STATUSES`, `CAUSES`, `REQUIREMENT_TYPES`, `SEVERITIES`, …) are `as const` arrays with derived union types.
  Mentions: use `mention`/`mentions`/`replaceMentions` from `refs.ts`, not the regex.
- UCAs and system constraints link only to **leaf** hazards. Hazard→loss links are many-to-many; sub-hazards inherit.
- Sensors and actuators are **not nodes**: node roles are controller / process / external. A feedback has an optional `sensor`, a control action an optional `actuator` (names), drawn as small coloured pills on the arrow (`DEVICE_STYLE`). `deserialize` migrates old sensor/actuator nodes (names move onto the arrows, nodes become external / process).
- Two scenario kinds (`scenarioType`): `'uca'` (why a UCA occurs; hazards inherited from the UCA) and `'ca'` (why a
  control action is not executed properly; own `hazards`, `cause` from `CAUSES`, optional `element`).
  Use `scenarioHazards(p, s)` (`derived.ts`) and `scenarioTarget(s)` rather than reading `s.hazards` directly.
- Model ops are pure functions `Project -> Project`; UI calls `commit(fn, coalesceKey?)` from `ui/hooks.ts`.
- When adding an item kind or field: update `types.ts`, `create.ts`, `refs.ts`, `labels.ts`/`tree.ts` if numbered,
  `validate.ts`, `Details.tsx`, a view, `export/tables.ts`, `example.ts`, the smoke-test VIEWS list.
- Existing files must still load: extend defaults in `deserialize` instead of bumping `schema` unless incompatible.
- Match surrounding style: terse code, few comments, no new dependencies without need.

## AI review (Ollama decision model)
Settings in localStorage `hazardfox.decision` (endpoint, model; default `d1`, Liquid AI d1-3B). `llm/ollama.ts` calls
`POST {endpoint}/v1/systemone` with `state` + `noul` questions; one forward pass per item, answer = P(true).
`llm/review.ts`: per item kind an STPA primer (from the Handbook, since the model doesn't know STPA) goes into `state`,
followed by the resolved-label item description (`describe`). Each check is a violation-style yes/no question
(yes = mistake present, e.g. "does this hazard refer to a component failure?"). Item verdict = worst check:
`p <= PASS` (0.4) fine, `p >= FAIL` (0.7) possible problem, otherwise unsure. Percentages are hints, not verdicts.
Failed checks are listed per item ("Not met: …"). For non-UCA items the writer model (setting `writer`, default
`lfm3:latest`, `chat` in `ollama.ts`) drafts a rewritten title; the rewrite is shown only if d1 finds no unmet check
on it (up to 3 attempts, failed criteria fed back); "Apply" updates the title. d1 itself cannot write.
Auto review (header toggle, `llm/auto.ts`, localStorage `hazardfox.autoreview`) checks all reviewable items in the
background 1.5 s after edits; results are saved in `project.reviews` (`{key, p}` per item, key = hash of model + prompt +
questions, outside undo history, written to the file) so only new/changed items are re-checked. `ReviewDot` marks
non-passing items in lists. d1 questions must stay short (one rule sentence + one question): long, example-laden
questions made d1 answer "yes" to everything. Detailed guidance (`fix`, `WRITE_GUIDE`) goes only to the writer model.
Needs Ollama running; if CORS blocks, start with `OLLAMA_ORIGINS=http://localhost:5173`.

## Handbook examples and LLM test suite
`llm/handbook.ts`: `EXAMPLES` (good and bad, per kind; "Handbook" = quoted, "Handbook mistake" = a warned-about mistake worded by us),
`buildExample` (mini project so linked items appear in the prompt), `agrees`. Used only by the test suite (not shown in the AI review tab nor the Example menu; the menu lists the appendix projects of `model/handbookExamples.ts`: Appendix A hazards, Appendix B control structures (`nodes`/`links`, transcribed from the figures in `docs/STPA_Handbook_Markdown/figures`), Appendix C UCA tables; Auto-Hold and HTV combine structure and UCAs).
`llm/handbook.test.ts`: offline structure tests plus a live d1 test (auto-skipped if Ollama is unreachable; env `OLLAMA_ENDPOINT`,
`OLLAMA_MODEL`) that prints a per-example table and asserts good ≥90% not flagged, bad ≥70% flagged on the expected check.
Use it to tune checks (currently weak: UCA belief/no-context/several, hazard consequence). No requirement examples (Handbook has none).

## Status / open items
- Milestones 1–8 built; browser-verified: example load, hazards tree, group/merge, delete dialog, domain model view,
  scenarios (both kinds, editing), AI review run, diagram + nudges, UCA grid, validation, export build, split.
  Drag-and-drop works (drop on a row's top/bottom quarter = reorder, middle = nest). The native file picker can't be
  driven by the browser tool; save/open is covered by a serialize round-trip test only.
- Open: context-space coverage per CA from domain variables; check guide words and STPA-Sec details against primary
  sources; split ELK to shrink the bundle; probe d1 on uca/scenario/constraint/requirement checks and tune thresholds (example hazards often land in the 36–54% "unsure" band).
