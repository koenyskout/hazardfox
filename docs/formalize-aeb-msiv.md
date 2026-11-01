# Formalizing pub-aeb and pub-thomas-msiv

Code: `src/model/formalize/aeb-msiv.ts` (`formalizeAebMsiv(id, project)`, pure, idempotent, only adds missing data; texts, overrides and existing items are untouched). Test: `aeb-msiv.test.ts` (no validation errors, all leaf hazards and UCAs have complete valid conditions, UCA contexts are represented by beliefs, idempotence, round trip, prints the sentences).

## pub-aeb (Waterloo AEB)

**Already formal:** nothing (no domain model, no variables, no conditions, no beliefs).

**Added**
- Entities: Autonomous vehicle (AV); Forward mobile object (FMO, `many`); Prohibited area (PA, `many`).
- World variables (ranges, min 0, no upper bound, SI units): AV: Speed, Braking deceleration, Minimum safe distance (MSD), Collision imminent braking distance (CIBd), Required deceleration rate (RDR), Occupant g-force, Occupant g-force safety threshold; FMO and PA: Distance to AV.
- Abstraction `Object within CIBd` (boolean, refinement rule: true when some FMO distance < CIBd or some PA distance < CIBd; else false).
- Nodes Vehicle / Environment get their entities; BFC `affects` Braking deceleration.
- Signals: Vehicle sensor data (speed, deceleration), AD sensor data (distances), State estimate (speed, distances); beliefs in the state estimator (automatic) and in the AEB controller (speed, distances, CIBd, MSD, RDR, Object within CIBd).

**Hazards (leaf)**
- H-1: distance to AV of some FMO fmo1 is less than MSD.
- H-2: distance to AV of some PA pa1 is less than MSD.
- H-3: occupant g-force is greater than the occupant g-force safety threshold.

**UCAs**
- UCA-1 (BFC not provided): Object within CIBd is true.
- UCA-2 (BFC provided too weak): Object within CIBd is true, and (free-text context) the commanded braking force is below the RDR.

## pub-thomas-msiv (nuclear MSIV)

**Already formal:** entity Steam generator system with five enum world variables (SG tube, feedwater pipe, steam line, support systems, SG pressure), the Operator's beliefs about them, and conditions on UCA-1 to UCA-4 and UCA-6 (UCA-1/2 only the support-systems part; UCA-3/4/6 complete; UCA-5 none). No hazard conditions, no signals.

**Added**
- Abstractions on the SG system (boolean, refinement rules): `Rupture or leak` (SGTR, feedwater leak or steam line leak) and `Secondary-side leak` (feedwater or steam line leak). Needed because a UCA context is a conjunction and the source says "SGTR *or* leak".
- Entities and variables for the hazard states: Primary system (Radioactive material: released outside primary system / contained); Reactor (Reactor temperature: too high / acceptable; Reactor operation: operating / planned shutdown / unplanned shutdown); Plant equipment (`many`; Operation: within / beyond limits); MSIV (Position: open / closed). The Close MSIV actions to PM / MSIV affect MSIV position.
- Operator beliefs about both abstractions (their value follows from the beliefs about the parts).
- Signals: process indications (SG pressure, tube, feedwater, steam line) and outside information (support systems) to the Operator.

**Hazards (leaf)**
- H-1: radioactive material is released outside the primary system.
- H-2: reactor temperature is too high.
- H-3: operation of some plant equipment eq1 is beyond limits.
- H-4: reactor operation is unplanned shutdown.

**UCAs**
- UCA-1 (not provided): Rupture or leak is true, support systems adequate.
- UCA-2 (not provided): Secondary-side leak is true, SG tube not ruptured (Table 28 rows 11-16), support systems inadequate.
- UCA-3 (provided): SG tube ruptured, support systems inadequate (unchanged).
- UCA-4 (too early): SG pressure high (unchanged).
- UCA-5 (too late): Rupture or leak is true; the lateness is free-text context only.
- UCA-6 (provided): no tube rupture, no feedwater leak, no steam line leak (unchanged).

## GAPS

1. **Timing.** "Too late" (Thomas UCA-5) and "too early" have no formal form: there is no time/duration condition, so lateness is free text. "Time since leak onset > t" needs a time variable and a source threshold.
2. **Command parameters.** AEB UCA-2 is about the value of BFC (force below RDR); control action parameters cannot appear in conditions. Approximated by free text (the world-side effect "braking deceleration < RDR" would be circular as context).
3. **Disjunction in a context.** Contexts are conjunctions; "FMO or PA" and "SGTR or leak" needed refinement variables (`Object within CIBd`, `Rupture or leak`). The many-ness of FMO/PA then lives in the refinement rules, not in the UCA sentence ("Object within CIBd is true"), and `refineUca` does not expand quantified rule conditions.
4. **Derived thresholds.** MSD, CIBd, RDR are functions of speed (and braking capability); the model can only name them as range variables with a definition and compare with `other`, not compute them. They are world variables although partly controller computations (could be internal state instead).
5. **One UCA, two hazards.** AEB UCA-1/2 link to both H-1 and H-2 but their context cannot say which object type it is (the abstraction merges them).
6. **Numeric limits** (g threshold, speeds, distances) are not in the sources; ranges have only min 0, and the g-force threshold is a variable, not a number.
7. **Single instance for Thomas SG/MSIV.** The source analyses one generic loop; making steam generators / MSIVs `many` would require inventing which MSIV a Close MSIV addresses (close the affected one, leave healthy loops open). Only plant equipment (H-3) is `many`.
8. **"Unplanned" shutdown** is a state of Reactor operation, a coarse stand-in for the intent/cause of a shutdown.
9. **Signals about leaks** (Thomas): the process feedback carries pressure, water level and radioactivity; signals about the leak variables directly are a loose approximation (the leak is only indirectly indicated, which is the inference gap the source discusses).
10. **Not formalized:** scenario traces and AEB causal factors (object predicted path, spoofed speed, security aspects), the state estimator as a controller with its own contexts, the Thomas PS/DAS/NSSC/PM contexts (summarised in the thesis, no UCAs here).
