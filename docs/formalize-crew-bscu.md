# Formalizing the Handbook examples hb-crew (Table C.3) and hb-bscu (Table C.4)

Code: `src/model/formalize/crew-bscu.ts` (`formalizeCrewBscu(id, project)`, pure), test `crew-bscu.test.ts`.
Both examples share one domain model and the Handbook's hazards (H4 and H4.1 to H4.6, shown as H-1 and H-1.1 to H-1.6 in HazardFox). Per UCA: `override` is cleared; the Handbook wording (with the parenthesised consequences) moves to the UCA `description`; the formal part is `conditions`, the part that cannot be formalized (time bounds, CA parameters, "or" lists) stays free text in `context`. Both combine in `generateUcaText`. Beliefs for every world variable used in a UCA context are added to the issuing controller (Flight crew / BSCU Autobrake), so `context-unrepresented` does not fire. Validation: no errors, no instance or representability warnings (only the usual "no system constraint / no loss scenarios" ones). Both CAs also get `affects` (Brake force, Autobrake setting, BSCU power).

## Domain model

| Entity | Variables |
|---|---|
| Aircraft | Flight phase {approach, landing roll, taxi, lined up for takeoff, takeoff roll, rejected takeoff, climb-out}; Ground speed (range kt, 0..); Acceleration (range m/s²); V1 passed (bool); Safe taxi speed reached (bool, TBD threshold); Thrust mode {idle, normal, TOGA}; Location {airborne, runway, active taxiway, clear}; Landing gear {extended, retracting, retracted}; Deceleration sufficient, Acceleration sufficient, Braking symmetric, Acceleration symmetric (bool abstractions) |
| Wheel braking system (in Aircraft) | BSCU power {on, off}; WBS behavior {normal, abnormal}; Autobrake setting {disarmed, low, medium, high, maximum}; Autobrake needed, Anti-skid needed, Normal braking mode needed (bool); refined: BSCU function needed := Autobrake needed or Anti-skid needed; Braking function needed := Normal braking mode, Autobrake or Anti-skid needed (rules `anyOf`) |
| Wheel (**many**, in Aircraft) | Brake force (range 0..100 %); Wheel rotating (bool) |
| Runway | Surface condition {dry, wet, contaminated} |
| Object (**many**) | none (only relationships) |
| Relationships | Aircraft `is too close to` Object (1 to *); Aircraft `would collide with` Object (1 to *) (predicates are the boolean world variables) |

## Hazards (conditions)
- H4 Aircraft too close to other objects: Aircraft is too close to some Object o1.
- H4.1 insufficient deceleration: Flight phase is one of {landing roll, rejected takeoff, taxi} and Deceleration sufficient is false.
- H4.2 asymmetric deceleration: Brake force of some Wheel w1 is greater than 0 % and Braking symmetric is false.
- H4.3 deceleration after V1: V1 passed is true and phase is one of {takeoff roll, rejected takeoff} and Brake force of some Wheel w1 > 0 %.
- H4.4 excessive acceleration while taxiing: phase is taxi and (in words) Acceleration exceeds the limit for taxiing (TBD).
- H4.5 asymmetric acceleration: Acceleration symmetric is false and phase is one of {taxi, takeoff roll}.
- H4.6 insufficient acceleration at takeoff: phase is takeoff roll and Acceleration sufficient is false.

## UCAs, hb-crew (generated sentence = conditions + context)
1. N manual braking: phase in {landing roll, RTO, taxi}, Deceleration sufficient false; ctx "Autobrake is not providing braking or is providing insufficient braking".
2. P insufficient pedal pressure: phase in {landing roll, RTO, taxi}; ctx "pedal pressure is insufficient (TBD)".
3. P excessive pressure: phase landing roll; ctx "pedal pressure is excessive".
4. P during normal takeoff: phase takeoff roll.
5. T before touchdown: phase approach.
6. T too late (TBD): phase in {landing roll, RTO, taxi}, Aircraft would collide with some Object o1; ctx "already later than TBD to avoid the collision".
7. S stops before safe taxi speed: Safe taxi speed reached false, phase in {landing roll, RTO}.
8. S too long: Ground speed 0 kt, Location in {runway, active taxiway}.
9. N arm before landing: phase approach, Autobrake setting disarmed.
10. N arm prior to takeoff: phase in {taxi, lined up}, setting disarmed.
11. P not to maximum during takeoff: phase in {lined up, takeoff roll}; ctx "level armed is below maximum".
12. P too high deceleration rate: phase approach, Surface condition in {wet, contaminated}; ctx "rate too high for the runway condition".
13. T arm too late (TBD): phase approach, setting disarmed; ctx "less than TBD seconds remain before touchdown".
14. N disarm during TOGA: Thrust mode TOGA, setting not disarmed.
15. P disarm during landing or RTO: phase in {landing roll, RTO}, setting not disarmed.
16. T disarm late after (a), (b), (c): setting not disarmed; ctx the TBD time and the "or" list (descent rate, visibility, etc.).
17. N power off in abnormal WBS: BSCU power on, WBS behavior abnormal.
18, 19. P power off when Autobrake needed (the Handbook lists it twice): power on, Autobrake needed, WBS normal.
20. P power off when Anti-skid needed: power on, Anti-skid needed, WBS normal.
21. T power off too late (TBD): power on, WBS abnormal; ctx time.
22. T power off too early: power on, BSCU function needed (refined); ctx "Autobrake or Anti-Skid behavior not yet completed".
23. N power on: power off, Braking function needed (refined), WBS normal.
24. T power on too late: as 23; ctx time.

## UCAs, hb-bscu
1. N during RTO to V1: phase RTO, V1 passed false.
2. N in landing roll when armed: phase landing roll, Autobrake setting not disarmed.
3. N after takeoff (lock wheels): phase climb-out, Landing gear not retracted, Wheel rotating of some Wheel w1.
4. P excessive braking commands: landing roll; ctx level excessive (TBD).
5. P during takeoff: takeoff roll.
6. P insufficient level: landing roll; ctx level insufficient (TBD).
7. T before touchdown: approach.
8. T more than TBD s after touchdown: landing roll, armed; ctx time.
9. T before wheels left ground, RTO not requested: takeoff roll; ctx "RTO has not been requested".
10. T more than TBD s after V1 in RTO: RTO, V1 passed true; ctx time.
11. S stops before TBD taxi speed: landing roll, Safe taxi speed reached false.
12. S too long (TBD s): landing roll, Ground speed 0, Location runway; ctx duration.
13. S brake until < TBD s before touchdown: approach, Brake force of some Wheel w1 > 0 %; ctx "continues until ...".

## GAPS (what could not be expressed)
1. **Time bounds / durations** ("more than TBD seconds after touchdown / V1", "too late (TBD)", "until less than TBD s before touchdown"): conditions are state only, no "time since event" or timer variable. Kept as free text in `context` in about 12 UCAs. Needs: elapsed-time-since-event conditions or timer variables.
2. **Events vs states**: touchdown, V1 crossing, "RTO requested", "arm command" are events. Approximated as states (phase, V1 passed); "RTO has not been requested" is only approximated by phase takeoff roll vs rejected takeoff.
3. **Phases / modes**: no mode construct; modeled as one enum variable `Flight phase` with hand-set boundaries (landing roll ends at "safe taxi speed", itself a TBD).
4. **TBD thresholds**: safe taxi speed, descent rate limit (fps), visibility (ft), pedal pressure, acceleration limit. Numeric conditions need a number; I used boolean abstractions (`Safe taxi speed reached`) with the threshold only in prose, or text conditions. No named "TBD" constant that can be filled in later and flows into conditions.
5. **Control-action parameters**: pedal pressure, autobrake level / deceleration rate, brake command level ("insufficient", "excessive", "not to maximum level"). A UCA context can only hold world state, not the value of the CA itself; kept in `context` words. Needs: CA parameters usable in the UCA sentence.
6. **Disjunction in UCA contexts**: `conditions` is all-of. "(a) descent rate > TBD or (b) visibility < TBD or (c) etc." (UCA crew-16) and "Autobrake not providing braking or insufficient" (crew-1) stay as words / are covered by a derived variable. Workarounds that worked: refined variables with `anyOf` rules (BSCU function needed, Braking function needed). Needs: any-of groups on UCAs, or splitting into several UCAs.
7. **Derived / relational quantities**: "deceleration sufficient", "acceleration sufficient", "would collide with", "too close to", "can stop in remaining runway" depend on speed, distance, mass, friction. Modeled as opaque boolean world variables/predicates with definition text; no function or constraint behind them, so a trace cannot compute them.
8. **Comparison between instances**: asymmetric braking is "left wheel force differs from right wheel force". `other` compares a variable with another variable, not two instances of the same one, so `Braking symmetric` is an opaque boolean on Aircraft (the per-wheel forces cannot refine it). Wheel side (left/right) not modeled for the same reason.
9. **Mapping tables / "unless"**: "autobrake level too high for runway condition" is a table lookup over setting × surface; only Surface condition (wet or contaminated) is formal, "too high" is prose. No "unless / exception" clauses were needed here.
10. **Sequences / history**: "powers off too early before Autobrake behavior is completed", "arm before landing" require "not yet completed" or "has previously happened"; approximated by a needed-flag and prose.
11. **Duplicate UCAs in the Handbook** (crew-18/19) get identical conditions; "or about to be used" is folded into the definition of `Autobrake needed`.
12. Consequences in the Handbook wording ("resulting in tire burst ...") are not context; they are kept in the UCA description only.
13. Not done: beliefs are plain copies of the world variables (no "unknown" state), no feedback/signals (the examples have no feedback arrows), no scenarios or traces.
