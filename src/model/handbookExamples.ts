import { projectBuilder } from './build'
import type { GuideWord, Id, NodeRole, Project } from './types'

/** Worked examples from the appendices of the STPA Handbook (Appendix A: hazard lists, Appendix B: control structures, Appendix C: UCA tables). */
interface Spec {
  name: string
  description: string
  losses: [key: string, title: string][]
  /** key, title, linked loss keys, parent key (sub-hazards inherit their parent's losses) */
  hazards: [key: string, title: string, losses: string[], parent?: string][]
  /** control structure from Appendix B: key, title, role, parent key (a container); links: from, to, ca|fb, label */
  nodes?: [key: string, title: string, role: NodeRole, parent?: string][]
  links?: [from: string, to: string, type: 'ca' | 'fb', title: string][]
  controller?: string
  process?: string
  cas?: string[]
  /** control action, N/P/T/S = not provided / provided / too early-late / stopped too soon, text, hazard keys */
  ucas?: [ca: string, type: 'N' | 'P' | 'T' | 'S', text: string, hazards: string[]][]
}

const GUIDE: Record<'N' | 'P' | 'T' | 'S', GuideWord> = { N: 'not-provided', P: 'provided', T: 'too-early-late', S: 'stopped-too-soon' }
const A = 'Handbook, Appendix A: '
const C = 'Handbook, Appendix C: '
const B = 'Handbook, Appendix B: '

const AIRCRAFT_LOSSES: Spec['losses'] = [['L1', 'Loss of life or injury to people'], ['L2', 'Loss of or damage to aircraft'], ['L3', 'Loss of or damage to objects outside the aircraft'], ['L4', 'Loss of mission'], ['L5', 'Loss of customer satisfaction']]
const WBS_HAZARDS: Spec['hazards'] = [
  ['H4', 'Aircraft comes too close to other objects on the ground', ['L1', 'L2', 'L5']],
  ['H4.1', 'Deceleration is insufficient upon landing, rejected takeoff, or during taxiing', [], 'H4'],
  ['H4.2', 'Asymmetric deceleration maneuvers aircraft toward other objects', [], 'H4'],
  ['H4.3', 'Deceleration occurs after V1 point during takeoff', [], 'H4'],
  ['H4.4', 'Excessive acceleration provided while taxiing', [], 'H4'],
  ['H4.5', 'Asymmetric acceleration maneuvers aircraft toward other objects', [], 'H4'],
  ['H4.6', 'Acceleration is insufficient during takeoff', [], 'H4'],
]


const struct = (id: string, label: string, description: string, nodes: Spec['nodes'], links: Spec['links']): (typeof HANDBOOK_EXAMPLES)[number] => ({ id, label: label + ' (control structure)', spec: { name: label + ' (Handbook example)', description: B + description, losses: [], hazards: [], nodes, links } })

const STRUCTURES = [
  struct('hb-cs-itp', 'In-Trail Procedure (ITP)', 'Figure B.1, aircraft In-Trail Procedure with ADS-B; the flight crews at the top of the figure are cut off in the Handbook and are not shown.', [
    ['I', 'ITP Aircraft', 'controller'], ['IE', 'ITP Equipment', 'controller', 'I'], ['IT', 'TCAS / Transponder', 'sensor', 'I'], ['IG', 'GNSSU Receiver', 'sensor', 'I'], ['IA', 'ADS-B', 'sensor', 'I'],
    ['R', 'Reference Aircraft', 'process'], ['RT', 'TCAS / Transponder', 'sensor', 'R'], ['RO', 'Other Sensors', 'sensor', 'R'], ['RG', 'GNSSU Receiver', 'sensor', 'R'], ['RA', 'ADS-B', 'sensor', 'R'], ['G', 'GPS Constellation', 'external'],
  ], [['IT', 'RT', 'ca', 'TCAS Interrogations'], ['RT', 'IT', 'fb', 'TCAS Interrogations response'], ['RA', 'IA', 'fb', 'Ref Aircraft State (speed, heading, alt, etc) Information'], ['G', 'IG', 'fb', 'Time/State Data'], ['G', 'RG', 'fb', 'Time/State Data'], ['IG', 'IA', 'fb', 'GNSSU data'], ['RG', 'RA', 'fb', 'GNSSU data']]),
  struct('hb-cs-missile', 'Ballistic missile defense', 'Figure B.2, missile defense system.', [
    ['CA', 'Command Authority', 'external'], ['O', 'Operators', 'controller'], ['EW', 'Early Warning System', 'external'], ['RD', 'Radar', 'sensor'], ['FC', 'Fire Control', 'controller'], ['LS', 'Launch Station', 'controller'], ['L', 'Launcher', 'actuator'],
    ['IS', 'Interceptor Simulator', 'process'], ['FL', 'Flight Computer', 'controller'], ['IH', 'Interceptor Hardware', 'process'],
  ], [
    ['CA', 'O', 'ca', 'Doctrine, Engagement Criteria, Training, TTP, Workarounds'], ['O', 'CA', 'fb', 'Exercise Results, Readiness, Status, Wargame Results'],
    ['O', 'FC', 'ca', 'Engage Target, Operational Mode Change, Readiness State Change, Weapons Free, Weapons Hold'], ['FC', 'O', 'fb', 'Operational Mode, Readiness State, System Status, Track Data, Weapon and System Status'],
    ['FC', 'EW', 'ca', 'Status Request'], ['EW', 'FC', 'fb', 'Launch Report, Status Report, Heartbeat'], ['FC', 'RD', 'ca', 'Radar Tasking, Readiness Mode Change, Status Request'], ['RD', 'FC', 'fb', 'Status, Track Data'],
    ['FC', 'LS', 'ca', 'Fire Disable, Fire Enable, Operational Mode Change, Readiness State Change, Interceptor Tasking, Task Cancellation'], ['LS', 'FC', 'fb', 'Command Response, System Status, Launch Report'],
    ['LS', 'L', 'ca', 'Launch Position, Stow Position, Perform BIT'], ['L', 'LS', 'fb', 'BIT Results, Launcher Position'],
    ['LS', 'IS', 'ca', 'Abort, Arm, BIT command, Task Load, Launch, Operating Mode, Power, Safe, Software Updates'], ['IS', 'LS', 'fb', 'Acknowledgements, BIT results, Health and Status'],
    ['LS', 'FL', 'ca', 'Abort, Arm, BIT Command, Task Load, Launch, Operating Mode, Power, Safe, Software Updates'], ['FL', 'LS', 'fb', 'Acknowledgements, BIT results, Health and Status'],
    ['FL', 'IH', 'ca', 'Arm, Safe, Ignite'], ['IH', 'FL', 'fb', 'BIT Info, Safe and Arm Status'], ['IH', 'LS', 'fb', 'Break wires, Safe and Arm Status, Voltages'],
  ]),
  struct('hb-cs-proton', 'Proton therapy (high level)', 'Figure B.3, high-level control structure of the proton therapy facility.', [['TD', 'Treatment Definition', 'controller'], ['TV', 'Treatment Delivery', 'controller'], ['P', 'Patient', 'process']], [
    ['TD', 'TV', 'ca', 'Therapeutic Requirements: Treatment Specifications (fraction definition, target positioning information, steering file)'], ['TD', 'TV', 'ca', 'Capability Upgrade Requests'], ['TV', 'TD', 'fb', 'QA results, Patient physiognomy change'],
    ['TV', 'P', 'ca', 'Patient Preparation, Beam Creation and Delivery'], ['P', 'TV', 'fb', 'Patient well-being, Patient physiognomy changes'], ['P', 'TD', 'fb', '(delayed) Patient health outcome'],
  ]),
  struct('hb-cs-proscan', 'Proton therapy (PROSCAN)', 'Figure B.4, the Treatment Delivery part of B.3 in detail.', [
    ['TD', 'Treatment Definition – D0', 'controller'], ['TV', 'Treatment Delivery – D1', 'controller'], ['DT', 'PROSCAN Design Team', 'controller', 'TV'], ['OM', 'Operations Management', 'controller', 'TV'], ['M', 'Maintenance', 'controller', 'TV'],
    ['OP', 'Operators', 'controller', 'TV'], ['MT', 'Medical Team', 'controller', 'TV'], ['F', 'PROSCAN facility (physical actuators and sensors, automated controllers)', 'actuator', 'TV'], ['P', 'Patient', 'process'],
  ], [
    ['TD', 'DT', 'ca', 'Capability upgrade requests'], ['TD', 'OM', 'ca', 'Treatment specifications (fraction definition, patient positioning information, beam characteristics)'], ['OM', 'TD', 'fb', 'QA results'], ['P', 'TD', 'fb', '(delayed) Cure evaluation, Prognosis'],
    ['OM', 'DT', 'fb', 'Problem reports, Incidents, Change requests, Performance audits'], ['DT', 'OM', 'ca', 'Revised operating procedures'], ['DT', 'F', 'ca', 'Software revisions, Hardware modifications'],
    ['OM', 'M', 'ca', 'Work orders, Resources'], ['M', 'OM', 'fb', 'Problem reports, Change requests'], ['OM', 'OP', 'ca', 'Procedures'], ['OP', 'OM', 'fb', 'Problem reports, Change requests'], ['OM', 'MT', 'ca', 'Procedures'], ['MT', 'OM', 'fb', 'Problem reports, Change requests'],
    ['M', 'F', 'ca', 'Hardware replacements'], ['F', 'M', 'fb', 'Test results'], ['OP', 'F', 'ca', 'Start treatment, Interrupt treatment'], ['F', 'OP', 'fb', 'QA result, Sensor info'], ['MT', 'OP', 'ca', 'Room clear'],
    ['MT', 'F', 'ca', 'Patient position, Interrupt treatment'], ['F', 'MT', 'fb', 'Position, Movement'], ['P', 'F', 'ca', 'Panic button'], ['F', 'P', 'ca', 'Patient Position, Beam Creation and Delivery'], ['MT', 'P', 'ca', 'Patient position'], ['P', 'MT', 'fb', 'Patient well being, Patient physiognomy changes'],
  ]),
  struct('hb-cs-fda', 'FDA drug approval and safety', 'Figure B.5, simplified: the figure distinguishes control and information channels; only the main actors and the channels between them are modelled here.', [
    ['CG', 'Congress', 'controller'], ['HHS', 'Dept. of Health and Human Services', 'controller'], ['FDA', 'FDA', 'controller'], ['PC', 'Pharmaceutical companies', 'controller'], ['AC', 'Academically-affiliated researchers and FDA advisory committees', 'external'],
    ['PY', 'Payers', 'external'], ['HP', 'Healthcare providers/prescribers', 'controller'], ['PT', 'Patients', 'process'], ['PA', 'Patient advocacy groups', 'external'], ['PI', 'Patient\'s medical insurance', 'external'],
  ], [
    ['CG', 'FDA', 'ca', 'Political pressures, mandate (e.g., FDAAA), budget allocation'], ['FDA', 'CG', 'fb', 'Reports'], ['CG', 'HHS', 'ca', 'Budget'], ['HHS', 'CG', 'fb', 'Reports, priorities'], ['HHS', 'FDA', 'ca', 'Budget allocation'], ['FDA', 'HHS', 'fb', 'Budget needs'],
    ['FDA', 'PC', 'ca', 'Warning letters, New drug approval'], ['PC', 'FDA', 'fb', 'Adverse events, New drug applications'], ['PC', 'FDA', 'ca', 'User fees'], ['FDA', 'AC', 'ca', 'Membership decisions'], ['AC', 'FDA', 'fb', 'Recommendations'],
    ['PC', 'AC', 'ca', 'Res/consult funds/agenda'], ['AC', 'PC', 'fb', 'Outputs of research/advising'], ['PC', 'PY', 'ca', 'Inclusion on formulary, Price'], ['PY', 'HP', 'ca', 'Payment, reimbursement, policy, formularies'], ['HP', 'PY', 'fb', 'Case reports'],
    ['PC', 'HP', 'ca', 'Detailing, advertising and access to drugs'], ['HP', 'PC', 'fb', 'Adverse events'], ['HP', 'PT', 'ca', 'Prescriptions'], ['PT', 'HP', 'fb', 'Symptoms, perceived benefits and side effects'],
    ['PI', 'PT', 'ca', 'Reimbursement'], ['PT', 'PI', 'fb', 'Claim'], ['PY', 'PI', 'ca', 'Insurance policy'], ['PC', 'PA', 'ca', 'Funds'], ['PA', 'CG', 'fb', 'Public group pressures'], ['PA', 'PT', 'fb', 'Direct to consumer advertising'],
  ]),
  struct('hb-cs-acc', 'Adaptive Cruise Control (ACC)', 'Figure B.6; dashed boxes in the figure (pedals, switch, sensors, actuators) are modelled as actuators and sensors.', [
    ['D', 'Driver', 'controller'], ['MS', 'Multi-function switch', 'actuator'], ['IC', 'Instrument Cluster', 'sensor'], ['AP', 'Accelerator Pedal', 'actuator'], ['BP', 'Brake Pedal', 'actuator'], ['ACC', 'Adaptive Cruise Control (ACC) Module', 'controller'],
    ['BCM', 'Brake Control Module', 'controller'], ['R', 'Radar', 'sensor'], ['PCM', 'Powertrain Control Module', 'controller'], ['SB', 'Service Brakes', 'actuator'], ['WSS', 'Wheel Speed Sensor', 'sensor'], ['ETB', 'Electronic Throttle Body', 'actuator'], ['V', 'Vehicle', 'process'], ['LV', 'Lead Vehicle', 'external'],
  ], [
    ['D', 'MS', 'ca', 'On, Off, Set, Cancel, Inc, Dec, Etc.'], ['MS', 'ACC', 'ca', 'On, Off, Set, Cancel, Inc, Dec, Etc.'], ['ACC', 'IC', 'fb', 'ACC On, Off, Canceled, Active'], ['IC', 'D', 'fb', 'ACC On, Off, Canceled, Active'],
    ['D', 'AP', 'ca', 'Accelerate Cmd'], ['AP', 'PCM', 'ca', 'Acceleration Signal'], ['ACC', 'PCM', 'ca', 'Acceleration Signal'], ['D', 'BP', 'ca', 'Brake Cmd'], ['BP', 'BCM', 'ca', 'Braking Signal'],
    ['BCM', 'ACC', 'fb', 'Braking status, Vehicle speed'], ['R', 'ACC', 'fb', 'Distance to lead vehicle'], ['LV', 'R', 'fb', 'Distance to lead vehicle'],
    ['BCM', 'SB', 'ca', 'Brake Cmd'], ['SB', 'V', 'ca', 'Friction'], ['V', 'WSS', 'fb', 'Wheel Speed'], ['WSS', 'BCM', 'fb', 'Wheel Speed'], ['PCM', 'ETB', 'ca', 'Throttle opening'], ['ETB', 'PCM', 'fb', 'Throttle position'], ['ETB', 'V', 'ca', 'Friction'],
  ]),
]

export const HANDBOOK_EXAMPLES: { id: string; label: string; spec: Spec }[] = [
  {
    id: 'hb-nuclear', label: 'Nuclear power plant (hazards)', spec: {
      name: 'Nuclear power plant (Handbook example)', description: A + 'Nuclear Power Plant.',
      losses: [['L1', 'People injured or killed'], ['L2', 'Environment contaminated'], ['L3', 'Equipment damage (economic loss)'], ['L4', 'Loss of electrical power generation']],
      hazards: [['H1', 'Release of radioactive materials', ['L1', 'L2', 'L3', 'L4']], ['H2', 'Reactor temperature too high', ['L1', 'L2', 'L3', 'L4']], ['H3', 'Equipment operated beyond limits', ['L3', 'L4']], ['H4', 'Reactor shut down', ['L4']]],
    },
  },
  {
    id: 'hb-aircraft', label: 'Aircraft (hazards)', spec: {
      name: 'Aircraft (Handbook example)', description: A + 'Aircraft.',
      losses: [['L1', 'Loss of life or serious injury to people'], ['L2', 'Damage to the aircraft or objects outside the aircraft']],
      hazards: [
        ['H1', 'Aircraft violate minimum separation standards in flight', ['L1', 'L2']], ['H2', 'Controlled flight of aircraft into terrain', ['L1', 'L2']], ['H3', 'Loss of aircraft control', ['L1', 'L2']],
        ['H4', 'Aircraft airframe integrity is lost', ['L1', 'L2']], ['H5', 'Aircraft environment is harmful to human health', ['L1', 'L2']],
        ['H6', 'Aircraft departs designated taxiway, runway, or apron on ground', ['L1', 'L2']], ['H7', 'Aircraft comes too close to other objects on the ground', ['L1', 'L2']],
      ],
    },
  },
  {
    id: 'hb-radiation', label: 'Radiation therapy (hazards)', spec: {
      name: 'Radiation therapy (Handbook example)', description: A + 'Radiation Therapy.',
      losses: [['L1', 'The patient is injured or killed from overexposure or undertreatment'], ['L2', 'A nonpatient is injured or killed by radiation'], ['L3', 'Damage or loss of equipment'], ['L4', 'Physical injury to a patient or nonpatient during treatment']],
      hazards: [
        ['H1', 'Wrong dose: Dose delivered to patient is wrong in either amount, location, or timing', ['L1']],
        ['H1a', 'Right patient, right dose, wrong location', [], 'H1'], ['H1b', 'Right patient, wrong dose, right location', [], 'H1'], ['H1c', 'Right patient, wrong dose, wrong location', [], 'H1'], ['H1d', 'Wrong patient', [], 'H1'],
        ['H2', 'A nonpatient is unnecessarily exposed to radiation', ['L2']], ['H3', 'Equipment is subject to unnecessary stress', ['L3']], ['H4', 'Persons are subjected to nonradiological injury', ['L4']],
      ],
    },
  },
  {
    id: 'hb-military', label: 'Military aviation (hazards)', spec: {
      name: 'Military aviation (Handbook example)', description: A + 'Military Aviation (the Handbook calls the losses "mishaps").',
      losses: [['M1', 'Loss of or damage to the aircraft or equipment on the aircraft'], ['M2', 'Serious injury or fatality to personnel'], ['M3', 'Inability to complete the mission']],
      hazards: [
        ['H1', 'Violation of minimum separation standards from fixed or moving objects', ['M1', 'M2', 'M3']], ['H2', 'Inability to control the aircraft', ['M1', 'M2', 'M3']], ['H3', 'Loss of airframe integrity', ['M1', 'M2', 'M3']],
        ['H4', 'Uncommanded detonation', ['M1', 'M2', 'M3']], ['H5', 'Uncommanded launch', ['M1', 'M2', 'M3']], ['H6', 'Collateral damage or friendly fire', ['M1', 'M2', 'M3']],
        ['H7', 'Non-deployment (detonation and/or launch) of ordinance when commanded', ['M3']],
      ],
    },
  },
  {
    id: 'hb-automotive', label: 'Automotive (hazards)', spec: {
      name: 'Automotive (Handbook example)', description: A + 'Automotive.',
      losses: [['L1', 'Loss of life or serious injury to people'], ['L2', 'Damage to the vehicle or objects outside the vehicle']],
      hazards: [
        ['H1', 'Vehicle does not maintain safe distance from nearby objects', ['L1', 'L2']], ['H2', 'Vehicle enters dangerous area/region', ['L1', 'L2']],
        ['H3', 'Vehicle exceeds safe operating envelope for environment (speed, lateral/longitudinal forces)', ['L1', 'L2']],
        ['H4', 'Vehicle occupants exposed to harmful effects and/or health hazards (e.g. fire, excessive temperature, inability to escape, door closes on passengers, etc.)', ['L1', 'L2']],
      ],
    },
  },
  ...STRUCTURES,
  {
    id: 'hb-autohold', label: 'Automotive Auto-Hold (UCA table C.1)', spec: {
      name: 'Automotive Auto-Hold (Handbook example)',
      description: C + 'Figure C.1. The Handbook does not define H-1 and H-2 for this table; the automotive hazards of Appendix A are used here, and the losses are those of Appendix A.',
      losses: [['L1', 'Loss of life or serious injury to people'], ['L2', 'Damage to the vehicle or objects outside the vehicle']],
      hazards: [['H1', 'Vehicle does not maintain safe distance from nearby objects', ['L1', 'L2']], ['H2', 'Vehicle enters dangerous area/region', ['L1', 'L2']]],
      nodes: [['D', 'Driver', 'external'], ['AH', 'Auto-Hold (AH) Module', 'controller'], ['V', 'Physical Vehicle', 'process'], ['B', 'Braking System', 'actuator', 'V'], ['P', 'Propulsion System', 'actuator', 'V'], ['E', 'Environment & Other Drivers', 'external']],
      links: [
        ['D', 'AH', 'ca', 'Enable/Disable AH, Brake pedal on/off'], ['AH', 'D', 'fb', 'AH Enabled/Disabled'],
        ['AH', 'B', 'ca', 'HOLD command'], ['AH', 'B', 'ca', 'RELEASE command'], ['AH', 'B', 'ca', 'ADDITIONAL PRESSURE command'], ['B', 'AH', 'fb', 'Wheel speed'],
        ['P', 'AH', 'fb', 'Accel pos., PRNDL'], ['V', 'AH', 'fb', 'Driver presence, Inclination'],
        ['D', 'B', 'ca', 'Brake'], ['B', 'D', 'fb', 'Pedal response'], ['D', 'P', 'ca', 'Accelerate, Shift'], ['V', 'D', 'fb', 'Vehicle speed, Visual feedback, etc.'], ['E', 'D', 'fb', 'Visual cues, Physical feedback'],
      ],
      ucas: [
        ['HOLD command', 'N', 'AH does not provide HOLD when vehicle stops and brake pedal released', ['H1', 'H2']],
        ['HOLD command', 'P', 'AH provides HOLD when driver is applying the accelerator', ['H1']],
        ['HOLD command', 'P', 'AH provides HOLD when AH is DISABLED', ['H1']],
        ['HOLD command', 'P', 'AH provides HOLD when vehicle is moving', ['H1']],
        ['HOLD command', 'P', 'AH provides HOLD when driver is not applying brake', ['H1', 'H2']],
        ['HOLD command', 'T', 'AH provides HOLD too early before the required time at rest has been met', ['H1']],
        ['HOLD command', 'T', 'AH provides HOLD too late after vehicle stops, begins to roll', ['H1']],
        ['RELEASE command', 'N', 'AH does not provide RELEASE when driver applies accelerator pedal', ['H1', 'H2']],
        ['RELEASE command', 'P', 'AH provides RELEASE when driver is not applying accelerator', ['H1', 'H2']],
        ['RELEASE command', 'T', 'AH provides RELEASE too early before there is sufficient wheel torque', ['H1', 'H2']],
        ['RELEASE command', 'T', 'AH provides RELEASE too late after accelerator applied, engine torque exceeds wheel torque', ['H1', 'H2']],
        ['ADDITIONAL PRESSURE command', 'N', 'AH does not provide ADDITIONAL PRESSURE when vehicle is slipping and AH is active', ['H1', 'H2']],
        ['ADDITIONAL PRESSURE command', 'P', 'AH provides ADDITIONAL PRESSURE when AH is not active', ['H1', 'H2']],
        ['ADDITIONAL PRESSURE command', 'P', 'AH provides ADDITIONAL PRESSURE when brake system specs are exceeded', ['H1', 'H2']],
        ['ADDITIONAL PRESSURE command', 'T', 'AH provides ADDITIONAL PRESSURE too late after vehicle is slipping', ['H1', 'H2']],
      ],
    },
  },
  {
    id: 'hb-htv', label: 'H-II Transfer Vehicle (UCA table C.2)', spec: {
      name: 'H-II Transfer Vehicle (Handbook example)',
      description: C + 'Table C.2, UCAs for autonomous H-II Transfer Vehicle (HTV) operations. The Handbook does not define H-1 or the losses for this table; the hazard and loss here are placeholders.',
      losses: [['L1', 'Loss of or damage to the ISS or the HTV']],
      hazards: [['H1', 'HTV and ISS collide or violate safe separation', ['L1']]],
      nodes: [['J', 'JAXA Ground Station', 'controller'], ['N', 'NASA Ground Station', 'controller'], ['I', 'International Space Station (ISS)', 'controller'], ['H', 'Autonomous H-II Transfer Vehicle (HTV)', 'process']],
      links: [
        ['J', 'N', 'ca', 'Abort/Retreat/Hold, FRGF Separation'], ['N', 'J', 'fb', 'Acknowledgements, HTV Status'],
        ['N', 'I', 'ca', 'Abort/Retreat/Hold, FRGF Separation Enable/Hold, FRGF Separation'], ['I', 'N', 'fb', 'HTV Mode, HTV Fault Status, Crew status, Telemetry'],
        ['I', 'H', 'ca', 'Abort'], ['I', 'H', 'ca', 'Free Drift'], ['I', 'H', 'ca', 'Capture'], ['I', 'H', 'ca', 'FRGF Separation Enable/Inhibit, FRGF Separation'],
        ['H', 'I', 'fb', 'HTV Mode, HTV Fault Status, Position (visual), Speed (visual)'],
      ],
      ucas: [
        ['Abort', 'N', 'ISS crew does not provide Abort Cmd when emergency condition exists', ['H1']],
        ['Abort', 'P', 'ISS crew provides Abort Cmd when HTV is captured', ['H1']],
        ['Abort', 'P', 'ISS crew provides Abort Cmd when ISS is in Abort path', ['H1']],
        ['Abort', 'T', 'ISS crew provides Abort Cmd too late to avoid collision', ['H1']],
        ['Abort', 'T', 'ISS crew provides Abort Cmd too early before capture is released', ['H1']],
        ['Free Drift', 'N', 'ISS crew does not provide Free Drift Cmd when HTV is stopped in capture box', ['H1']],
        ['Free Drift', 'P', 'ISS crew provides Free Drift Cmd when HTV is approaching ISS', ['H1']],
        ['Free Drift', 'T', 'ISS crew provides Free Drift Cmd too late, more than X minutes after HTV stops', ['H1']],
        ['Free Drift', 'T', 'ISS crew provides Free Drift Cmd too early before HTV stops', ['H1']],
        ['Capture', 'N', 'ISS crew does not perform Capture when HTV is in capture box in free drift', ['H1']],
        ['Capture', 'P', 'ISS crew performs Capture when HTV is not in free drift', ['H1']],
        ['Capture', 'P', 'ISS crew performs Capture when HTV is aborting', ['H1']],
        ['Capture', 'P', 'ISS crew performs Capture with excessive/insufficient movement (can impact HTV, cause collision course)', ['H1']],
        ['Capture', 'T', 'ISS crew performs Capture too late, more than X minutes after HTV deactivated', ['H1']],
        ['Capture', 'T', 'ISS crew performs Capture too early before HTV deactivated', ['H1']],
        ['Capture', 'S', 'ISS crew continues performing Capture too long after emergency condition exists', ['H1']],
      ],
    },
  },
  {
    id: 'hb-crew', label: 'Aircraft flight crew and wheel braking (UCA table C.3)', spec: {
      name: 'Flight crew and wheel braking system (Handbook example)',
      description: C + 'Table C.3, UCAs for the aircraft flight crew related to the wheel braking system. Hazards and losses are those of the Handbook\'s chapter 2 aircraft example (H4-n in the table = H-4.n).',
      losses: AIRCRAFT_LOSSES, hazards: WBS_HAZARDS,
      controller: 'Flight crew', process: 'Wheel braking system (WBS)', cas: ['Manual braking via brake pedals', 'Arm autobrake', 'Disarm autobrake', 'Power off BSCU', 'Power on BSCU'],
      ucas: [
        ['Manual braking via brake pedals', 'N', 'Crew does not provide manual braking during landing, RTO, or taxiing when Autobrake is not providing braking or is providing insufficient braking', ['H4.1']],
        ['Manual braking via brake pedals', 'P', 'Crew provides manual braking with insufficient pedal pressure', ['H4.1']],
        ['Manual braking via brake pedals', 'P', 'Crew provides manual braking with excessive pedal pressure (resulting in loss of control, passenger/crew injury, brake overheating, brake fade or tire burst during landing)', ['H4.1', 'H4.5']],
        ['Manual braking via brake pedals', 'P', 'Crew provides manual braking during normal takeoff', ['H4.2', 'H4.5']],
        ['Manual braking via brake pedals', 'T', 'Crew provides manual braking before touchdown (causes wheel lockup, loss of control, tire burst)', ['H4.1']],
        ['Manual braking via brake pedals', 'T', 'Crew provides manual braking too late (TBD) to avoid collision or conflict with another object (can overload braking capability given aircraft weight, speed, distance to object (conflict), and tarmac conditions)', ['H4.1', 'H4.5']],
        ['Manual braking via brake pedals', 'S', 'Crew stops providing manual braking command before safe taxi speed (TBD) is reached', ['H4.1', 'H4.4']],
        ['Manual braking via brake pedals', 'S', 'Crew provides manual braking too long (resulting in stopped aircraft on runway or active taxiway)', ['H4.1']],
        ['Arm autobrake', 'N', 'Crew does not arm Autobrake before landing (causing loss of automatic brake operation when spoilers deploy; crew reaction time may lead to overshoot)', ['H4.1', 'H4.5']],
        ['Arm autobrake', 'N', 'Crew does not arm Autobrake prior to takeoff (resulting in insufficient braking during rejected takeoff, assuming that Autobrake is responsible for braking during RTO after crew throttle down)', ['H4.2']],
        ['Arm autobrake', 'P', 'Crew does not arm Autobrake to maximum level during takeoff (assumes that maximum braking force is necessary for rejected takeoff)', ['H4.2']],
        ['Arm autobrake', 'P', 'Crew arms Autobrake with too high of a deceleration rate for runway conditions (resulting in loss of control and passenger or crew injury)', ['H4.1', 'H4.5']],
        ['Arm autobrake', 'T', 'Crew provides arm command too late (TBD) (resulting in insufficient time for BSCU to apply brakes)', ['H4.1', 'H4.5']],
        ['Disarm autobrake', 'N', 'Crew does not disarm Autobrake during TOGA (resulting in loss of acceleration during (re)takeoff)', ['H4.1', 'H4.2', 'H4.5']],
        ['Disarm autobrake', 'P', 'Crew disarms Autobrake during landing or RTO (resulting in loss of automatic brake operation when spoilers deploy; crew reaction time may lead to overshoot)', ['H4.1', 'H4.5']],
        ['Disarm autobrake', 'T', 'Crew disarms Autobrake more than TBD seconds after (a) aircraft descent exceeds TBD fps, (b) visibility is less than TBD ft, (c) etc. (resulting in either loss of control of aircraft or loss of acceleration during (re)takeoff)', ['H4.1', 'H4.2', 'H4.5']],
        ['Power off BSCU', 'N', 'Crew does not power off BSCU in the event of abnormal WBS behavior (needed to enable alternate braking mode)', ['H4.1', 'H4.2', 'H4.5']],
        ['Power off BSCU', 'P', 'Crew powers off BSCU when Autobraking is needed and WBS functioning normally', ['H4.1', 'H4.5']],
        ['Power off BSCU', 'P', 'Crew powers off BSCU when Autobrake is needed (or about to be used) and WBS is functioning normally', ['H4.1', 'H4.5']],
        ['Power off BSCU', 'P', 'Crew powers off BSCU when Anti-Skid functionality is needed (or will be needed) and WBS is functioning normally', ['H4.1', 'H4.5']],
        ['Power off BSCU', 'T', 'Crew powers off BSCU too late (TBD) to enable alternate braking mode in the event of abnormal WBS behavior', ['H4.1', 'H4.5']],
        ['Power off BSCU', 'T', 'Crew powers off BSCU too early before Autobrake or Anti-Skid behavior is completed when it is needed', ['H4.1', 'H4.5']],
        ['Power on BSCU', 'N', 'Crew does not power on BSCU when Normal braking mode, Autobrake, or Anti-Skid is to be used and WBS functioning normally', ['H4.1', 'H4.5']],
        ['Power on BSCU', 'T', 'Crew powers on BSCU too late after Normal braking mode, Autobrake, or Anti-Skid is needed', ['H4.1', 'H4.5']],
      ],
    },
  },
  {
    id: 'hb-bscu', label: 'Aircraft BSCU Autobrake (UCA table C.4)', spec: {
      name: 'BSCU Autobrake (Handbook example)',
      description: C + 'Table C.4, UCAs for the aircraft Brake System Control Unit (BSCU) Autobrake. Hazards and losses are those of the Handbook\'s chapter 2 aircraft example (H4-n in the table = H-4.n).',
      losses: AIRCRAFT_LOSSES, hazards: WBS_HAZARDS,
      controller: 'BSCU Autobrake', process: 'Wheel braking system (WBS)', cas: ['Brake command'],
      ucas: [
        ['Brake command', 'N', 'Autobrake does not provide Brake command during RTO to V1 (resulting in inability to stop within available runway length)', ['H4.1', 'H4.5']],
        ['Brake command', 'N', 'Autobrake does not provide Brake command during landing roll when BSCU is armed (resulting in insufficient deceleration and potential overshoot)', ['H4.1', 'H4.5']],
        ['Brake command', 'N', 'Autobrake does not provide Brake command after takeoff (needed to lock wheels, results in potential equipment damage during landing gear retraction or wheel rotation in flight)', ['H4.6']],
        ['Brake command', 'P', 'Autobrake provides excessive Braking commands during landing roll', ['H4.1', 'H4.5']],
        ['Brake command', 'P', 'Autobrake provides Braking command inappropriately during takeoff (resulting in inadequate acceleration)', ['H4.1', 'H4.2', 'H4.5']],
        ['Brake command', 'P', 'Autobrake provides Brake command with insufficient level (resulting in insufficient deceleration during landing roll)', ['H4.1', 'H4.5']],
        ['Brake command', 'T', 'Autobrake provides Braking command before touchdown (resulting in tire burst, loss of control, injury, other damage)', ['H4.1', 'H4.5']],
        ['Brake command', 'T', 'Autobrake provides Brake command more than TBD seconds after touchdown (resulting in insufficient deceleration and potential loss of control, overshoot)', ['H4.1', 'H4.5']],
        ['Brake command', 'T', 'Autobrake provides Brake command at any time before wheels have left ground and RTO has not been requested (brake might be applied to stop wheels before gear retraction)', ['H4.1', 'H4.2', 'H4.5']],
        ['Brake command', 'T', 'Autobrake provides Brake more than TBD seconds after V1 during rejected takeoff (assumes that Autobrake is responsible for braking during RTO after crew throttle down)', ['H4.2']],
        ['Brake command', 'S', 'Autobrake stops providing Brake during landing roll before TBD taxi speed attained (causing reduced deceleration)', ['H4.1', 'H4.5']],
        ['Brake command', 'S', 'Autobrake provides Brake command too long (more than TBD seconds) during landing roll (causing stop on runway)', ['H4.1']],
        ['Brake command', 'S', 'Autobrake provides Brake command for tire lock until less than TBD seconds before touchdown during approach (resulting in loss of control, equipment damage)', ['H4.1', 'H4.5']],
      ],
    },
  },
]

export function handbookExampleProject(id: string): Project {
  const spec = HANDBOOK_EXAMPLES.find((e) => e.id === id)!.spec
  const b = projectBuilder({ name: spec.name, description: spec.description })
  const { add } = b
  const loss: Record<string, Id> = {}
  for (const [k, t] of spec.losses) loss[k] = add('loss', { title: t })
  const haz: Record<string, Id> = {}
  for (const [k, t, ls, parent] of spec.hazards) haz[k] = add('hazard', { title: t, lossLinks: ls.map((l) => loss[l]), parent: parent ? haz[parent] : null })
  const ca: Record<string, Id> = {}
  if (spec.nodes) {
    const node: Record<string, Id> = {}
    for (const [k, t, role, parent] of spec.nodes) node[k] = add('node', { title: t, role, parent: parent ? node[parent] : null })
    for (const [from, to, type, t] of spec.links ?? []) { const id = add(type === 'fb' ? 'feedback' : 'ca', { title: t, from: node[from], to: node[to] }); if (type === 'ca') ca[t] ??= id }
  } else if (spec.ucas) {
    const ctrl = add('node', { title: spec.controller, role: 'controller' })
    const proc = add('node', { title: spec.process, role: 'process' })
    for (const t of spec.cas ?? []) ca[t] = add('ca', { title: t, from: ctrl, to: proc })
  }
  for (const [c, type, text, hs] of spec.ucas ?? []) add('uca', { ca: ca[c], guide: GUIDE[type], override: text, hazards: hs.map((h) => haz[h]) })
  return b.project
}
