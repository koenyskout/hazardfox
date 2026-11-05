# HazardFox

Client-only React + TypeScript SPA for STPA / STPA-Sec analyses (Young/Leveson). No backend; the project is a
single pretty-printed JSON file (File System Access API, with download/upload fallback; IndexedDB autosave).
Read `PLAN.md` for goals, decisions and milestone status.

## Workflow
- Commit after every finished change Remote: `origin` (github.com/koenyskout/hazardfox); push only when asked.

## Commands
- `npm run dev` – Vite dev server (http://localhost:5173)
- `npm run typecheck` (`npx tsc -b`) – must be clean
- `npm test` (`npx vitest run`) – model tests + a smoke test rendering every view; live LLM tests (handbook, published) only with `LIVE_LLM=1`
- `npm run build` – typecheck + production build (~2 MB, mostly ELK)

## Architecture (src/)
- `model/` – pure, UI-free. `types.ts` (item kinds), `create.ts` (defaults), `ops.ts` (immutable Immer ops: create,
  update, delete+cascade, shift/indent/outdent, group/split/merge), `refs.ts` (typed link-field registry, mention
  helpers, ref rewriting/cascade), `derived.ts` (effective losses, scenario hazards, hazard trace), `labels.ts`
  (derived labels, `byLabel` natural sort, `DELETED`), `tree.ts` (`TREE_KINDS`, `parentKind`), `build.ts`
  (`projectBuilder` for examples/tests), `validate.ts`, `serialize.ts` (stable JSON, fills item defaults),
  `store.ts` (Zustand: project, selection, view, undo/redo with coalescing), `persist.ts`, `structure.ts`
  (ELK layout + pinned nudges), `uca.ts` (UCA sentence generation), `example.ts` (demo project), `formal.ts` (variable layers:
  `variablesIn`, `beliefsAbout`, `signalsInto`, `controlledBy`, `addBelief`/`addSignal`/`setLayer`), `traces.ts` (scenario traces:
  `stateAt`, `contextHolds`, `witness`, `mismatches`, `diagnose`, `draftTrace`).
- `ui/` – React views (`views1.tsx` step 1–4, `views2.tsx` requirements/trace/validation/overview), generic
  `TreeTable<K>` / `FlatTable<K>`, `Details.tsx` side panel, `Structure*.tsx` diagram, `Review.tsx` AI review, `Icon.tsx`,
  `VariableMap.tsx` (world variables × controllers), `Trace.tsx` (trace editor `TraceEditor`, animation `ScenarioPlayer`; `ScenarioTrace` opens from the scenario table's Trace column in a large `Modal huge`).
- `export/` – `tables.ts` (shared row builders), `xlsx.ts` (exceljs), `docx.ts` (docx; diagram embedded as PNG via
  `structureImage.ts`).
- `mcp/` – stdio MCP server for agents (`server.ts` file I/O + wiring, `tools.ts` pure tool handlers `(Project, args) -> {project?, result}`, `schema.ts` field validation + label↔id mapping derived from `makeItem` defaults and `refs.ts`, `guide.ts` method text). Run: `npm run mcp -- file.hazardfox.json`. New item field/kind: check `TARGETS`/`ENUMS` in `schema.ts`.
- `llm/` – `ollama.ts` (browser → http://localhost:11434, streaming), `review.ts` (per-kind STPA Handbook rules, prompts).

## Invariants / conventions
- **Principle: use as much formalism as you want.** Everything must be doable with plain text (titles, rich-text descriptions, free-text UCA context, no domain model, no variables, no precise conditions, no traces); the formal layers (domain model, typed variables, conditions on hazards/UCAs, belief/signal layers, scenario traces) are optional add-ons that give extra checks and derived output when used. Consequences: formal fields default to empty and a free-text equivalent exists next to each; text and formal parts combine (e.g. UCA `context` + `conditions`); validation of formal data fires only where that data exists, and a text-only project must never be nagged to formalize (at most `info`, and not for data it never started); formal data never replaces or hides the text. New features: ask "can this be done in text only?" first.
- `items: Record<Id, Item>`, ids are immutable UUIDs. **Labels are derived, never stored** (L-, H-, SC-, R-, E-, CS-,
  V-, CA-, FB-, REL-, A-, UCA-n, LS-n.m for UCA scenarios, LS-CA-n.m for control-action scenarios).
  Free text references items as `@[id]`, rendered as live labels.
- Every link field must be declared in `REQUIRED_REFS` / `OPTIONAL_REFS` / `LIST_REFS` (`refs.ts`); this drives
  dangling-link cleanup, cascade delete (`cascadeSet`) and traceability. The registries are typed per kind, so only
  real fields of the right type can be listed; untyped field access is confined to `getField`/`setField`/`getList`.
- Ids are branded per kind: `Id<K>` is an id of kind K (`Id` alone = any string; a bare `Id`/string converts into `Id<K>`, an id of another kind does not), so `b.add('constraint', { hazards: [lossId] })` fails to compile. `Base<K, Parent>` types `id` and `parent` (tree kinds: own kind; variables: entity|relationship|feedback|node); `createItem`/`add` return `Id<K>`; `RefList`/`SingleRef` are generic over the id. Where a generic id meets a typed field (refs rewriting, MCP label→id, pickers) cast `as Id<'x'>` after a runtime kind check.
- Typing: `ItemOf<K>` is the item of kind K, `Patch<K>` a partial update of it; `makeItem`, `createItem`, `itemsOfKind`,
  `children`, `flatten` and `addItem` (`ui/hooks.ts`: commit + select) are generic over the kind. Enumerations
  (`STATUSES`, `CAUSES`, `REQUIREMENT_TYPES`, `SEVERITIES`, …) are `as const` arrays with derived union types.
  Mentions: use `mention`/`mentions`/`replaceMentions` from `refs.ts`, not the regex.
  Free text is rich: stored as a string (`**bold**`, `*italic*`, `@[id]`, `\` escapes, `\n` paragraphs; `model/richtext.ts`). Edit with `RichText` (`ui/RichEditor.tsx`, Lexical: reference pills, `@` completion, B/I); render with `parseRich`; `renderText` gives plain text.
- Conditions are one typed expression language (`model/lang.ts`, design in `docs/expression-language.md`): hazards/UCAs hold `when: Expr | null`, a variable's `rules` are `{state, when: Expr}`. `Expr` is `const | var{id,at?} | name | param | app{fn,args} | cmp | between | in | not | and | or | quant{q,name,entity,body} | text | event | hole`. `check` types it (strict units; a `hole` is incomplete; validation `expr-type`), `evalExpr`/`holds` evaluate three-valued, `printExpr`/`parseExpr` give the text form (also the MCP `when` string; items are `@[V-1]` mentions), `scopeAt`/`slotType`/`opsFor`/`fills` drive the editor so ill-typed choices are never offered. Quantifiers (`some`/`all`/`none` over a `many` entity) bind instance names; `var.at` names the instance per many end (lanes `<variable>@<names>`). Words are `text`; time is `heldFor(c) ≥ 5 s` / `since(event) < 200 ms` (checked only when step times are numeric, `parseTime`; `clockAt` in `traces.ts`, else unknown). Helpers: `atoms.ts` (`litOf`/`litExpr`/`requiredAtoms`/`varsOf`: the simple shapes traces, drafts, diagnosis and refinement understand), `say.ts` (`say(p, e)`: a sentence), `refinement.ts` (`expand`, `refineUca(p, uca, path)`). UI: `ConditionEditor` (`ui/ExprEditor.tsx`, rows + text tabs; variables, entities and events are pills in its dropdowns (`Select` options may be rich, their `label` attribute is the searched text), a relationship predicate reads as a sentence, a yes/no variable as "holds / does not hold", a lone quantifier owns the single add bar, hung off its group's line by a hollow dot; slots are filled with `Cascade` (`ui/Cascade.tsx`): first the kind (variable, value, instance, function), then the choice, typing searches all kinds), `WhenView`. The Text tab (`TextEdit`) colours the text (`highlight`) and completes names, keywords, functions, instance names and a variable's values (`complete`) via `model/textsyntax.ts`.
- Variables, control-action `Param`s, operation value parameters and struct fields share one `TypeSpec` (type, states, range, `rangeType`/`enumType`, and the symbolic flags `ordered`/`unique`/`monotonic`/`sequential`/`symbolicType`); `typeSpec()` (`create.ts`) builds one with defaults.
- Variables are typed (`type`: enum with `states`, boolean, range with `min`/`max`/`unit`); conditions compare them with `=`, `≠` (range also `<`, `≤`, `>`, `≥`, `between`) via `Expr` (`opsFor` in `lang.ts`; `describeStates` in `variables.ts`). A condition may instead be in words (`text`): it reads as its text, and traces treat it as a boolean lane `text:<text>` (`textLane`, `textLanes`; "In words" group in the trace editor), without creating a variable.
- `Variable` is a union by layer (`WorldVariable` with `rules`/`otherwise`/`struct`; `SignalVariable`/`BeliefVariable` with `about`; `InternalVariable`); `isWorld` narrows, `aboutOf`/`rulesOf`/`otherwiseOf`/`structOf` read a field of any variable (empty on other layers), `setLayer` converts (drops the old layer's fields), `makeItem`/`deserialize` keep only the fields of the layer. `Patch`/`Fields` distribute over such unions.
- Variable layers (`layer`, after the formalization in `docs/Process Variables…md`): `domain` (world x, parent = entity or relationship), `signal`
  (o, parent = feedback), `belief` (x̂, parent = controller node), `internal` (q, parent = controller node). `about` = the world
  variable a signal/belief designates; `definition` (rich text) refines a world variable; `ca.affects` = controlled world variables.
  Entity attributes *are* its world variables (no separate `attributes` field). A relationship has a `reading` template (`{1}`, `{2}`, … = its ends; empty = "{1} title {2}"; `readRel`/`readingValid` in `labels.ts`; edited as "Reads as" in Details) and `ends: RelEnd[]` (`{entity, role, card}`, at least two; the editor offers two; `role` defaults to the entity title, `endName`/`relName` in `labels.ts`; `relEnds(from, to, fromCard, toCard)` builds a binary one) and is a
  time-varying predicate R(end1, end2, …): `createItem` gives it an untitled boolean world variable (`predicateOf`/`isPredicate`, `formal.ts`;
  named "From rel To" by `variableName`). Owner kinds per layer: `VARIABLE_OWNER` (`tree.ts`, a list). UCA contexts may use only world variables and the issuing controller's internal
  ones; each world variable in a context needs a belief in that controller (validation `context-unrepresented`, Variable map red cell).
- Scenario traces (`s.trace`: `lanes` = `Lane`s (branded string: variable id, `<variable>@<instances>`, or `text:<condition>`; build with `laneOf`/`laneAt`/`laneLike`/`textLane`/`condKey`/`instLane`, read with `laneParts`/`laneText`/`laneKeys`/`laneEntries`, `asLane` only for input from outside), sparse `steps` with `t`, `values`, `events` on CAs/feedback `occurs|absent|lost`,
  `note`); values carry forward (`stateAt`). `witness` checks the UCA context holds at the step the action is sent / withheld;
  `diagnose`: signal ≠ world → feedback, belief ≠ signal → process model, belief = world → control algorithm, compared with `cause`.
- Hierarchical variables (refinement): a world variable may have `rules` (`{state, when: Expr}`, first match wins; `whenHolds` three-valued) and `otherwise` over lower-level world variables. `refines`/`partsOf`/`refinedBy` (`formal.ts`); traces use `traceState` (computes refined world values and beliefs about them from their parts; `ruleConflicts` flags set values that disagree); signals about a part update beliefs about the whole. `model/refinement.ts`: `expand` (DNF substitution, earlier rules negated) and `refineUca` (lower-level UCAs with `refines` = parent, deduped). Validation: `refinement-cycle`, `refinement-invalid`, `trace-rule-conflict`.
- Entity hierarchy: `Entity.relation` (`specialisation` (default) | `part`; always set, ignored for roots) says what a child is to its parent. Only `specialisation` inherits: `generalisations`/`isA`/`sameInstance`/`attributesOf` (`formal.ts`), `inheritedOperations` (`operations.ts`), `manyEntity` (`variables.ts`); an operation parameter of a specialised entity may act on inherited variables, and instance names may be shared across an entity and its specialisations. Diagram: hollow triangle = specialisation, diamond = part, 
- Control actions may have typed `params` (`Param`, like variables, range/enum/symbolic ones must follow a named type, validation `param-type`; boolean needs none; `model/params.ts`); a UCA constrains them with `args` (`ArgCondition`, by param name; renames/removals follow in `updateItem`). Optional, text-only unaffected.
- Operations (`operation` items, `model/operations.ts`): optional free-standing domain behaviour with `params` (`{name, entity}`, typed by an entity or relationship, or a value parameter: `entity` `''` and `data` = datatype like a CA `Param`; not drawn in the diagram) and `effects` (`{variable, state, on?, from?}`, `on` = parameter whose instance the variable belongs to, `from` = value parameter whose event argument becomes the value). A CA realizes one via `ca.operation`; a trace event on the operation or its CA carries `args` (instance, or value for value parameters, per parameter name, relationship ends "t1|c1"); `traceState` applies `appliedEffects` (lane key `<variable>@<instance>`) when it `occurs`, explicit step values at the same step override; `isOccurrence` makes event conditions on an operation match its CAs. Old single `owner`/`entity` and `entity.operations` name lists migrate to parameters (`migrateOperations`).
- Control actions have a `duration` (`continuous` default / `instantaneous`). Per the Handbook, "stopped too soon / applied too long" only applies to continuous ones: `guideApplies(ca, guide)` (`uca.ts`) drives the UCA grid (auto N/A cell), Details, validation and MCP `uca_coverage`.
- UCAs and system constraints link only to **leaf** hazards. Hazard→loss links are many-to-many; sub-hazards inherit.
- Sensors and actuators are **not nodes**: node roles are controller / process / external. A feedback has an optional `sensor`, a control action an optional `actuator` (names), drawn as small coloured pills on the arrow (`DEVICE_STYLE`).
- `Scenario` is a union (`UcaScenario` with `uca`; `CaScenario` with `ca` + `hazards`; both share `cause`, `element`, STRIDE, ratings, `trace`): narrow on `scenarioType`, `ucaOf`/`scenarioTarget` (`refs.ts`) read the target of any scenario, `setScenarioType` converts; `getList` is empty for an absent list.
- Two scenario kinds (`scenarioType`): `'uca'` (why a UCA occurs; hazards inherited from the UCA) and `'ca'` (why a
  control action is not executed properly; own `hazards`, `cause` from `CAUSES`, optional `element`).
  Use `scenarioHazards(p, s)` (`derived.ts`) and `scenarioTarget(s)` rather than reading `s.hazards` directly.
- Model ops are pure functions `Project -> Project`; UI calls `commit(fn, coalesceKey?)` from `ui/hooks.ts`.
- When adding an item kind or field: update `types.ts`, `create.ts`, `refs.ts`, `labels.ts`/`tree.ts` if numbered,
  `validate.ts`, `Details.tsx`, a view, `export/tables.ts`, `example.ts`, the smoke-test VIEWS list.
- No backward compatibility while the app is in development: no migrations for old files; change the model and regenerate the examples (`deserialize` only fills item defaults).
- Match surrounding style: terse code, few comments, no new dependencies without need.

- Symbolic (opaque) types: variable/param `type: 'symbolic'`, values are symbolic constants ("t1", "id7") typed freely in traces/conditions. Symbolic values can always be compared with = ≠ (no `equatable` flag). Property `ordered` (< ≤ > ≥ by natural order of the symbols), copied onto the variable and optionally following a named `symbolicTypes` entry (`symbolicType`; `define/rename/deleteSymbolicType`, `updateItem` keeps them in sync) like range/enum types. Further properties `unique` (no repeated value), `monotonic` (never decreases; implies ordered), `sequential` (changes go to the successor, `symbolAfter`; implies ordered); `normSym` makes them consistent, `symbolViolations` (`traces.ts`) checks them on traces (validation `trace-symbol-property`, flagged cells in the trace editor). Variables compare with a symbol or another variable of the same symbolic type; no `in`/`between`. Edited in Domain model → Types. Not offered for struct fields.
- Named reusable types (project-level, saved in the file): `rangeTypes` (bounds/unit; variable `rangeType`), `enumTypes` (state lists; variable `enumType`) — variables sharing one follow its edits (`updateItem`, `define/rename/delete*Type` in `ops.ts`); `structTypes` (fields, each with a type, possibly another struct type; cycles guarded) are applied with `applyStructType`: one world variable per field titled `<name>.<field>`, linked by `Variable.struct` and kept in line with the type by `syncStructs` (add/rename/remove fields, retype; deleting the type unlinks). Edited in Domain model → Types.

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
AI findings are part of validation: `aiIssues` (`llm/auto.ts`) turns fresh saved reviews into `Issue`s (`source: 'ai'`; fail → warning, unsure → info), shown in the Validation view (`ui/Validation.tsx`) and counted in the nav badge; every rule finding carries a `rule` key into `RULES` (`validate.ts`: title, why, fix), so new `validate` findings need an entry there; the view groups by problem or by element, with Open / one-click add actions (`ACTIONS`) and severity icons (`SevIcon`); the Validation page also hosts `AiStatus` and the per-kind details/rewrite runner (`ReviewView embedded`; the `review` view just opens that tab). `ui/Criteria.tsx` shows criteria, fixes, primer and Handbook examples in-app (`CriteriaButton`, per-check ⓘ).
Needs Ollama running; if CORS blocks, start with `OLLAMA_ORIGINS=http://localhost:5173`.

## Handbook examples and LLM test suite
`llm/handbook.ts`: `EXAMPLES` (good and bad, per kind; "Handbook" = quoted, "Handbook mistake" = a warned-about mistake worded by us),
`buildExample` (mini project so linked items appear in the prompt), `agrees`. Used only by the test suite (not shown in the AI review tab nor the Example menu; the menu lists the appendix projects of `model/handbookExamples.ts`: Appendix A hazards, Appendix B control structures (`nodes`/`links`, transcribed from the figures in `docs/STPA_Handbook_Markdown/figures`), Appendix C UCA tables; Auto-Hold and HTV combine structure and UCAs). Published analyses are in `model/publishedExamples.ts` (`build(add, b)`); the train-door controller (Thomas) is the reference example for variable layers and traces.
`llm/handbook.test.ts`: offline structure tests plus a live d1 test (opt-in: `LIVE_LLM=1 npm test`; also skipped if Ollama is unreachable; env `OLLAMA_ENDPOINT`,
`OLLAMA_MODEL`) that prints a per-example table and asserts good ≥90% not flagged, bad ≥70% flagged on the expected check.
Use it to tune checks (currently weak: UCA belief/no-context/several, hazard consequence). No requirement examples (Handbook has none).

## Status / open items
- Milestones 1–8 built; browser-verified: example load, hazards tree, group/merge, delete dialog, domain model view,
  scenarios (both kinds, editing), AI review run, diagram + nudges, UCA grid, validation, export build, split.
  Drag-and-drop works (drop on a row's top/bottom quarter = reorder, middle = nest). The native file picker can't be
  driven by the browser tool; save/open is covered by a serialize round-trip test only.
- Formal variables / traces: browser-verified variable map, trace editor, draft trace, animation (callouts beside elements).
- Open: context-space coverage per CA from domain variables; check guide words and STPA-Sec details against primary
  sources; split ELK to shrink the bundle; probe d1 on uca/scenario/constraint/requirement checks and tune thresholds (example hazards often land in the 36–54% "unsure" band).
