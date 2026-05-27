const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');
const PROGRAMMES_DIR = path.join(DATA_DIR, 'programmes');

// Ensure directories exist
[DATA_DIR, SCENARIOS_DIR, PROGRAMMES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 1. Define Sam Phillips Scenario (mapping to word document structure)
const samPhillipsScenario = {
  id: 'scenario_sam_phillips',
  code: 'UHB-UG-PE-01',
  title: 'Acute Pulmonary Embolism (Sam Phillips)',
  version: '1.0',
  lastReviewed: '27/05/2026',
  nextReviewDue: '27/05/2029',
  authors: 'Dr. Jane Smith, Clinical Lead; Prof. Alice Brown, Sim Lead',
  clinicalReviewer: 'Dr. John Doe, Consultant in Acute Medicine (Signed off: 10/05/2026)',
  educationalReviewer: 'Prof. Alice Brown, Educational Director (Signed off: 12/05/2026)',
  basedOnRealCase: true,
  realCaseNotes: 'Anonymized case of a patient presenting to the Emergency Department 10 days post-knee arthroscopy.',
  overview: {
    summary: 'A 42-year-old patient presents with sudden onset shortness of breath and pleuritic chest pain 10 days after knee arthroscopy. Learners must perform a systematic A-E assessment, recognise acute pulmonary embolism, initiate high-flow oxygen, request a 12-lead ECG, establish IV access, and escalate using a structured SBAR handover to the registrar.',
    targetLearners: 'Final Year Medical Students / Foundation Year 1 Doctors (Typical group size: 3-4)',
    prerequisites: 'Completion of online module on ABCDE assessment & pre-reading on BTS guidelines for Pulmonary Embolism.',
    modality: 'High-fidelity manikin (e.g. SimMan 3G)',
    location: 'Simulation Ward - Bed 2',
    duration: 15,
    debriefDuration: 30,
    totalSessionTime: 60
  },
  learningOutcomes: {
    technical: [
      { id: 1, outcome: 'Perform a systematic ABCDE assessment of an acutely unwell patient.', mapping: 'MBChB Y5 Acute Care CiP 1' },
      { id: 2, outcome: 'Recognise the signs and symptoms of acute pulmonary embolism (hypoxemia, tachycardia, tachypnea, pleuritic pain).', mapping: 'MBChB Y5 Respiratory Curriculum' },
      { id: 3, outcome: 'Initiate appropriate early management including oxygen therapy and vascular access.', mapping: 'FY1 CiP 2 - Clinical Care' },
      { id: 4, outcome: 'Order and interpret key diagnostic tests (12-lead ECG, ABG).', mapping: 'FY1 Practical Skills' }
    ],
    nonTechnical: [
      { id: 1, outcome: 'Deliver a structured SBAR handover under time pressure.', mapping: 'ANTS - Communication & Teamwork' },
      { id: 2, outcome: 'Maintain situational awareness and recognise clinical deterioration.', mapping: 'ANTS - Situation Awareness' },
      { id: 3, outcome: 'Demonstrate effective task allocation and team leadership during a crisis.', mapping: 'ANTS - Leadership' }
    ]
  },
  patientInfo: {
    demographics: {
      name: 'Sam Phillips',
      age: '42 yrs',
      sex: 'Male / Female (Flexible)',
      weight: '87 kg',
      identifier: 'NHS-987-654-321-A'
    },
    background: {
      presentingComplaint: 'Sudden onset shortness of breath and sharp chest pain.',
      history: 'Woke up this morning feeling very short of breath. Developed a sharp chest pain on the left side when taking a deep breath. Complains of some mild left calf pain for the last 2 days. Had a left knee arthroscopy 10 days ago.',
      pastMedicalHistory: 'Left knee arthroscopy (10 days ago), otherwise fit and well. No history of asthma or cardiac disease.',
      currentMedications: 'Paracetamol 1g PO QDS, Ibuprofen 400mg PO TDS, Enoxaparin 40mg SC daily (discharged on this for 5 days, finished 5 days ago).',
      allergies: 'Penicillin (developed a maculopapular rash 5 years ago).',
      socialHistory: 'Smokes 10 cigarettes/day, works as a software developer, lives with partner. Drinks 10-12 units of alcohol per week.',
      ice: 'Extremely anxious. Worried they are having a heart attack. Wants oxygen and pain relief immediately.'
    }
  },
  handover: [
    {
      role: 'FY1 Doctor / Lead Learner',
      situation: 'I am calling about Sam Phillips, a 42-year-old patient in Sim Ward Bed 2, who has developed sudden onset shortness of breath and chest pain.',
      background: 'Sam is 10 days post-op from a left knee arthroscopy. Discharged on standard analgesics and completed a 5-day course of prophylactic LMWH.',
      assessment: 'Sam is tachypneic (RR 24), tachycardic (HR 110), and hypoxic (SpO2 91% on room air). They have left-sided pleuritic chest pain and are extremely anxious.',
      recommendation: 'I need you to urgently review this patient, assess them using the ABCDE approach, and formulate an initial management plan.'
    }
  ],
  faculty: {
    facilitators: [
      { role: 'Session Director / Control Room', responsibilities: 'Operate the simulator, adjust vitals based on learner actions, play the voice of the patient, and coordinate cues.', required: 'Essential' },
      { role: 'Lead Debriefer', responsibilities: 'Observe team performance against outcomes and facilitate the PEARLS debrief session.', required: 'Essential' }
    ],
    inScenarioRoles: [
      { role: 'Bedside Staff Nurse (Confederate)', purpose: 'Provide clinical assistance, fetch equipment, prepare medications, and deliver rescue prompts if learners are stuck.', script: 'If learners have not exposed the patient or considered PE by 6 minutes, prompt: "I noticed Sam has a very red, swollen left calf. Could that be relevant?"' }
    ]
  },
  environment: {
    setup: {
      location: 'Simulation Ward - Bed 2, curtains drawn, bedside table present.',
      simulator: 'High-fidelity manikin (SimMan 3G) wearing patient gown and trainers next to bed.',
      position: 'Semi-upright (45 degrees) in bed, looking visibly distressed.',
      monitorSetup: 'Vitals monitor is ON. Initial parameters: HR and SpO2 displayed, other parameters blank until checked.',
      vascularAccess: '20G patent cannula in right ACF.',
      oxygenAtStart: '2L/min via nasal cannula in situ.',
      fluidsRunning: 'None.',
      moulage: 'Sweat on forehead. Left calf has redness and swelling applied (moulage or makeup).'
    },
    equipment: [
      { checked: true, category: 'Airway / Breathing', item: 'Non-rebreathe mask + tubing', qty: '1' },
      { checked: true, category: 'Airway / Breathing', item: 'Nasal cannula', qty: '1' },
      { checked: true, category: 'Circulation', item: '12-lead ECG machine & electrodes', qty: '1' },
      { checked: true, category: 'Circulation', item: 'IV cannulation pack & blood tubes', qty: '2' },
      { checked: true, category: 'Circulation', item: 'Saline flushes', qty: '5' },
      { checked: true, category: 'Diagnostics', item: 'Blood gas syringe and machine', qty: '2' },
      { checked: true, category: 'Personal Protective Equipment', item: 'Gloves and aprons', qty: '1 pack' }
    ],
    medications: [
      { drug: 'Enoxaparin (Treatment Dose)', route: 'SC', strength: '120 mg / 0.8 mL pre-filled syringe (based on 1.5mg/kg for 87kg)', notes: 'Check weight and allergies before giving' },
      { drug: 'Oxygen', route: 'Inhaled', strength: '15 L/min via Non-Rebreathe Mask', notes: 'Target SpO2 94-98% for non-COPD' },
      { drug: 'Morphine', route: 'IV', strength: '10mg in 10mL saline', notes: 'For severe pain, monitor respiratory rate' },
      { drug: 'Sodium Chloride 0.9%', route: 'IV', strength: '500 mL bolus bag', notes: 'For hypotension' }
    ]
  },
  progression: [
    {
      phaseName: 'Phase 1 - Baseline',
      trigger: 'Scenario starts as learners enter the bed space.',
      duration: '3 - 5 minutes',
      vitals: { hr: '110', rr: '24', spo2: '91', bp: '125/80', temp: '37.2', gcs: 'A / 15' },
      investigations: [
        { name: 'Arterial Blood Gas (ABG) on 2L O2', result: 'pH 7.48 (alkalosis), PaO2 6.2 kPa (hypoxia), PaCO2 4.1 kPa (hypocapnia), HCO3 24 mmol/L, Lactate 1.7 mmol/L' },
        { name: '12-Lead ECG', result: 'Sinus tachycardia at 110 bpm. Prominent S-wave in lead I, Q-wave in lead III, inverted T-wave in lead III (Classic S1Q3T3 pattern indicating right heart strain).' }
      ],
      patientPresentation: {
        appearance: 'Sitting up, clutching left side of chest, breathing rapidly and shallowly, sweating on forehead.',
        mood: 'Anxious, frightened, pleading for help.',
        communication: 'Can speak in short sentences, gets out of breath easily.',
        keyLines: 'I can\'t catch my breath. It feels like a knife stabbing my chest when I breathe in. Please, am I having a heart attack?'
      },
      expectedActions: [
        { role: 'Lead', action: 'Perform systematic A-E assessment (Airway clear, Breathing: RR 24, chest clear, SpO2 91% on 2L O2. Circulation: HR 110 regular, BP 125/80, CRT <2s. Disability: GCS 15, Pupils equal. Exposure: Temp 37.2, check left calf).' },
        { role: 'Team', action: 'Apply high-flow oxygen (15L/min via Non-Rebreathe Mask).' },
        { role: 'Team', action: 'Order 12-lead ECG, establish IV access, and draw bloods (FBC, U&Es, LFTs, Coagulation screen).' },
        { role: 'Lead', action: 'Recognise high probability of Pulmonary Embolism based on risk factors (recent surgery, immobilisation, smoking) and clinical presentation.' }
      ],
      cues: [
        { condition: 'If learners do not check the legs / expose the patient by 5 minutes', cue: 'Patient complains: "My left leg has been really aching and throbbing since yesterday."' },
        { condition: 'If learners apply 15L NRB oxygen', cue: 'Move simulator to Phase 3 (Resolution) after oxygen is applied and LMWH treatment is discussed.' },
        { condition: 'If learners take no action or fail to apply oxygen by 6 minutes', cue: 'Transition simulator to Phase 2 (Deterioration).' }
      ]
    },
    {
      phaseName: 'Phase 2 - Deterioration',
      trigger: 'Triggered if learners fail to apply high-flow oxygen or delay treatment by 6 minutes.',
      duration: '3 - 5 minutes',
      vitals: { hr: '130', rr: '32', spo2: '85', bp: '95/60', temp: '37.2', gcs: 'V / 13' },
      investigations: [
        { name: 'Repeat ABG (on 2L O2)', result: 'pH 7.42, PaO2 5.1 kPa (severe hypoxia), PaCO2 3.8 kPa, Lactate 2.8 mmol/L (rising indicating tissue hypoperfusion)' }
      ],
      patientPresentation: {
        appearance: 'Pale, diaphoretic, accessory muscle use, eyes closed, barely reacting to environment.',
        mood: 'Somnolent, confused, agitated when stimulated.',
        communication: 'Grunts, one-word answers, confused.',
        keyLines: 'Too... tired... can\'t... breathe...'
      },
      expectedActions: [
        { role: 'Lead', action: 'Immediately recognize critical deterioration, call for emergency medical registrar / peri-arrest team.' },
        { role: 'Team', action: 'Apply high-flow oxygen (15L/min NRB mask) immediately.' },
        { role: 'Team', action: 'Initiate a rapid IV fluid bolus (500ml 0.9% NaCl) for hypotension.' },
        { role: 'Lead', action: 'Deliver a concise, urgent SBAR handover to the incoming registrar.' }
      ],
      cues: [
        { condition: 'If learners still do not apply oxygen', cue: 'Bedside nurse confederate says: "Sam is looking very blue and sleepy, should we get the 15L oxygen mask on right away?"' },
        { condition: 'Once 15L oxygen is applied and fluid bolus is running', cue: 'Move simulator to Phase 3 (Resolution).' }
      ]
    },
    {
      phaseName: 'Phase 3 - Resolution',
      trigger: 'Triggered when high-flow oxygen is applied and treatment dose LMWH is planned/given.',
      duration: '3 - 5 minutes',
      vitals: { hr: '95', rr: '18', spo2: '97', bp: '115/75', temp: '37.0', gcs: 'A / 15' },
      investigations: [
        { name: 'ABG on 15L O2', result: 'pH 7.44, PaO2 12.5 kPa, PaCO2 4.3 kPa, Lactate 1.8 mmol/L' }
      ],
      patientPresentation: {
        appearance: 'Color returning, breathing settled, sitting up comfortably, smiling slightly.',
        mood: 'Relieved, much calmer, breathing easily.',
        communication: 'Can speak in full sentences easily.',
        keyLines: 'Oh, thank goodness, that mask is helping so much. The chest pain is still there but I can breathe now. Thank you.'
      },
      expectedActions: [
        { role: 'Lead', action: 'Re-assess ABCDE, confirm improvements in vitals.' },
        { role: 'Lead', action: 'Call medical registrar and deliver a complete SBAR handover for transfer to the Acute Medical Unit / Coronary Care Unit.' },
        { role: 'Team', action: 'Explain the diagnosis of suspected pulmonary embolism to Sam and counsel them on the need for a CTPA (CT Pulmonary Angiogram) scan.' }
      ],
      cues: [
        { condition: 'If learners struggle to summarize the case for handover', cue: 'Bedside nurse says: "I have the SBAR template here, let\'s go through what we\'ll tell the registrar."' }
      ]
    }
  ],
  prebrief: {
    checklist: [
      'Introductions and housekeeping (toilets, fire exits).',
      'Briefing on session structure, timing, and debriefing flow.',
      'Establish the "Fiction Contract" (agree to treat the simulation as real, accepting its limitations).',
      'The "Basic Assumption" (everyone is intelligent, capable, wants to do their best and improve).',
      'Confirm strict confidentiality rules (what happens in the room stays in the room).',
      'Confirm safety rules (use of "Time Out" or "Stop" for real emergencies).',
      'Orientation to the SimMan manikin (breath sounds, pulses, monitors, and available equipment).',
      'Confirm student roles (FY1 lead, FY1 assistant, bedside nurse).'
    ],
    lead: 'Lead Facilitator',
    duration: 10,
    notes: 'Ensure learners understand that the monitor will only display parameters they have actually checked or asked the bedside nurse to connect.'
  },
  debrief: {
    reactions: {
      question: 'Let\'s start with how you are feeling. Can you tell us what that experience was like for you?',
      duration: 3
    },
    description: {
      question: 'In your own words, could someone summarise the clinical case and the main challenges you faced?',
      duration: 3
    },
    analysis: [
      {
        point: 'Recognising Pulmonary Embolism & Risk Factors',
        strategy: 'Advocacy-Inquiry',
        question: 'I noticed that the exposure of the patient\'s legs and investigation of the DVT signs happened around 8 minutes into the scenario. I am curious about what you were thinking and weighing up during the initial assessment?'
      },
      {
        point: 'Oxygen Therapy in Acute Hypoxemia',
        strategy: 'Directive Feedback',
        question: 'Let\'s review the target oxygen saturations for an acutely hypoxic patient without chronic lung disease. Why is high-flow 15L oxygen via a non-rebreathe mask the first-line treatment, and how does it affect the ventilation-perfusion mismatch in PE?'
      },
      {
        point: 'Escalation and SBAR Communication',
        strategy: 'Plus-Delta',
        question: 'How did you feel the SBAR handover to the registrar went? What went particularly well, and what details could we refine to make the escalation even more effective under pressure?'
      }
    ],
    summary: {
      question: 'To wrap up, let\'s go around the room. What are the key take-home points you will apply to your practice?',
      points: [
        'Perform a rapid, complete ABCDE exposure of the patient to find diagnostic clues (like calf swelling).',
        'Initiate empirical treatment (high-flow oxygen and LMWH discussion) early when PE is strongly suspected.',
        'Use the structured SBAR template to deliver precise, clear handovers under high cognitive load.'
      ],
      duration: 4
    }
  },
  aspihMapping: [
    { domain: 'Core values (safety, EDI, sustainability, excellence)', coveredBy: 'Psychological safety is established during the prebrief (§8). EDI considerations integrated in the patient\'s clinical profile.', status: true },
    { domain: 'Faculty — trained, competent, continuously developing', coveredBy: 'All facilitators are certified simulation debriefers with yearly peer review.', status: true },
    { domain: 'Simulated participants trained for role', coveredBy: 'Bedside nurse played by a trained clinical confederate following script cues.', status: true },
    { domain: 'Activity — needs-based, aligned learning outcomes', coveredBy: 'Aimed at final year medical students to address curriculum gaps in managing acute VTE.', status: true },
    { domain: 'Activity — evidence-informed design', coveredBy: 'Designed using the PEARLS debrief framework and mapped to current BTS and NICE PE guidelines.', status: true },
    { domain: 'Activity — structured prebrief and debrief', coveredBy: 'Features dedicated 10-minute structured prebrief and 30-minute PEARLS debrief plan.', status: true },
    { domain: 'Resources — equipment and environment fit for purpose', coveredBy: 'Set in a fully equipped mock ward using a high-fidelity simulator.', status: true },
    { domain: 'Governance — review, sign-off, version control', coveredBy: 'Complete governance block signed off by Consultant and Sim Director with version 1.0 control.', status: true }
  ],
  references: {
    guidelines: 'NICE Guideline NG158: Venous thromboembolic diseases: diagnosis, management and thrombophilia testing (2020, updated 2023). British Thoracic Society (BTS) guidelines for the management of suspected acute pulmonary embolism.',
    evidenceBase: 'Eppich, W. & Cheng, A. (2015). Promoting Excellence and Reflective Learning in Simulation (PEARLS): a blended approach for debriefing in healthcare education. Simulation in Healthcare, 10(2), 106-115.',
    preLearning: 'ASPiH Standards Framework for Simulation-Based Practice (2023). University Moodle Portal: Module 4 - Acute Cardiorespiratory Care.',
    relatedScenarios: 'Scenario UHB-UG-DVT-02 (Deep Vein Thrombosis in Outpatients); Scenario UHB-PG-SEPSIS-01 (Septic Shock Secondary to DVT Infection).'
  },
  versionHistory: [
    { version: '1.0', date: '27/05/2026', author: 'Dr. Jane Smith', change: 'Initial creation and sign-off for Undergraduate Y5 curriculum.' }
  ]
};

// 2. Define standard Programmes
const standardProgrammes = [
  {
    id: 'prog_undergrad_y5',
    name: 'Undergraduate Medicine Year 5',
    description: 'Final year medical student acute care simulation curriculum focusing on A-E assessment, early recognition of critical illness, and emergency escalation.',
    scenarioIds: ['scenario_sam_phillips']
  },
  {
    id: 'prog_fy1_induction',
    name: 'Foundation Year 1 Induction',
    description: 'Induction training for newly qualified FY1 doctors, developing competencies in SBAR handover, ward-based emergencies, and team leadership.',
    scenarioIds: ['scenario_sam_phillips']
  }
];

// Write Scenario
fs.writeFileSync(
  path.join(SCENARIOS_DIR, `${samPhillipsScenario.id}.json`),
  JSON.stringify(samPhillipsScenario, null, 2),
  'utf8'
);
console.log('Seeded Sam Phillips clinical scenario.');

// Write Programmes
standardProgrammes.forEach(prog => {
  fs.writeFileSync(
    path.join(PROGRAMMES_DIR, `${prog.id}.json`),
    JSON.stringify(prog, null, 2),
    'utf8'
  );
  console.log(`Seeded Programme: ${prog.name}`);
});

console.log('Database pre-seeding completed successfully!');
