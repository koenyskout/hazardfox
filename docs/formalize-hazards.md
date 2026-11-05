# Formalizing the Handbook hazard examples

Code: `src/model/formalize/hazards.ts` (`formalizeHazardExample(id, project)`), test: `hazards.test.ts` (validate has no findings at all, conditions complete and value-checked, serialize round trip). Instance names (`ac1`, ...) come from `nameAllInstances`/explicit names.

Rules of thumb used: one `many` entity per kind of thing of which several matter; relationships (with their predicate) for "x near/over/in y"; relationship variables (`distance`, `required separation`) compared with each other via `other` + `oSame`/`oSame2`; a **refined world variable** (`rules` with `anyOf`) when the Handbook hazard is a disjunction (AND-only `conditions` otherwise cannot say "or"); abstract enum variables (`control = lost`) where the hazard names a state we cannot decompose. Parent hazards (Radiation H1 "Wrong dose ...") are left without conditions: they are the OR of their four sub-hazards.

## Nuclear power plant
Model: Reactor core (temperature, maximum safe temperature, operating state, shutdown required), Radioactive material (many; location), Plant equipment (many; utilization in % of rated limit).
- H-1 Release: location of some Radioactive material is outside containment
- H-2 Temperature too high: temperature is greater than maximum safe temperature (variable comparison)
- H-3 Beyond limits: utilization of some Plant equipment is greater than 100 %
- H-4 Reactor shut down: operating state is shut down AND shutdown required is false

## Aircraft
Model: Aircraft (many: control, flight phase, structural load, fire, damage, airframe integrity [refined: lost if load > 100 % OR fire OR damage], cabin pressure altitude, smoke, cabin temperature, cabin air [refined: harmful if altitude > 10000 ft OR smoke OR temperature outside 5-40 degC]); Person (many); Terrain or obstacle (many); Movement area (many); Ground object (many); relationships "flies near" (Aircraft-Aircraft: horizontal/vertical separation and required separation), "flies over" (Aircraft-Terrain: clearance, minimum safe clearance), "is aboard", "carries" (Movement area-Aircraft), "is close to" (Aircraft-Ground object: distance, minimum safe distance).
- H-1 Separation: some Aircraft ac1 flies near Aircraft ac2 AND horizontal separation < required horizontal separation AND vertical separation < required vertical separation (both of the pair)
- H-2 CFIT: some Aircraft ac3 flies over Terrain te1 AND clearance < minimum safe clearance AND control of ac3 is controlled AND flight phase of ac3 is not one of {ground, landing}
- H-3 Loss of control: flight phase of some Aircraft ac4 is not ground AND control of ac4 is lost
- H-4 Airframe integrity: airframe integrity of some Aircraft is lost
- H-5 Environment: some Person pe1 is aboard Aircraft ac5 AND cabin air of ac5 is harmful
- H-6 Departs designated surface: flight phase of some Aircraft ac6 is ground AND no Movement area carries ac6 (quantifier none on the first end, second end referred to by name)
- H-7 Too close on ground: flight phase of some Aircraft ac7 is ground AND ac7 is close to Ground object ob1 AND distance < minimum safe distance of the pair

## Radiation therapy
Model: Radiation beam; Patient (many: delivered dose, prescribed dose, irradiated site, target site [both body-region enums], is the scheduled patient); Nonpatient (many); Treatment equipment (many; utilization); Moving equipment part (many; motion) and Person (many) with relationship "is near" (distance, minimum safe distance); relationships "Beam irradiates Patient / Nonpatient".
- H-1.1 Right patient, right dose, wrong location: beam irradiates some Patient pa1 AND scheduled AND delivered dose = prescribed dose AND irradiated site is not target site (same pa1 throughout)
- H-1.2 / H-1.3: dose is not prescribed dose, site is / is not target site
- H-1.4 Wrong patient: beam irradiates some Patient pa1 AND pa1 is the scheduled patient is false
- H-2 Nonpatient exposed: beam irradiates some Nonpatient
- H-3 Equipment stress: utilization of some Treatment equipment > 100 %
- H-4 Nonradiological injury: some moving part mp1 is moving AND is near Person pr1 AND distance < minimum safe distance

## Military aviation
Model: Own aircraft (control, structural load, fire, damage, airframe integrity [refined]); Object (many) with "is near" (separation, minimum separation); Ordnance (many: detonation command, detonation, launch command, launch state); Protected asset (many: status) with "Ordnance detonates within lethal radius of Asset".
- H-1 Separation: Own aircraft is near some Object ob1 AND separation < minimum separation
- H-2 control is lost; H-3 airframe integrity is lost
- H-4 Uncommanded detonation: detonation of some Ordnance is detonated AND detonation command of it is not commanded
- H-5 Uncommanded launch: launch state of some Ordnance is launched AND launch command of it is not commanded
- H-6 Collateral damage: some Ordnance or3 detonates within lethal radius of Protected asset pa1 AND status of pa1 is not legitimate target AND detonation of or3 is detonated
- H-7 Non-deployment: launch command of some Ordnance is commanded AND launch state of it is on aircraft

## Automotive
Model: Vehicle (speed, maximum safe speed, lateral/longitudinal acceleration and their maxima, operating envelope [refined: exceeded if speed OR lateral OR longitudinal exceeds its maximum], fire, cabin temperature, occupants can escape); Nearby object (many) with "is near" (distance, safe distance); Region (many; danger) with "is in"; Occupant (many; exposure [refined: harmful if fire OR temperature outside 5-40 degC OR cannot escape OR a Door closes on the occupant]); Door (many) with "closes on" Occupant.
- H-1 Vehicle is near some Nearby object AND distance < safe distance
- H-2 Vehicle is in some Region re1 AND danger of re1 is dangerous
- H-3 operating envelope is exceeded
- H-4 exposure of some Occupant is harmful

## Gaps (what could not be expressed, or only loosely)
1. **Disjunction.** `conditions` are AND only. Hazards that are "A or B or C" (airframe integrity, cabin environment, operating envelope, occupant exposure) work only through a refined world variable with `rules`; the hazard then names the abstract variable. Needed: OR/groups in hazard conditions (as rules have), so no artificial variable is needed. Parent hazards (Radiation H-1) cannot be "OR of children".
2. **Rules cannot bind instances.** Refinement rules (and their editor) have no names/quantifiers, so "occupant oc1 and a door that closes on *oc1*" or "airframe integrity of ac1 from load of ac1" relies on an implicit same-instance reading of attributes of one entity. Needed: instance binding (or quantifiers) in rule conditions.
3. **Quantities, rates, time.** Hazards that are about rates or durations ("unnecessary stress", dose rate, uncommanded = no command *before* the event, "when commanded" = within some time, timing of dose delivery in Radiation H-1, accumulated dose) are states only. Approximations: utilization > 100 %, `detonation command` as a state next to `detonation`. Needed: temporal conditions (before/within/for at least) or event variables.
4. **Events vs states.** Release, detonation, launch, departure from a surface are events; they appear as the state after the event ("detonated", "outside containment").
5. **Tolerances.** Radiation "right dose" is `delivered dose = prescribed dose` (exact equality); needs tolerance (within +-5 %). Needed: comparison with margin/ratio, or `between` against another variable.
6. **Derived and parametrized limits.** Safe distance, safe speed, required separation, minimum clearance, "design limit" depend on other variables (speed, friction, airspace, object type). Modelled as plain variables with a text definition and compared via `other`; the dependency is not machine-readable. Needed: a function/lookup in `rules` (numeric expressions).
7. **Several kinds of limit.** "Equipment operated beyond limits" (temperature, pressure, flow, ...) is one abstract `utilization` percentage.
8. **Purpose and necessity.** "Unnecessarily exposed", "unnecessary stress", "unnecessary shutdown", "uncommanded", "collateral" (vs legitimate target) depend on intent. Approximated by a boolean (`shutdown required`), a predicate (beam irradiates a Nonpatient, any exposure counts) or a status enum. Aircraft H-2 excludes intended terrain contact by flight phase (not in {ground, landing}).
9. **Abstract states.** `control = lost` (Aircraft H-3, Military H-2) cannot be decomposed into a flight-envelope or controllability criterion without a quantitative aircraft model.
10. **Location as values.** Radiation "wrong location" is a body-region enum (compared with `other`); real location is coordinates/geometry, volume overlap. Positions in general (separation as scalar distance, "within lethal radius") have no geometry.
11. **Distinct instances within one condition.** `some Aircraft ac1 flies near Aircraft ac2` (self relationship): ac2 may equal ac1; "another" is only produced across conditions. Needed: distinctness for both ends of one condition (or ac1 != ac2).
12. **"For the same instance, no related instance exists".** `no Movement area carries ac6` works only because the relationship was declared in the direction Area -> Aircraft (the first many end takes the quantifier, the second is referred to by name). The inverse direction cannot say "no area for ac6". Needed: quantifier choice per end.
13. **Counts and aggregates.** "More than one", "all engines", total dose from several sources, number of people aboard: only some/every/none. (Not needed by these hazards directly, but e.g. aggregate cabin exposure of all occupants is not expressible.)
14. **Generalization.** Radiation H-4 "Persons" (patient or nonpatient) needed a separate Person entity; there is no specialization (Patient is-a Person), so the same Person cannot be both. Same for Military Object / Aircraft or Aircraft / Ground object (an aircraft is also an object in the ground-collision hazard; the two entities are unrelated in the model).
15. **Probabilities.** None of the hazards needs them, but "can lead to" / possible loss (hazard vs. loss) is not modelled by conditions (hazards are states, not likelihoods).
16. **Negated relationships** work (`= false`/`none`), but only through the predicate of the same relationship; "is not scheduled" needed a boolean attribute (`is the scheduled patient`) rather than a relationship Session -> Patient because the relationship's first many end would take the quantifier.
17. **Wording.** Comparisons on relationship variables read clumsily ("ac1 and ac2 where horizontal separation is less than required horizontal separation of ac1 and ac2"); a comparison of two attributes of the same instance needs a declared name and a `use` of it.
