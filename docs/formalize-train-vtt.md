# Formalizing the train-door and VTT examples

`formalizeTrainVtt(id, project)` in `src/model/formalize/train-vtt.ts` is a pure, idempotent function applied to the project built by `publishedExampleProject(id)`. It never removes anything and never touches the free-text wording (titles, `override` sentences, descriptions stay as in the source). Tests: `train-vtt.test.ts` (no validation errors, no instance / belief / refinement / trace findings, every leaf hazard and UCA has complete conditions, idempotent, round trip, prints the sentences).

## pub-train-door (Thomas)

**Already formal:** entities Train and Door; typed world variables (motion, position, emergency with a refinement from fire / smoke / toxic gas, door position, door state); signals and beliefs of the door controller for all five variables; `affects` on both control actions; complete `conditions` on all 10 UCAs; scenario traces.

**Added**
- `Door` is a `many` entity (a train has several doors). The existing UCA conditions on door variables now name one instance (`do1`: first condition declares it, later ones use it), because the controller acts on one door.
- Refined world variable `Door-opening situation` (Train): `unsafe for opening` if motion is moving OR position is not aligned, else `safe for opening`. This is how the disjunction in H-2 is expressed.
- Conditions on the three leaf hazards (and `variables` links):
  - H-1 Doors close on a person in the doorway: some door do1 has a person in the doorway AND the same door is not fully open.
  - H-2 Doors open when moving or not aligned: door-opening situation is unsafe AND some door is not fully closed.
  - H-3 Unable to exit in an emergency: emergency is evacuation required AND no door is fully open (quantifier `none`).
- Nothing was needed for `context-unrepresented`: beliefs existed. No new signals.

**UCAs in words (generated from conditions; sources with `override` keep their sentence)**
1. provides Open door when train moving and no emergency
2. provides Open door when stopped, not aligned, no emergency
3. does not provide Open door when stopped and some door do1 has a person in the doorway and do1 is not fully open
4. does not provide Open door when stopped and evacuation required
5. Open door too early/late when stopped and evacuation required (source: more than TBD seconds)
6. Open door stopped too soon when evacuation required
7. provides Close door when some door do1 has a person in the doorway
8. provides Close door when stopped and evacuation required
9. does not provide Close door when moving, some door do1 not fully closed, no emergency
10. Close door stopped too soon when moving and no emergency

### Gaps (train)
- **The controlled door is not bound.** Conditions say "some door do1", but the control action `Open door` / `Close door` is not tied to do1 (the door this controller drives): the model has no "the relevant instance" (open question 3 of `instance-quantification.md`). A per-door controller reads as if any door could satisfy the condition.
- **Single train, no platform entity.** "Train position: aligned with platform" stays an aggregate enum; a Platform entity with a relationship "Train aligned with Platform" and a refinement from it would need quantified refinement rules, which `expand` / `refineUca` do not substitute.
- **Persons are not modelled.** "Person in the doorway" is a Door state; a Person entity (many) with "in doorway of" would add nothing the UCAs use.
- **H-1 is a state approximation** of an event ("doors close on a person"): person in doorway while the door is not fully open.
- **H-2 and the evacuation exception:** the hazard has no "unless evacuation" (it is only in the constraint); UCA 1 and 2 add `no emergency`.
- **Timing** (UCA 5 "more than TBD seconds") only in the free-text `override`; conditions cannot express durations.
- **Upstream controller ("?")** has no beliefs or variables (source leaves it open).

## pub-vtt-am (VTT STPA Guide)

**Already formal:** nothing: losses, hazards, constraints, control structure, 6 UCAs (all `override` text), scenarios, requirements. No entities, variables, conditions or beliefs.

**Added**
- Entities: `Autonomous machine` (one, per the assumption), `Person` (many), `Vehicle or object` (many), `Environment`; nodes linked to them.
- World variables: `AM motion` (stationary / moving), `AM location` (inside / outside operating area), `Route progress` (at a route point / on the path), `Environmental condition` (normal / extraordinary).
- Relationship predicates: `Person near Autonomous machine`, `Vehicle or object in the way of Autonomous machine` (many to one).
- Refined variable `Operational context` (normal / adjusted driving required): any of some person near, some object in the way, extraordinary environment.
- `Movement` control action `affects` motion, location, route progress.
- Signals on the feedbacks into the traffic and mission control system (status / diagnostic: motion; machine location: location, progress; tagged entities: near, in the way; environmental conditions) and, through them, its beliefs about all of these (so no `context-unrepresented`).
- Conditions:

| | in words |
|---|---|
| H-1 people nearby | AM moving and some person pe1 near the AM |
| H-2 objects in the way | AM moving and some vehicle or object ve1 in the way of the AM |
| H-3 leaves the area | AM location is outside the operating area |
| UCA-1 drive command to incorrect route point | *in words:* the route point in the command is not the intended one |
| UCA-2 not adjusted to context | operational context requires adjusted driving AND *in words:* the command is not adjusted to it |
| UCA-3 no drive command while on the path | route progress is on the path |
| UCA-4 env. data does not match | AM moving AND *in words:* the data does not match the actual condition |
| UCA-5 no env. data in extraordinary conditions | environmental condition is extraordinary |
| UCA-6 env. data too late | AM moving and environmental condition extraordinary (interpretation) |

### Gaps (VTT)
- **Command / data correctness is not a state.** UCA-1, UCA-2 (second part) and UCA-4 are about a parameter of the action matching reality; the model has no way to compare "what was sent" with a world variable, so they use conditions in words. (An internal variable "selected route point" would pretend the controller knows what is intended.)
- **UCA-6 context is a guess.** The source gives only "too late to adjust accordingly while driving"; extraordinary conditions are our reading (scenarios mention extraordinary-condition parameters).
- **Hazard refinements** (crosswalk, on the path, near but not on the road, insufficient deceleration) are only in the description. They could be sub-hazards, but UCAs link to H-1, which would then be non-leaf; so not done. Person location (crosswalk / path / nearby) is not a variable either.
- **Disjunction in contexts:** conditions are all-of, so "people nearby OR objects OR extraordinary" needs the refined variable. Its rule uses quantified, named conditions; `refineUca` / `expand` do not substitute through them, and refinement-rule editors do not offer instance names.
- **Tags and detectability** (worn, battery, swapped) are scenario content with no variables; beliefs about "an entity is a person" vs. "an AM" are not modelled.
- **Not formalized:** `Mission plans`, `Remote control`, `Movement` have no UCAs in the source; AM, supervisor and remote operator have no beliefs (info only). Speed and distances (brake path, dimensions) are not variables since the source gives no values.
- **Other controllers' contexts** (time, unit "AM is driving" duration) — "while driving" is `AM motion = moving`, a loose reading of "driving".
