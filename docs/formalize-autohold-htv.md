# Formalizing the Handbook examples Auto-Hold and HTV

Code: `src/model/formalize/autohold-htv.ts` (`formalizeAutoholdHtv(id, project)`, pure, finds items by title), tests in `autohold-htv.test.ts`.
Input: `handbookExampleProject('hb-autohold' | 'hb-htv')`. Output: same project plus a domain model, typed world variables, hazard `conditions`,
UCA `conditions` (the Handbook sentence in `override` is replaced by the generated one; the original is kept in the UCA `notes`; whatever cannot be formal stays in
`context`), controller beliefs, signals on the feedback arrows of the figure, and `affects` on control actions. Validation: no errors, and none of
`context-unrepresented`, `instance-name`, `instance-unnamed`, `context-not-world`. Remaining findings are the ones every text-only Handbook example has
(no constraints, no scenarios) plus `belief-no-source` infos avoided by a definition saying the figure shows no feedback.

The Handbook table gives only text; every variable, state, threshold and relationship below is **our reading** of it, not the Handbook's.

## 1. Automotive Auto-Hold (Table C.1)

### Domain model
| Entity | Variables (type) |
|---|---|
| Vehicle | Wheel speed (km/h), Motion (stopped / moving; refined from Wheel speed > 0), Time at rest (s, timer), Slipping (bool), Time slipping (s, timer), Safe distance (m), Inclination (deg), Torque needed to hold (Nm) |
| Braking system (part of Vehicle) | Brake hold (released / holding), Brake pressure (bar), Maximum brake pressure (bar), Holding torque (Nm) |
| Propulsion system (part of Vehicle) | Propulsive torque (Nm) |
| Driver | Accelerator pedal (released / applied), Brake pedal (released / applied), Present (bool) |
| Nearby object, **many** | (none) |
| Region, **many** | Dangerous (bool) |
| Rel. Vehicle `is near` Nearby object (1 : *) | predicate, Distance (m) |
| Rel. Vehicle `is located in` Region (1 : *) | predicate |

Controller AH (internal, layer q): **AH state** (disabled / standby / active), Required time at rest (s), Maximum time to hold (s), Maximum time to add pressure (s); the three
durations are the Handbook's "required / TBD" values, declared but without a value.
Beliefs of AH: one per world variable used in a UCA context. Signals: Wheel speed, Accelerator pedal, Present, Inclination on the figure's feedbacks. The CA
"Enable/Disable AH, Brake pedal on/off" (Driver → AH) `affects` AH state and AH's belief about Brake pedal (the figure has no feedback for them).

### Hazards
* H-1 `Distance of some Nearby object ne1 is less than Safe distance` (variable comparison `other`, `some` with an instance name).
* H-2 `Dangerous of some Region ar1 is true and Vehicle is located in ar1` (`as` / `same`).

### UCAs (generated sentences; "AH" = Auto-Hold (AH) Module; TBD marks implicit additions)
| UCA | Conditions | Free-text remainder |
|---|---|---|
| HOLD N | Motion = stopped, Brake pedal = released, AH state ≠ disabled (added: implicit) | "the vehicle has just stopped" (event) |
| HOLD P | Accelerator pedal = applied | |
| HOLD P | AH state = disabled | |
| HOLD P | Motion = moving | |
| HOLD P | Brake pedal = released | |
| HOLD T early | Motion = stopped, Time at rest < Required time at rest | |
| HOLD T late | AH state = standby, Brake pedal = released, Time at rest > Maximum time to hold | "the vehicle begins to roll" (event) |
| RELEASE N | Accelerator = applied, AH state = active (added) | |
| RELEASE P | Accelerator = released, AH state = active (added) | |
| RELEASE T early | Accelerator = applied, Propulsive torque < Torque needed to hold | |
| RELEASE T late | Accelerator = applied, Propulsive torque > Holding torque | |
| ADD. PRESSURE N | Slipping = true, AH state = active | |
| ADD. PRESSURE P | AH state ≠ active | |
| ADD. PRESSURE P | Brake pressure > Maximum brake pressure | |
| ADD. PRESSURE T late | Slipping = true, AH state = active, Time slipping > Maximum time to add pressure | |

## 2. H-II Transfer Vehicle (Table C.2)
The Handbook defines no hazard here; the example's placeholder H-1 is formalized.

### Domain model
| Entity | Variables |
|---|---|
| HTV | Mode (approach / hold / free drift / abort / retreat; free drift = deactivated, hold = stopped), Distance to ISS (m), Time in hold (min, timer), Time in free drift (min, timer) |
| ISS | Safe separation (m), Emergency condition (bool) |
| Capture box | (none) |
| Rel. HTV `is in` Capture box, HTV `is captured by` ISS, ISS `is in the abort path of` HTV (all 1 : 1) | predicates |

No entity is `many` (one HTV, one ISS); only one HTV is in the scenario. Controller ISS (crew): internal Maximum time to command Free Drift (X), Maximum time to capture (X)
(minutes, TBD). Beliefs of the crew about every world variable used; signals Mode, Distance to ISS, In capture box, Emergency condition on the HTV feedback.

### Hazard
H-1 `Distance to ISS is less than Safe separation and HTV is captured by ISS is false`.

### UCAs
| UCA | Conditions | Free-text remainder |
|---|---|---|
| Abort N | Emergency = true, Mode ≠ abort | |
| Abort P | captured = true | |
| Abort P | ISS in abort path of HTV | |
| Abort T late | Emergency = true | "too late to avoid collision" |
| Abort T early | captured = true | "before the capture is released" |
| Free Drift N | Mode = hold, HTV in Capture box | |
| Free Drift P | Mode = approach | |
| Free Drift T late | Mode = hold, Time in hold > Maximum time to command Free Drift (X) | |
| Free Drift T early | Mode = approach | "before the HTV stops" |
| Capture N | HTV in Capture box, Mode = free drift | |
| Capture P | Mode ≠ free drift | |
| Capture P | Mode = abort | |
| Capture P | none | "the movement of the arm is excessive or insufficient (...)" |
| Capture T late | Mode = free drift, Time in free drift > Maximum time to capture (X) | |
| Capture T early | Mode ≠ free drift | "before the HTV is deactivated" |
| Capture S | Emergency = true | "the capture continues" |

## 3. Gaps (what the model cannot express, what it would need)

1. **Events vs. states.** Contexts like "vehicle stops", "begins to roll", "emergency condition exists", "before HTV stops / is released / deactivated" are transitions or orderings. A condition holds in a state only; the event goes to `context` text. Needed: an event/transition condition ("became true", "just before X") or "since" operators.
2. **Time, timers, deadlines.** "Required time at rest", "more than X minutes after", "TBD seconds" are modelled as a timer world variable (Time at rest, Time in hold, ...) compared with an internal parameter variable. Needed: timers as first-class (started by an event, reset by another), the unsafe *delay* between two events as a condition ("t_action − t_event > X"), and time-bounded traces. A world timer is an artificial variable; nothing says how it advances.
3. **Parameter values / TBD.** Thresholds (X, TBD, safe distance, specification limits) can be declared as variables (range, unit) but cannot carry a value or an "unknown / TBD" mark, so conditions on them cannot be evaluated in traces; also no place for a project constant (only variable definition text).
4. **Derived quantities.** Safe distance, Safe separation, Torque needed to hold (depends on inclination and mass), hold torque vs. propulsive torque, "specs exceeded" are inputs without a defining formula. Refinement `rules` only map states to states over comparisons with constants or other variables (`other`); there is no arithmetic (`f(speed, mass, slope)`, `speed × time`).
5. **Magnitude / parameters of the control action itself.** "Capture with excessive/insufficient movement", "insufficient pedal pressure" concern the value or quality of the action, not the context. Conditions describe states before the action; there are no action parameters (kept as `context` text, no conditions at all).
6. **Disjunction.** Hazard and UCA `conditions` are an implicit AND; "collide **or** violate separation" or "stops **or** is slowed" need several UCAs / sub-hazards. Condition `Group`s (any/all) exist only in refinement rules.
7. **"Unless" / exceptions and normal-operation clauses.** Implicit guards were added by us (AH state ≠ disabled, = active) as ordinary conditions; the Handbook text does not say them. No way to mark a condition as an assumption added by the analyst rather than from the source.
8. **Controller modes and its own state.** AH state is an internal variable, which works, but the link "AH holds" → AH state becomes active is not stated (the CA affects only world / beliefs / internal variables in a list; no transition effects). Same for the HTV Mode changing as an effect of Abort / Free Drift (the CA `affects` the Mode but not to which value).
9. **Inputs that arrive via control actions.** The driver's Brake pedal on/off and Enable/Disable reach AH through a control action (Driver → AH), not a feedback, so no signal can carry them (signals belong to feedbacks); the belief has no `belief-no-source`-clean source and is explained in its definition. Needed: signals on control actions or "input" arrows.
10. **Quantities / rates / sequences of values.** Wheel torque vs. engine torque ("engine torque exceeds wheel torque") is an ambiguous Handbook phrase, loosely read as propulsive torque > holding torque. "Slipping", "begins to roll", "approaching" are trends over time; there is no rate / derivative or history ("was stopped, now moving").
11. **Counts and multi-instance structure.** Nearby objects and regions are `many` and work for H-1/H-2 (some, named instance, same instance in a relationship). Not needed for HTV, but "the relevant object" / "the one nearest" and "all objects farther than X" (quantifier plus ordering) cannot be said.
12. **Phase / mission mode.** Landing / takeoff / approach / capture phases (HTV: approach, hold, ..., plus "during RTO", "during normal takeoff" in other tables) are modelled as an ordinary enum (HTV Mode); there is no phase/mode construct that scopes whole sets of UCAs, so each UCA repeats it.
13. **Single-instance predicates read oddly.** A predicate without `many` reads "HTV is captured by ISS is true"; the bare-predicate wording ("HTV is captured by ISS") only appears for many ends.
14. **Hazard semantics.** Hazards are "all conditions hold in a state"; the Handbook hazard "does not maintain safe distance" is really a duty over time. AH H-1/H-2 are only loose state approximations (any distance below Safe distance), and the dynamics of *entering* a region (an event) are lost. HTV H-1 uses `captured = false` to exclude the intended contact; the Handbook states no hazard.
15. **Ambiguities of the Handbook text** carried over unchanged: "HOLD when driver is not applying brake" is normal AH behaviour in the first place; "Abort when HTV is captured" and "too early before capture is released" overlap; Free Drift P/T-early and Capture P/T-early coincide formally (Mode = approach / ≠ free drift) and differ only by the ordering text.
