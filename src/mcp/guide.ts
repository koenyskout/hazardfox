/** Method guidance for agents, condensed from the STPA Handbook and the conventions of the tool. */
export const GUIDE = `# Performing an STPA / STPA-Sec analysis with HazardFox

The analysis is stored in one project file; every write tool saves immediately. Items are addressed by derived labels
(L-1, H-1.2, SC-3, E-1, V-2, CS-1, CA-1, FB-1, UCA-4, LS-4.1, LS-CA-1.1, R-1, A-1) that follow position and may change after
inserts/moves/deletes: always use labels from the latest result, or "$alias" inside one create_items call.
Aliases only live inside one create_items call; across calls refer to items by label, id or exact unique title (create_items returns the new labels and ids).
UCA labels are numbered globally in control-action order (then creation order within a control action), so create the UCAs of one control action together; inserting shifts later labels.
Free text may mention items as @[H-1]. Create items as status "draft"; leave approval to humans.

Workflow: project_summary -> update_project_meta (system description!) -> steps 1-4 below -> validate -> export_report.
Formalism is optional: everything can be done in plain text (titles, descriptions, free-text UCA context). Add variables, conditions, beliefs/signals and traces only when the user wants that precision, or when they are already in use in the project; never force them.
Ask the user for missing system knowledge instead of inventing it; mark assumptions with kind "assumption".

## Step 1 - Purpose of the analysis
- loss: something of value to stakeholders that is lost ("Loss of life or injury to people", "Loss of sensitive information").
  Not a component, failure or cause.
- hazard: a system-level STATE that, with worst-case environment, leads to a loss ("Aircraft violate minimum separation").
  Not a cause or component failure; no consequence ("leading to ..."); no vague words (unsafe, unintended). Link with lossLinks.
  Optional conditions: logical definition over world variables (same format as UCA conditions, all must hold; an entry {any: true, of: [conditions]} means any one of them, groups nest). Optional variables: world (domain) variables describing the system/environment state that makes it hazardous (e.g. flow).
  Nest sub-hazards with parent; they inherit the losses. Set security=true for STPA-Sec hazards (adversary-related).
- constraint: invert a hazard: "<System> must <condition>". One+ hazards in hazards; link LEAF hazards only; no design solutions.

## Step 2 - Control structure
- domain model (optional but needed for context-aware UCAs): entity (operations; its attributes are its world variables), relationship (from/to entities; a time-varying predicate R(from, to): creating one also creates its untitled boolean world variable, usable in UCA contexts and traces), variable
  (type enum with states[], boolean, or range with min/max/unit). Keep the layers apart (layer field):
  domain = actual world state (parent = entity); signal = what a feedback carries (parent = feedback, about = the world variable it observes);
  belief = the controller's process model (parent = controller node, about = the world variable it stands for); internal = controller mode/timer (parent = node).
  definition (rich text) states the meaning: the abstraction for derived world variables (moving := |speed| > 0), the interface semantics of a signal, the
  world predicate a belief designates. A belief is updated by signals about the same world variable (or one of its parts) on feedback into its controller.
  Hierarchical (refined) world variables: rules [{state, when: {any, of: [conditions over lower-level world variables, or nested groups]}}] tried in order, otherwise = the value when none holds
  (Emergency = evacuation required when Fire = true; … otherwise no emergency). Traces compute such variables (and controller beliefs about them) from their parts;
  A UCA refined by substituting such rules into its context links its higher-level UCA in refines.
- node: controller | process | external (sensors and actuators are NOT nodes); nest with parent (subsystems). entities optionally links the domain entities it represents (a process may comprise several).
- ca (control action): from controller node to node; named as a verb phrase ("Set rate"); optional "actuator" names the actuator that
  carries it out; affects lists the variables it changes (world variables, or internal/belief variables of the receiving controller). feedback: from node to node; its signals are variables with parent = the feedback; optional "sensor" names the sensor producing it.

## Step 3 - Unsafe control actions
For every control action consider all four guide words: not-provided, provided, too-early-late, stopped-too-soon (see uca_coverage). stopped-too-soon / applied-too-long only applies to continuous control actions (those with a duration); for instantaneous/discrete ones (e.g. separate Start and Stop commands, a toggle) set duration "instantaneous" and it is skipped automatically; not every combination needs a UCA: mark one that makes no sense with the control action field notApplicable ([{guide, reason}]).
A UCA = controller + guide + control action + CONTEXT that makes it unsafe + hazards. Express context as conditions
[{variable, op, state, to?}] over domain (world) or controller-internal variables and/or free text in context; every world variable in a context needs a belief in the controller (otherwise it cannot tell the contexts apart). op is = or ≠ (default =); enum variables also allow in / not in with set: [states] instead of state; range variables also allow < ≤ > ≥, between and not between (state = lower, to = upper). state must be a state of an enum variable, true/false for boolean, a number for range. A condition can also be in words: {text, op?} (op = or ≠, i.e. holds / does not hold), for something not modelled as a variable; in traces it is a true/false lane \"text:<text>\". Conditions and context are combined in the generated sentence. One control action and one type per UCA.
The context is a real world state, not the controller's belief ("when it incorrectly believes ..." is a cause -> scenario).
Link leaf hazards in hazards; write the controller constraint in "constraint" ("Controller must not ..."). The UCA sentence is generated.
A guide word that cannot be unsafe needs no UCA; set notApplicable on the control action via update_items ([{guide, reason}]) or note why in an assumption. UCAs are listed by list_items with the generated sentence as title; every UCA needs its own constraint text.

## Step 4 - Loss scenarios (causes)
- scenarioType "uca": why the UCA occurs (cause: controller-failure | control-algorithm | process-model | feedback | other-controller).
  Hazards come from the UCA.
- scenarioType "ca": why a control action is not executed properly (cause: actuator | controlled-process | delivery | receiver |
  environment); needs ca and own hazards.
- trace (optional): a finite run that exhibits the scenario: lanes (variables shown), steps with values set at that step (carried forward) and events
  on control actions / feedback. The UCA context must hold at the step where the action is (not) sent. Diagnosis: signal ≠ world → feedback;
  signal = world but belief ≠ signal → process-model; belief = world and still unsafe → control-algorithm.
- Write a scenario as a story (factors combined), not a list of single faults. Optional element = control structure node of the cause.
- STPA-Sec: adversarial=true, stride (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of
  privilege) and threat describing the attacker action. severity/likelihood integers 0-5 (0 = unrated).
- requirement (type requirement|mitigation): verifiable, one thing, derived from constraints / UCAs / scenarios via sources.

## Conventions
- UCAs and constraints link only leaf hazards; scenarios of type uca inherit hazards.
- Deleting a control action deletes its UCAs and scenarios; use delete_items dry_run first.
- Prefer batch calls (create_items with aliases). After writing, read the returned issues and fix warnings.
`
