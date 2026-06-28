export interface AgeDosing {
  infant: string
  child: string
  adult: string
}

export interface BDDrug {
  brand: string
  generic: string
  category:
    | 'Antibiotic'
    | 'Analgesic'
    | 'Anti-inflammatory'
    | 'Local anesthetic'
    | 'Antifungal'
    | 'Antiviral'
    | 'Antiseptic'
    | 'Anxiolytic'
    | 'Steroid'
    | 'Antifibrinolytic'
  dosageForm: string
  company: string
  pack: string
  priceLabel: string
  priceNum: number
  dentalUse: string
  defaultDosage: string
  defaultFrequency: string
  defaultDuration: string
  defaultInstructions: string
  defaultRoute: string
  ageDosing: AgeDosing
}

type DrugCategory = BDDrug['category']
type GenericKey =
  | 'amoxicillin'
  | 'amoxiclav'
  | 'metronidazole'
  | 'azithromycin'
  | 'ibuprofen'
  | 'diclofenac'
  | 'paracetamol'
  | 'lidocaine'
  | 'dexamethasone'
  | 'diazepam'
  | 'chlorhexidine'
  | 'nystatin'
  | 'clindamycin'
  | 'cefixime'
  | 'doxycycline'
  | 'mefenamic'
  | 'tranexamic'
  | 'povidoneIodine'
  | 'triamcinolone'
  | 'cephalexin'
  | 'cephradine'
  | 'cefuroxime'
  | 'ceftriaxone'
  | 'cefepime'
  | 'cefiximeClav'
  | 'cefuroximeClav'
  | 'acyclovir'
  | 'valacyclovir'
  | 'fluconazole'
  | 'ketoconazole'
  | 'penicillinV'
  | 'ampicillin'
  | 'cloxacillin'
  | 'amoxiclav875'
  | 'ketorolac'
  | 'etoricoxib'
  | 'paracetamolIbuprofen'

interface GenericDefaults {
  generic: string
  category: DrugCategory
  dosageForm: string
  defaultDosage: string
  defaultFrequency: string
  defaultDuration: string
  defaultInstructions: string
  defaultRoute: string
  ageDosing: AgeDosing
}

const GENERIC_DEFAULTS: Record<GenericKey, GenericDefaults> = {
  amoxicillin: {
    generic: 'Amoxicillin Trihydrate',
    category: 'Antibiotic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '3x daily',
    defaultDuration: '5 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '20-40mg/kg/day divided 3x (suspension)', child: '25mg/kg/day divided 3x (max 500mg/dose)', adult: '500mg 3x daily' },
  },
  amoxiclav: {
    generic: 'Amoxicillin + Clavulanic Acid',
    category: 'Antibiotic',
    dosageForm: '625mg Tab',
    defaultDosage: '625mg (500+125)',
    defaultFrequency: '2x daily',
    defaultDuration: '7 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '20-40mg/kg/day (amoxicillin component) divided 2-3x', child: '25-45mg/kg/day divided 2x', adult: '625mg 2x daily' },
  },
  amoxiclav875: {
    generic: 'Amoxicillin + Clavulanic Acid (875mg)',
    category: 'Antibiotic',
    dosageForm: '875mg/125mg Tab (DS)',
    defaultDosage: '1g (875+125)',
    defaultFrequency: '2x daily',
    defaultDuration: '7 days',
    defaultInstructions: 'After meals; higher-strength alternative for severe odontogenic infections',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not used; lower-strength suspension preferred', child: 'Not routinely used <12 years; use 625mg/suspension instead', adult: '875mg/125mg ("1g") twice daily' },
  },
  metronidazole: {
    generic: 'Metronidazole',
    category: 'Antibiotic',
    dosageForm: '400mg Tab',
    defaultDosage: '400mg',
    defaultFrequency: '3x daily',
    defaultDuration: '5 days',
    defaultInstructions: 'After meals, avoid alcohol',
    defaultRoute: 'Oral',
    ageDosing: { infant: '7.5mg/kg every 8h (avoid <2 months unless essential)', child: '7.5mg/kg 3x daily', adult: '400mg 3x daily' },
  },
  azithromycin: {
    generic: 'Azithromycin',
    category: 'Antibiotic',
    dosageForm: '500mg Tab',
    defaultDosage: '500mg',
    defaultFrequency: '1x daily',
    defaultDuration: '3 days',
    defaultInstructions: '1 hour before or 2 hours after meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not routinely recommended <6 months', child: '10mg/kg once daily', adult: '500mg once daily' },
  },
  ibuprofen: {
    generic: 'Ibuprofen',
    category: 'Analgesic',
    dosageForm: '400mg Tab',
    defaultDosage: '400mg',
    defaultFrequency: '3x daily',
    defaultDuration: '5 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '5-10mg/kg every 6-8h (>6 months)', child: '5-10mg/kg every 6-8h (max 40mg/kg/day)', adult: '400mg 3x daily' },
  },
  diclofenac: {
    generic: 'Diclofenac Sodium',
    category: 'Anti-inflammatory',
    dosageForm: '50mg Tab',
    defaultDosage: '50mg',
    defaultFrequency: '2-3x daily',
    defaultDuration: '5 days',
    defaultInstructions: 'After meals with full glass of water',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended', child: '1-3mg/kg/day divided (>1 year, caution)', adult: '50mg 2-3x daily' },
  },
  paracetamol: {
    generic: 'Paracetamol',
    category: 'Analgesic',
    dosageForm: '500mg Tab',
    defaultDosage: '500mg',
    defaultFrequency: '3-4x daily',
    defaultDuration: '3-5 days',
    defaultInstructions: 'Can be taken with or without food',
    defaultRoute: 'Oral',
    ageDosing: { infant: '10-15mg/kg every 4-6h', child: '10-15mg/kg every 4-6h (max 4 doses/day)', adult: '500-1000mg every 4-6h (max 4g/day)' },
  },
  lidocaine: {
    generic: 'Lidocaine (Lignocaine) HCl',
    category: 'Local anesthetic',
    dosageForm: '2% Injection',
    defaultDosage: '2% (20mg/ml)',
    defaultFrequency: 'As required',
    defaultDuration: 'Single use',
    defaultInstructions: 'Administered by dental professional only',
    defaultRoute: 'Injection',
    ageDosing: { infant: 'Max 3-4.5mg/kg (weight-based volume, dental professional only)', child: 'Max 4.4mg/kg', adult: 'Max 4.4mg/kg (typically 300-500mg per session)' },
  },
  dexamethasone: {
    generic: 'Dexamethasone',
    category: 'Steroid',
    dosageForm: '0.5mg Tab',
    defaultDosage: '0.5mg',
    defaultFrequency: '2x daily',
    defaultDuration: '3-5 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not routine for dental use', child: '0.1-0.2mg/kg single dose (caution)', adult: '0.5-1mg once or twice daily, short course' },
  },
  diazepam: {
    generic: 'Diazepam',
    category: 'Anxiolytic',
    dosageForm: '5mg Tab',
    defaultDosage: '5mg',
    defaultFrequency: 'Once at night / pre-procedure',
    defaultDuration: '1-3 days',
    defaultInstructions: 'Take 1 hour before procedure; avoid driving',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended', child: 'Not routinely used (specialist sedation only)', adult: '5-10mg once before procedure' },
  },
  chlorhexidine: {
    generic: 'Chlorhexidine Gluconate',
    category: 'Antiseptic',
    dosageForm: '0.2% Mouthwash',
    defaultDosage: '0.2%',
    defaultFrequency: '2x daily (rinse 30 sec)',
    defaultDuration: '7-14 days',
    defaultInstructions: 'Rinse for 30 seconds; do not swallow; use after brushing',
    defaultRoute: 'Topical/Oral rinse',
    ageDosing: { infant: 'Not recommended (swallowing risk)', child: 'Supervised use only, >6 years', adult: '10-15ml rinse 2x daily' },
  },
  nystatin: {
    generic: 'Nystatin',
    category: 'Antifungal',
    dosageForm: '100,000 IU/ml Oral suspension',
    defaultDosage: '100,000 IU/ml',
    defaultFrequency: '4x daily (after meals + bedtime)',
    defaultDuration: '7-14 days',
    defaultInstructions: 'Hold in mouth for as long as possible before swallowing; continue 48hrs after symptoms clear',
    defaultRoute: 'Oral suspension',
    ageDosing: { infant: '1ml (100,000 IU) 4x daily applied to mouth', child: '1-2ml 4x daily', adult: '4-6ml 4x daily, swish and swallow/spit' },
  },
  clindamycin: {
    generic: 'Clindamycin HCl',
    category: 'Antibiotic',
    dosageForm: '300mg Cap',
    defaultDosage: '300mg',
    defaultFrequency: '3x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'Take with a full glass of water; penicillin-allergy alternative',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not first-line; 10-25mg/kg/day divided if needed', child: '10-25mg/kg/day divided 3x', adult: '300mg 3x daily' },
  },
  cefixime: {
    generic: 'Cefixime',
    category: 'Antibiotic',
    dosageForm: '200mg Tab',
    defaultDosage: '200mg',
    defaultFrequency: '2x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '8mg/kg/day divided (suspension)', child: '8mg/kg/day once or divided 2x', adult: '200mg 2x daily' },
  },
  doxycycline: {
    generic: 'Doxycycline Hyclate',
    category: 'Antibiotic',
    dosageForm: '100mg Cap',
    defaultDosage: '100mg',
    defaultFrequency: '1-2x daily',
    defaultDuration: '7 days',
    defaultInstructions: 'Take with food; avoid lying down for 30 min; avoid sun exposure',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Contraindicated <8 years', child: 'Contraindicated <8 years', adult: '100mg 1-2x daily' },
  },
  mefenamic: {
    generic: 'Mefenamic Acid',
    category: 'Analgesic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '3x daily',
    defaultDuration: '3-5 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended <6 months', child: '6.5mg/kg every 8h (>6 months)', adult: '500mg 3x daily' },
  },
  tranexamic: {
    generic: 'Tranexamic Acid',
    category: 'Antifibrinolytic',
    dosageForm: '500mg Tab',
    defaultDosage: '500mg',
    defaultFrequency: '3x daily',
    defaultDuration: '3-5 days',
    defaultInstructions: 'Used to control post-extraction bleeding; with or without food',
    defaultRoute: 'Oral',
    ageDosing: { infant: '10mg/kg every 8h (specialist use)', child: '10mg/kg every 8h', adult: '500mg 3x daily, or rinse with 4.8% mouthwash' },
  },
  povidoneIodine: {
    generic: 'Povidone-Iodine',
    category: 'Antiseptic',
    dosageForm: '1% Mouthwash/Gargle',
    defaultDosage: '1%',
    defaultFrequency: '2-3x daily (rinse/gargle)',
    defaultDuration: '5-7 days',
    defaultInstructions: 'Dilute as directed; do not swallow; avoid in thyroid disorders',
    defaultRoute: 'Topical/Oral rinse',
    ageDosing: { infant: 'Avoid (thyroid/aspiration risk)', child: 'Supervised use only, >6 years, diluted', adult: 'Gargle/rinse diluted 2-3x daily' },
  },
  triamcinolone: {
    generic: 'Triamcinolone Acetonide',
    category: 'Steroid',
    dosageForm: '0.1% Oral Paste',
    defaultDosage: '0.1%',
    defaultFrequency: '2-3x daily',
    defaultDuration: 'Until healed (max 14 days)',
    defaultInstructions: 'Apply thin layer to lesion after meals and at bedtime; do not rub in',
    defaultRoute: 'Topical (oral mucosa)',
    ageDosing: { infant: 'Not recommended', child: 'Thin layer 2x daily (>2 years, short course)', adult: 'Thin layer 2-3x daily' },
  },
  cephalexin: {
    generic: 'Cephalexin',
    category: 'Antibiotic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '4x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '25-50mg/kg/day divided 4x', child: '25-50mg/kg/day divided 4x (max 500mg/dose)', adult: '500mg 4x daily (or 250-500mg every 6h)' },
  },
  cephradine: {
    generic: 'Cephradine',
    category: 'Antibiotic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '4x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '25-50mg/kg/day divided 4x', child: '25-50mg/kg/day divided 4x (max 500mg/dose)', adult: '500mg 4x daily (or 250-500mg every 6h)' },
  },
  cefuroxime: {
    generic: 'Cefuroxime Axetil',
    category: 'Antibiotic',
    dosageForm: '250mg Tab',
    defaultDosage: '250mg',
    defaultFrequency: '2x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '125mg twice daily (suspension, age-based)', child: '10-15mg/kg twice daily (max 250mg/dose)', adult: '250-500mg twice daily' },
  },
  ceftriaxone: {
    generic: 'Ceftriaxone',
    category: 'Antibiotic',
    dosageForm: '1g Injection',
    defaultDosage: '1g',
    defaultFrequency: 'Once daily',
    defaultDuration: '3-5 days (hospital/specialist setting)',
    defaultInstructions: 'IV/IM, administered by clinical professional',
    defaultRoute: 'Injection',
    ageDosing: { infant: '20-50mg/kg once daily IV/IM', child: '50-75mg/kg once daily', adult: '1-2g once daily IV/IM' },
  },
  cefepime: {
    generic: 'Cefepime',
    category: 'Antibiotic',
    dosageForm: '1g Injection',
    defaultDosage: '1g',
    defaultFrequency: 'Every 12h',
    defaultDuration: '5-7 days (hospital/specialist setting)',
    defaultInstructions: 'IV, administered by clinical professional',
    defaultRoute: 'Injection',
    ageDosing: { infant: '50mg/kg every 12h (specialist/hospital use)', child: '50mg/kg every 12h', adult: '1-2g every 12h IV' },
  },
  cefiximeClav: {
    generic: 'Cefixime + Clavulanic Acid',
    category: 'Antibiotic',
    dosageForm: '200mg/125mg Tab',
    defaultDosage: '200mg/125mg',
    defaultFrequency: '2x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals; for beta-lactamase-producing resistant infections',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not routinely used; specialist-guided suspension only', child: '8mg/kg/day (cefixime component) divided 2x', adult: '200mg/125mg twice daily' },
  },
  cefuroximeClav: {
    generic: 'Cefuroxime + Clavulanic Acid',
    category: 'Antibiotic',
    dosageForm: '250mg/125mg Tab',
    defaultDosage: '250mg/125mg',
    defaultFrequency: '2x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'After meals; resistant odontogenic infections',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not routinely used; specialist-guided suspension only', child: '10-15mg/kg (cefuroxime component) twice daily', adult: '250mg/125mg twice daily' },
  },
  acyclovir: {
    generic: 'Acyclovir',
    category: 'Antiviral',
    dosageForm: '400mg Tab',
    defaultDosage: '400mg',
    defaultFrequency: '3x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'Start within 72h of lesion onset; with or without food',
    defaultRoute: 'Oral',
    ageDosing: { infant: '10mg/kg every 8h (severe HSV, specialist use)', child: '20mg/kg every 6h (max 800mg/dose)', adult: '400mg 3x daily or 200mg 5x daily' },
  },
  valacyclovir: {
    generic: 'Valacyclovir',
    category: 'Antiviral',
    dosageForm: '500mg Tab',
    defaultDosage: '500mg',
    defaultFrequency: '2x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'Start within 72h of lesion onset; with or without food',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not established; specialist use only', child: '20mg/kg twice daily (>2 years, specialist guidance)', adult: '500mg-1g twice daily' },
  },
  fluconazole: {
    generic: 'Fluconazole',
    category: 'Antifungal',
    dosageForm: '150mg Cap',
    defaultDosage: '150mg',
    defaultFrequency: 'Once daily / single dose',
    defaultDuration: '7-14 days (or single dose)',
    defaultInstructions: 'With or without food',
    defaultRoute: 'Oral',
    ageDosing: { infant: '3-6mg/kg once daily', child: '3-6mg/kg once daily (max 150mg)', adult: '150mg single dose, or 50-100mg daily for 7-14 days' },
  },
  ketoconazole: {
    generic: 'Ketoconazole',
    category: 'Antifungal',
    dosageForm: '200mg Tab',
    defaultDosage: '200mg',
    defaultFrequency: 'Once daily',
    defaultDuration: '1-2 weeks',
    defaultInstructions: 'Take with food; monitor for hepatotoxicity',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended', child: 'Not first-line (hepatotoxicity risk); specialist use only', adult: '200mg once daily with food, 1-2 weeks' },
  },
  penicillinV: {
    generic: 'Phenoxymethylpenicillin (Penicillin V)',
    category: 'Antibiotic',
    dosageForm: '250mg Tab',
    defaultDosage: '250mg',
    defaultFrequency: '4x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'On an empty stomach, 1h before or 2h after meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '15mg/kg every 6h (suspension)', child: '125-250mg every 6h', adult: '250-500mg every 6h' },
  },
  ampicillin: {
    generic: 'Ampicillin',
    category: 'Antibiotic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '4x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'On an empty stomach, 1h before or 2h after meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '25-50mg/kg/day divided 4x', child: '25-50mg/kg/day divided 4x (max 500mg/dose)', adult: '500mg 4x daily' },
  },
  cloxacillin: {
    generic: 'Cloxacillin',
    category: 'Antibiotic',
    dosageForm: '500mg Cap',
    defaultDosage: '500mg',
    defaultFrequency: '4x daily',
    defaultDuration: '5-7 days',
    defaultInstructions: 'On an empty stomach, 1h before or 2h after meals',
    defaultRoute: 'Oral',
    ageDosing: { infant: '25-50mg/kg/day divided 4x', child: '25-50mg/kg/day divided 4x', adult: '500mg 4x daily' },
  },
  ketorolac: {
    generic: 'Ketorolac Tromethamine',
    category: 'Analgesic',
    dosageForm: '10mg Tab',
    defaultDosage: '10mg',
    defaultFrequency: 'Every 4-6h',
    defaultDuration: 'Max 5 days',
    defaultInstructions: 'Short-term use only; take with food',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended', child: 'Not recommended <16 years (limited data)', adult: '10mg every 4-6h (max 40mg/day, max 5 days)' },
  },
  etoricoxib: {
    generic: 'Etoricoxib',
    category: 'Anti-inflammatory',
    dosageForm: '90mg Tab',
    defaultDosage: '90mg',
    defaultFrequency: 'Once daily',
    defaultDuration: 'Max 8 days (acute pain)',
    defaultInstructions: 'With or without food; short course for acute dental pain',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended', child: 'Not recommended <16 years', adult: '90mg once daily (short course, max 8 days for acute pain)' },
  },
  paracetamolIbuprofen: {
    generic: 'Paracetamol + Ibuprofen',
    category: 'Analgesic',
    dosageForm: '325mg/200mg Tab',
    defaultDosage: '325mg/200mg',
    defaultFrequency: 'Every 6-8h',
    defaultDuration: '3-5 days',
    defaultInstructions: 'After meals; dual-mechanism analgesia for moderate-severe dental pain',
    defaultRoute: 'Oral',
    ageDosing: { infant: 'Not recommended as fixed combo; use single agents', child: 'Not recommended <12 years as fixed combo', adult: '1 tablet every 6-8h (max 3 tablets/day)' },
  },
}

interface DrugSeed {
  genericKey: GenericKey
  brand: string
  company: string
  pack: string
  priceLabel: string
  priceNum: number
  dentalUse: string
  dosageForm?: string
}

const DRUG_SEEDS: DrugSeed[] = [
  { genericKey: 'amoxicillin', brand: 'Moxacil 500', company: 'Square Pharmaceuticals PLC', pack: '10×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental abscess, periapical infection, prophylaxis' },
  { genericKey: 'amoxicillin', brand: 'Tycil 500', company: 'Beximco Pharmaceuticals Ltd', pack: '5×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Odontogenic infections, post-extraction prophylaxis' },
  { genericKey: 'amoxicillin', brand: 'Fimoxyl 500', company: 'Synovia Pharma PLC', pack: '8×15', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental/oral infections, endocarditis prophylaxis' },
  { genericKey: 'amoxicillin', brand: 'Moxilin 500', company: 'ACME Laboratories Ltd', pack: '5×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental abscess, tooth infections' },
  { genericKey: 'amoxicillin', brand: 'SK-mox 500', company: 'Eskayef Pharmaceuticals Ltd', pack: '5×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Periapical/periodontal infections' },
  { genericKey: 'amoxicillin', brand: 'Bactamox 500', company: 'Renata PLC', pack: '5×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Acute dental infections' },
  { genericKey: 'amoxicillin', brand: 'Avlomox 500', company: 'ACI Limited', pack: '4×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental/oral infections, prophylaxis' },
  { genericKey: 'amoxicillin', brand: 'Aristomox 500', company: 'Aristopharma Ltd', pack: '8×15', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Odontogenic infections' },
  { genericKey: 'amoxicillin', brand: 'Sinamox 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: '8×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental abscess, pericoronitis' },
  { genericKey: 'amoxicillin', brand: 'Ultramox 500', company: 'Globe Pharmaceuticals Ltd', pack: '5×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Oral infections' },
  { genericKey: 'amoxicillin', brand: 'Demoxil 500', company: 'Drug International Ltd', pack: '3×10', priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Dental/periapical infections' },
  { genericKey: 'amoxicillin', brand: 'Xtramox 500', company: 'Bengal Drugs Ltd', pack: "50's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Odontogenic & periodontal infections' },

  { genericKey: 'amoxiclav', brand: 'Moxaclav 625', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳~30', priceNum: 30, dentalUse: 'Beta-lactamase resistant dental infections' },
  { genericKey: 'amoxiclav', brand: 'Tyclav 625', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Refractory dental infections, deep space infections' },
  { genericKey: 'amoxiclav', brand: 'Clamox 625', company: 'Opsonin Pharma Limited', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Dental abscess with resistant organisms' },
  { genericKey: 'amoxiclav', brand: 'Augment 625', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~29', priceNum: 29, dentalUse: 'Post-surgical oral infections' },
  { genericKey: 'amoxiclav', brand: 'Avloclav 625', company: 'ACI Limited', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Resistant dental infections' },
  { genericKey: 'amoxiclav', brand: 'Fimoxyclav 625', company: 'Synovia Pharma PLC', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Perimandibular space infections' },
  { genericKey: 'amoxiclav', brand: 'Moxilin-CV 625', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳~29', priceNum: 29, dentalUse: 'Dental abscess with beta-lactamase producers' },
  { genericKey: 'amoxiclav', brand: 'Clacido 625', company: 'Healthcare Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Oral/maxillofacial infections' },
  { genericKey: 'amoxiclav', brand: 'Clavoxil 625', company: 'Renata PLC', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Dental infections requiring augmented cover' },
  { genericKey: 'amoxiclav', brand: 'Co-Clav 625', company: 'Ad-din Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳32', priceNum: 32, dentalUse: 'Dental infections with resistant bacteria' },
  { genericKey: 'amoxiclav', brand: 'Demoxiclave 625', company: 'Drug International Ltd', pack: "20's", priceLabel: '৳~28', priceNum: 28, dentalUse: 'Pericoronitis, post-extraction infection' },
  { genericKey: 'amoxiclav', brand: 'Bioclavid 625', company: 'Novartis (Bangladesh) Ltd', pack: "20's", priceLabel: '৳~32', priceNum: 32, dentalUse: 'Severe odontogenic infections' },

  { genericKey: 'metronidazole', brand: 'Flagyl 400', company: 'Synovia Pharma PLC', pack: '30×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Acute ulcerative gingivitis, anaerobic dental infections' },
  { genericKey: 'metronidazole', brand: 'Amodis 400', company: 'Square Pharmaceuticals PLC', pack: '24×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Anaerobic oral infections, ANUG, NOMA' },
  { genericKey: 'metronidazole', brand: 'Filmet 400', company: 'Beximco Pharmaceuticals Ltd', pack: '25×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Dental abscess (anaerobes), pericoronitis' },
  { genericKey: 'metronidazole', brand: 'Metryl 400', company: 'Opsonin Pharma Ltd', pack: '7×30', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Anaerobic bacterial dental infections' },
  { genericKey: 'metronidazole', brand: 'Dirozyl 400', company: 'ACME Laboratories Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Necrotizing periodontal disease, ANUG' },
  { genericKey: 'metronidazole', brand: 'Metco 400', company: 'Eskayef Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Adjunct to dental scaling, gingivitis' },
  { genericKey: 'metronidazole', brand: 'Nidazyl 400', company: 'Orion Pharma Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Acute dental infections due to anaerobes' },
  { genericKey: 'metronidazole', brand: 'Flamyd 400', company: 'Incepta Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.25', priceNum: 1.25, dentalUse: 'Anaerobic oral infections' },
  { genericKey: 'metronidazole', brand: 'Amotrex 400', company: 'ACI Limited', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Dental abscess (anaerobic component)' },
  { genericKey: 'metronidazole', brand: 'Metsina 400', company: 'Ibn Sina Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Periodontal disease, anaerobic infections' },
  { genericKey: 'metronidazole', brand: 'D Metro 400', company: 'Desh Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Acute ulcerative gingivitis, pericoronitis' },
  { genericKey: 'metronidazole', brand: 'Micogyl 400', company: 'Globe Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.70', priceNum: 1.7, dentalUse: 'Anaerobic dental infections' },

  { genericKey: 'azithromycin', brand: 'Zimax 500', company: 'Square Pharmaceuticals PLC', pack: '3×6', priceLabel: '৳40.00', priceNum: 40, dentalUse: 'Penicillin-allergy dental infections, ANUG, pericoronitis' },
  { genericKey: 'azithromycin', brand: 'Zibac 500', company: 'Popular Pharmaceuticals Ltd', pack: '3×6', priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Alternative antibiotic in oral infections' },
  { genericKey: 'azithromycin', brand: 'Azithrocin 500', company: 'Beximco Pharmaceuticals Ltd', pack: '4×3', priceLabel: '৳35.00', priceNum: 35, dentalUse: 'Dental infections in penicillin-allergic patients' },
  { genericKey: 'azithromycin', brand: 'Tridosil 500', company: 'Incepta Pharmaceuticals Ltd', pack: '4×3', priceLabel: '৳35.00', priceNum: 35, dentalUse: 'Oral/dental infections (macrolide 3-day course)' },
  { genericKey: 'azithromycin', brand: 'Azin 500', company: 'ACME Laboratories Ltd', pack: '2×6', priceLabel: '৳55.00', priceNum: 55, dentalUse: 'Dental abscess, pericoronitis (penicillin-allergy)' },
  { genericKey: 'azithromycin', brand: 'Odazyth 500', company: 'ACI Limited', pack: '3×5', priceLabel: '৳40.00', priceNum: 40, dentalUse: 'Oral infections, dental prophylaxis alternative' },
  { genericKey: 'azithromycin', brand: 'Azalid 500', company: 'Orion Pharma Ltd', pack: '3×4', priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Dental & oral infections' },
  { genericKey: 'azithromycin', brand: 'Zithrin 500', company: 'Renata PLC', pack: '3×5', priceLabel: '৳40.00', priceNum: 40, dentalUse: 'Dental infections (alternative to amoxicillin)' },
  { genericKey: 'azithromycin', brand: 'Azicin 500', company: 'Opsonin Pharma Ltd', pack: '2×7', priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Periapical/periodontal infections' },
  { genericKey: 'azithromycin', brand: 'Romycin 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: '2×10', priceLabel: '৳40.00', priceNum: 40, dentalUse: 'Orofacial infections, macrolide alternative' },
  { genericKey: 'azithromycin', brand: 'Zithrox 500', company: 'Eskayef Pharmaceuticals Ltd', pack: '2×6', priceLabel: '৳40.00', priceNum: 40, dentalUse: 'Dental infections in penicillin allergy' },
  { genericKey: 'azithromycin', brand: 'Azyth 500', company: 'SANDOZ (A Novartis Division)', pack: '3×3', priceLabel: '৳55.50', priceNum: 55.5, dentalUse: 'Dental & oral bacterial infections' },

  { genericKey: 'ibuprofen', brand: 'Profen 400', company: 'ACME Laboratories Ltd', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Dental/pulpal pain, post-extraction swelling, pericoronitis' },
  { genericKey: 'ibuprofen', brand: 'Inflam 400', company: 'Synovia Pharma PLC', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Inflammatory dental pain, post-surgical analgesia' },
  { genericKey: 'ibuprofen', brand: 'Flamex 400', company: 'ACI Limited', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Dental pain, postoperative swelling' },
  { genericKey: 'ibuprofen', brand: 'Reumafen 400', company: 'Beximco Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'TMJ pain, pulpitis, dental pain' },
  { genericKey: 'ibuprofen', brand: 'Advel 400', company: 'Opsonin Pharma Ltd', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Post-operative dental pain, alveolar osteitis' },
  { genericKey: 'ibuprofen', brand: 'Intaflam 400', company: 'Incepta Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Dental pain, orofacial inflammation' },
  { genericKey: 'ibuprofen', brand: 'Serviprofen 400', company: 'SANDOZ (Novartis BD)', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Dental/oral pain and inflammation' },
  { genericKey: 'ibuprofen', brand: 'Neurofen 400', company: 'Globe Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.42', priceNum: 1.42, dentalUse: 'Dental pain, inflammatory conditions' },
  { genericKey: 'ibuprofen', brand: 'Anaflam 400', company: 'Asiatic Laboratories Ltd', pack: '10×10', priceLabel: '৳1.43', priceNum: 1.43, dentalUse: 'Post-extraction analgesia' },
  { genericKey: 'ibuprofen', brand: 'Erofen 400', company: 'Edruc Limited', pack: "100's", priceLabel: '৳1.35', priceNum: 1.35, dentalUse: 'Dental/periapical pain' },
  { genericKey: 'ibuprofen', brand: 'Siflam 400', company: 'Silva Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.20', priceNum: 1.2, dentalUse: 'Dental inflammation & pain' },
  { genericKey: 'ibuprofen', brand: 'Deflam 400', company: 'Desh Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Post-operative orofacial pain' },

  { genericKey: 'diclofenac', brand: 'Clofenac 50', company: 'Square Pharmaceuticals PLC', pack: '20×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Post-surgical dental pain & swelling, TMJ, alveolar osteitis' },
  { genericKey: 'diclofenac', brand: 'A-Fenac 50', company: 'ACME Laboratories Ltd', pack: '10×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Inflammatory dental/orofacial pain' },
  { genericKey: 'diclofenac', brand: 'Diclofen 50', company: 'Opsonin Pharma Ltd', pack: '10×10', priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Post-operative dental pain, pericoronitis' },
  { genericKey: 'diclofenac', brand: 'Mobifen 50', company: 'ACI Limited', pack: '10×10', priceLabel: '৳0.88', priceNum: 0.88, dentalUse: 'Dental & orofacial pain relief' },
  { genericKey: 'diclofenac', brand: 'Intafenac 50', company: 'Incepta Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳0.75', priceNum: 0.75, dentalUse: 'Post-extraction pain, dental swelling' },
  { genericKey: 'diclofenac', brand: 'Anodyne 50', company: 'Ibn Sina Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Dental pain, post-operative analgesia' },
  { genericKey: 'diclofenac', brand: 'Jefenac 50', company: 'Ad-din Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Orofacial pain, dental infections' },
  { genericKey: 'diclofenac', brand: 'Voltalin 50', company: 'Nevian Lifescience PLC', pack: '10×10', priceLabel: '৳8.50', priceNum: 8.5, dentalUse: 'Post-surgical dental pain (reference brand)' },
  { genericKey: 'diclofenac', brand: 'Genac 50', company: 'Globe Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳1.20', priceNum: 1.2, dentalUse: 'Dental & TMJ pain' },
  { genericKey: 'diclofenac', brand: 'Hitflam 50', company: 'Ambee Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳0.84', priceNum: 0.84, dentalUse: 'Dental pain, swelling' },
  { genericKey: 'diclofenac', brand: 'Fengel 50', company: 'Pharmadesh Laboratories Ltd', pack: "100's", priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Postoperative orofacial pain' },
  { genericKey: 'diclofenac', brand: 'Alterin 50', company: 'Euro Pharma Ltd', pack: '10×10', priceLabel: '৳1.00', priceNum: 1, dentalUse: 'Dental & oral pain' },

  { genericKey: 'paracetamol', brand: 'Napa 500', company: 'Beximco Pharmaceuticals Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Mild-moderate dental pain, fever, post-extraction analgesia' },
  { genericKey: 'paracetamol', brand: 'Ace 500', company: 'Square Pharmaceuticals PLC', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Toothache, post-operative pain, fever' },
  { genericKey: 'paracetamol', brand: 'Renova 500', company: 'Renata PLC', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Dental pain, post-extraction analgesia' },
  { genericKey: 'paracetamol', brand: 'Fevamol 500', company: 'Incepta Pharmaceuticals Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Toothache, mild dental pain' },
  { genericKey: 'paracetamol', brand: 'Neocetamol 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Post-operative dental pain' },
  { genericKey: 'paracetamol', brand: 'Paracet 500', company: 'ACI Limited', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Dental pain, fever associated with dental infections' },
  { genericKey: 'paracetamol', brand: 'Metacin 500', company: 'ACME Laboratories Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Mild analgesic for dental use' },
  { genericKey: 'paracetamol', brand: 'Bari 500', company: 'Opsonin Pharma Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Toothache, mild dental pain' },
  { genericKey: 'paracetamol', brand: 'Fast 500', company: 'General Pharmaceuticals Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Dental pain relief, fever control' },
  { genericKey: 'paracetamol', brand: 'Ceta 500', company: 'Drug International Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Post-extraction pain' },
  { genericKey: 'paracetamol', brand: 'G-Paracetamol 500', company: 'Gonoshasthaya Pharma Ltd', pack: "100's", priceLabel: '৳1.20', priceNum: 1.2, dentalUse: 'Toothache, mild oral pain' },
  { genericKey: 'paracetamol', brand: 'Dolomol 500', company: 'Beximco Pharmaceuticals Ltd', pack: "100's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Dental pain, analgesic for dental use' },

  { genericKey: 'lidocaine', brand: 'Jasocaine 2%', company: 'Jayson Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳~30', priceNum: 30, dentalUse: 'Inferior alveolar nerve block, infiltration anesthesia', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'G-Lignocaine 2%', company: 'Gonoshasthaya Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳~30', priceNum: 30, dentalUse: 'Local dental anesthesia, nerve blocks', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'Chemocain 2%', company: 'Chemist Laboratories Ltd', pack: 'Vial', priceLabel: '৳~35', priceNum: 35, dentalUse: 'Dental nerve block, infiltration', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'Xylonum 5%', company: 'Incepta Pharmaceuticals Ltd', pack: '15gm tube', priceLabel: 'N/A', priceNum: 0, dentalUse: 'Topical surface anesthesia pre-injection, mucosal anesthesia', dosageForm: '5% Ointment' },
  { genericKey: 'lidocaine', brand: 'Jasocaine 1%', company: 'Jayson Pharmaceuticals Ltd', pack: 'Ampoule', priceLabel: '৳~20', priceNum: 20, dentalUse: 'Infiltration anesthesia, field blocks', dosageForm: '1% Injection' },
  { genericKey: 'lidocaine', brand: 'Jasocaine 4%', company: 'Jayson Pharmaceuticals Ltd', pack: 'Ampoule', priceLabel: '৳~40', priceNum: 40, dentalUse: 'Topical application, high-concentration nerve block', dosageForm: '4% Solution' },
  { genericKey: 'lidocaine', brand: 'Z-Lidocaine 2%', company: 'Ziska Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳~28', priceNum: 28, dentalUse: 'Dental local anesthesia', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'Analidocaine 2%', company: 'ACI Limited', pack: 'Vial', priceLabel: '৳~30', priceNum: 30, dentalUse: 'Dental nerve block, local anesthesia', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'Lignocaine 2% Inj', company: 'General Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳~28', priceNum: 28, dentalUse: 'Infiltration & nerve block anesthesia', dosageForm: '2% Injection' },
  { genericKey: 'lidocaine', brand: 'Lidayn Spray 15%', company: 'Imported/BD distributors', pack: '100ml can', priceLabel: '৳~800', priceNum: 800, dentalUse: 'Surface anesthesia before injection, mucosal procedures', dosageForm: '15% Spray' },
  { genericKey: 'lidocaine', brand: 'SK-Caine 2%', company: 'Eskayef Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳~30', priceNum: 30, dentalUse: 'Dental local anesthesia, nerve blocks', dosageForm: '2% Injection' },

  { genericKey: 'dexamethasone', brand: 'D Cort 0.5mg', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Post-surgical edema after wisdom tooth removal, severe allergic reactions' },
  { genericKey: 'dexamethasone', brand: 'Dexam 0.5mg', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Reduction of post-operative swelling' },
  { genericKey: 'dexamethasone', brand: 'Oradex 0.5mg', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Oral inflammation, post-surgical swelling' },
  { genericKey: 'dexamethasone', brand: 'Decadron 0.5mg', company: 'ACI Limited', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Anti-inflammatory in dentistry, allergen control' },
  { genericKey: 'dexamethasone', brand: 'Rinderon 0.5mg', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Post-surgical orofacial edema' },
  { genericKey: 'dexamethasone', brand: 'Deltasone 0.5mg', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Corticosteroid for dental post-operative care' },
  { genericKey: 'dexamethasone', brand: 'Dexona 0.5mg', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Swelling control post-surgery, OMFS' },
  { genericKey: 'dexamethasone', brand: 'Dekson 0.5mg', company: 'Drug International Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Oral inflammatory conditions' },
  { genericKey: 'dexamethasone', brand: 'Hexadrol 0.5mg', company: 'General Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Post-extraction edema, orofacial inflammatory conditions' },
  { genericKey: 'dexamethasone', brand: 'Sterodex 0.5mg', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Post-surgical dental inflammation control' },
  { genericKey: 'dexamethasone', brand: 'Dexason 0.5mg', company: 'Renata PLC', pack: "20's", priceLabel: '৳~2.00', priceNum: 2, dentalUse: 'Anti-inflammatory for wisdom tooth removal' },

  { genericKey: 'diazepam', brand: 'Sedil 5mg', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Dental anxiety, pre-medication for oral surgery' },
  { genericKey: 'diazepam', brand: 'D Pam 5mg', company: 'General Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Conscious sedation adjunct, phobic patients' },
  { genericKey: 'diazepam', brand: 'Risolid 5mg', company: 'ACI Limited', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Dental anxiety, muscle relaxant for TMJ' },
  { genericKey: 'diazepam', brand: 'Valium 5mg', company: 'Roche BD / Various', pack: "20's", priceLabel: '৳~5.00', priceNum: 5, dentalUse: 'Dental fear/phobia management, pre-medication' },
  { genericKey: 'diazepam', brand: 'Antenex 5mg', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Anxiety relief before dental procedure' },
  { genericKey: 'diazepam', brand: 'Denpam 5mg', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Anxiolysis, TMJ muscle spasm' },
  { genericKey: 'diazepam', brand: 'Valpam 5mg', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Dental pre-medication, anxiety control' },
  { genericKey: 'diazepam', brand: 'Diazin 5mg', company: 'Drug International Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Pre-surgical sedation, dental anxiety' },
  { genericKey: 'diazepam', brand: 'Calmpose 5mg', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Dental phobia, pre-medication' },
  { genericKey: 'diazepam', brand: 'Tranquo 5mg', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Conscious sedation before extraction' },
  { genericKey: 'diazepam', brand: 'Paxum 5mg', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳~3.00', priceNum: 3, dentalUse: 'Dental anxiety, TMJ pain with muscle spasm' },

  { genericKey: 'chlorhexidine', brand: 'Hexidine', company: 'Various BD companies', pack: '250ml', priceLabel: '৳~90', priceNum: 90, dentalUse: 'Plaque control, gingivitis, post-op socket care', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Corsodyl', company: 'Various/Imported', pack: '300ml', priceLabel: '৳~120', priceNum: 120, dentalUse: 'Periodontal care, post-extraction hygiene', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Chlorhex', company: 'Square Pharmaceuticals PLC', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral antisepsis, pre/post-operative rinse', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Hexarinse', company: 'Opsonin Pharma Ltd', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Dental plaque control, gingivitis', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Periogard', company: 'Colgate/Importers BD', pack: '473ml', priceLabel: '৳~350', priceNum: 350, dentalUse: 'Periodontal maintenance, post-surgical rinse', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Mouthgard', company: 'Incepta Pharmaceuticals Ltd', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Post-extraction, scaling aftercare', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Chlorhex Gel 1%', company: 'Various BD', pack: '75gm tube', priceLabel: '৳~120', priceNum: 120, dentalUse: 'Intra-pocket delivery, ulcer treatment', dosageForm: '1% Gel' },
  { genericKey: 'chlorhexidine', brand: 'Heximed', company: 'ACI Limited', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral hygiene in periodontal disease', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Perioclean', company: 'Beximco Pharmaceuticals Ltd', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Post-operative oral hygiene', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Antisep', company: 'Eskayef Pharmaceuticals Ltd', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Antibacterial mouth rinse for dental use', dosageForm: '0.2% Mouthwash' },
  { genericKey: 'chlorhexidine', brand: 'Hexol', company: 'ACME Laboratories Ltd', pack: '200ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Plaque control, ANUG adjunct, gingivitis', dosageForm: '0.2% Mouthwash' },

  { genericKey: 'nystatin', brand: 'Nistatin Susp', company: 'Square Pharmaceuticals PLC', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral candidiasis (thrush), denture stomatitis', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Candistatin', company: 'ACI Limited', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral candidiasis in denture wearers', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Mycostat', company: 'Opsonin Pharma Ltd', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Fungal stomatitis, angular cheilitis', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Nystat', company: 'Beximco Pharmaceuticals Ltd', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral thrush, candidal infections', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Nyderm', company: 'Incepta Pharmaceuticals Ltd', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral candidiasis management', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Fungistatin', company: 'Eskayef Pharmaceuticals Ltd', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Denture-related stomatitis, thrush', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Mycotatin', company: 'Globe Pharmaceuticals Ltd', pack: "28's", priceLabel: '৳~10/tab', priceNum: 10, dentalUse: 'Oral candidiasis, GI prophylaxis', dosageForm: '500,000 IU Tab' },
  { genericKey: 'nystatin', brand: 'Nilstat', company: 'Drug International Ltd', pack: '30ml', priceLabel: '৳~75', priceNum: 75, dentalUse: 'Oral thrush, neonatal candidiasis', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Biofungin', company: 'Biopharma Limited', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral fungal infections', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Fungilin', company: 'Renata PLC', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Candidiasis in immunocompromised dental patients', dosageForm: '100,000 IU/ml Oral suspension' },
  { genericKey: 'nystatin', brand: 'Penistatin', company: 'Popular Pharmaceuticals Ltd', pack: '30ml', priceLabel: '৳~80', priceNum: 80, dentalUse: 'Oral thrush, denture stomatitis', dosageForm: '100,000 IU/ml Oral suspension' },

  { genericKey: 'clindamycin', brand: 'Clinsol 300', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Penicillin-allergy dental infections, osteomyelitis of jaw' },
  { genericKey: 'clindamycin', brand: 'Clindamax 300', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Severe odontogenic infections, anaerobic coverage' },
  { genericKey: 'clindamycin', brand: 'Dalacin C 300', company: 'Pfizer (imported/BD)', pack: "16's", priceLabel: '৳~25', priceNum: 25, dentalUse: 'Deep space dental infections, bone infections' },
  { genericKey: 'clindamycin', brand: 'Clinimycin 300', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Dental abscess in penicillin-allergic patients' },
  { genericKey: 'clindamycin', brand: 'Clindacin 300', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Odontogenic infections, periodontal abscess' },
  { genericKey: 'clindamycin', brand: 'Klinda 300', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Resistant dental infections' },
  { genericKey: 'clindamycin', brand: 'Cling 300', company: 'ACI Limited', pack: "20's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Dental & jaw bone infections' },

  { genericKey: 'cefixime', brand: 'Cef-3 200', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Odontogenic infections resistant to amoxicillin' },
  { genericKey: 'cefixime', brand: 'Tofib 200', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Dental infections, broad-spectrum cephalosporin cover' },
  { genericKey: 'cefixime', brand: 'Cefolac 200', company: 'Beacon Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Periapical infections in beta-lactam allergy work-up' },
  { genericKey: 'cefixime', brand: 'Maxpro 200', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳15.00', priceNum: 15, dentalUse: 'Dental abscess, post-surgical infection' },
  { genericKey: 'cefixime', brand: 'Ceforal 200', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Odontogenic infections' },
  { genericKey: 'cefixime', brand: 'Trustcef 200', company: 'Renata PLC', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Dental & soft tissue infections' },

  { genericKey: 'doxycycline', brand: 'Doxyl 100', company: 'Aristopharma Ltd', pack: "10's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Aggressive/refractory periodontitis adjunct' },
  { genericKey: 'doxycycline', brand: 'Biodoxi 100', company: 'ACI Limited', pack: "10's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Chronic periodontitis, perio-systemic link cases' },
  { genericKey: 'doxycycline', brand: 'Doxyrid 100', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Adjunct to scaling & root planing' },
  { genericKey: 'doxycycline', brand: 'Doximax 100', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Periodontal infections, MRONJ prophylaxis option' },
  { genericKey: 'doxycycline', brand: 'Doxycal 100', company: 'Renata PLC', pack: "10's", priceLabel: '৳1.50', priceNum: 1.5, dentalUse: 'Refractory dental infections, tetracycline-responsive cases' },

  { genericKey: 'mefenamic', brand: 'Ponstan 500', company: 'Sanofi/Various BD', pack: '10×10', priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Moderate dental pain, dysmenorrhea-associated TMJ pain' },
  { genericKey: 'mefenamic', brand: 'Mefnon 500', company: 'Drug International Ltd', pack: '10×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Post-extraction & pulpitis pain' },
  { genericKey: 'mefenamic', brand: 'Maxgesic 500', company: 'Beacon Pharmaceuticals Ltd', pack: '10×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Dental pain & inflammation' },
  { genericKey: 'mefenamic', brand: 'Forapain 500', company: 'ACI Limited', pack: '10×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Moderate orofacial pain relief' },
  { genericKey: 'mefenamic', brand: 'Tarpon 500', company: 'Opsonin Pharma Ltd', pack: '10×10', priceLabel: '৳2.00', priceNum: 2, dentalUse: 'Dental pain, mild-moderate inflammation' },

  { genericKey: 'tranexamic', brand: 'Texamic 500', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Post-extraction bleeding control, anticoagulated patients' },
  { genericKey: 'tranexamic', brand: 'Transamin 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Hemostasis after oral surgery' },
  { genericKey: 'tranexamic', brand: 'TXA 500', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Bleeding socket management, hemophilia dental care' },
  { genericKey: 'tranexamic', brand: 'Hemostat 500', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Peri-operative bleeding control in dental surgery' },

  { genericKey: 'povidoneIodine', brand: 'Povisept Gargle', company: 'Square Pharmaceuticals PLC', pack: '100ml', priceLabel: '৳~70', priceNum: 70, dentalUse: 'Pre-procedural oral antisepsis, oral ulcers', dosageForm: '1% Mouthwash/Gargle' },
  { genericKey: 'povidoneIodine', brand: 'Betadine Gargle', company: 'Mundipharma/Various BD', pack: '120ml', priceLabel: '৳~110', priceNum: 110, dentalUse: 'Pre-surgical mouth rinse, ANUG adjunct', dosageForm: '1% Mouthwash/Gargle' },
  { genericKey: 'povidoneIodine', brand: 'Iodex Gargle', company: 'ACI Limited', pack: '100ml', priceLabel: '৳~70', priceNum: 70, dentalUse: 'Oral antisepsis before extraction', dosageForm: '1% Mouthwash/Gargle' },
  { genericKey: 'povidoneIodine', brand: 'PVP Gargle', company: 'Opsonin Pharma Ltd', pack: '100ml', priceLabel: '৳~65', priceNum: 65, dentalUse: 'Pericoronitis adjunct rinse, denture sore mouth', dosageForm: '1% Mouthwash/Gargle' },

  { genericKey: 'triamcinolone', brand: 'Kenacort Orabase', company: 'Various/Imported BD', pack: '5gm tube', priceLabel: '৳~150', priceNum: 150, dentalUse: 'Recurrent aphthous ulcers, oral lichen planus' },
  { genericKey: 'triamcinolone', brand: 'Oracort Paste', company: 'ACME Laboratories Ltd', pack: '5gm tube', priceLabel: '৳~130', priceNum: 130, dentalUse: 'Aphthous ulcers, traumatic mucosal ulcers' },
  { genericKey: 'triamcinolone', brand: 'Tricort Oral Paste', company: 'Drug International Ltd', pack: '5gm tube', priceLabel: '৳~120', priceNum: 120, dentalUse: 'Oral ulcers, mucositis' },
  { genericKey: 'triamcinolone', brand: 'Dermacort Oral Gel', company: 'Beacon Pharmaceuticals Ltd', pack: '5gm tube', priceLabel: '৳~120', priceNum: 120, dentalUse: 'Erosive oral lesions, post-biopsy site care' },

  { genericKey: 'amoxiclav875', brand: 'Moxaclav DS', company: 'Square Pharmaceuticals PLC', pack: "14's", priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Severe odontogenic infections needing higher amoxicillin dosing' },
  { genericKey: 'amoxiclav875', brand: 'Tyclav 1g', company: 'Beximco Pharmaceuticals Ltd', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Deep space dental infections, refractory abscess' },
  { genericKey: 'amoxiclav875', brand: 'Augment DS', company: 'Eskayef Pharmaceuticals Ltd', pack: "14's", priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Post-surgical oral infections requiring higher dose' },
  { genericKey: 'amoxiclav875', brand: 'Clavoxil DS', company: 'Renata PLC', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Resistant odontogenic infections' },
  { genericKey: 'amoxiclav875', brand: 'Avloclav DS', company: 'ACI Limited', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Severe dental abscess, beta-lactamase producers' },
  { genericKey: 'amoxiclav875', brand: 'Bioclavid DS', company: 'Novartis (Bangladesh) Ltd', pack: "14's", priceLabel: '৳48.00', priceNum: 48, dentalUse: 'Severe maxillofacial space infections' },
  { genericKey: 'amoxiclav875', brand: 'Co-Clav DS', company: 'Ad-din Pharmaceuticals Ltd', pack: "14's", priceLabel: '৳46.00', priceNum: 46, dentalUse: 'Resistant dental infections, higher-dose option' },
  { genericKey: 'amoxiclav875', brand: 'Clacido DS', company: 'Healthcare Pharmaceuticals Ltd', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Oral/maxillofacial infections, severe presentation' },
  { genericKey: 'amoxiclav875', brand: 'Fimoxyclav DS', company: 'Synovia Pharma PLC', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Perimandibular space infections, higher dosing' },
  { genericKey: 'amoxiclav875', brand: 'Demoxiclave DS', company: 'Drug International Ltd', pack: "14's", priceLabel: '৳44.00', priceNum: 44, dentalUse: 'Severe pericoronitis, post-extraction infection' },

  { genericKey: 'cephalexin', brand: 'Cepha-500', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental/soft tissue infections, penicillin-allergy alternative' },
  { genericKey: 'cephalexin', brand: 'Keflexin 500', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Odontogenic infections, first-gen cephalosporin cover' },
  { genericKey: 'cephalexin', brand: 'Cephlin 500', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental abscess, periodontal infection' },
  { genericKey: 'cephalexin', brand: 'Cephalex 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Post-extraction prophylaxis, soft tissue infection' },
  { genericKey: 'cephalexin', brand: 'Cevex 500', company: 'ACI Limited', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental/oral infections' },
  { genericKey: 'cephalexin', brand: 'Lexin 500', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.50', priceNum: 5.5, dentalUse: 'Odontogenic & periapical infections' },
  { genericKey: 'cephalexin', brand: 'Cefacin 500', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental abscess in penicillin-sensitive patients' },
  { genericKey: 'cephalexin', brand: 'Rancef 500', company: 'Renata PLC', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Acute dental infections' },
  { genericKey: 'cephalexin', brand: 'Globacef 500', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.80', priceNum: 5.8, dentalUse: 'Dental & periodontal infections' },
  { genericKey: 'cephalexin', brand: 'Sinacef 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Odontogenic infections, soft tissue cover' },

  { genericKey: 'cephradine', brand: 'Velosef 500', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳6.50', priceNum: 6.5, dentalUse: 'Dental & oral soft tissue infections (widely used 1st-gen cephalosporin)' },
  { genericKey: 'cephradine', brand: 'Cradex 500', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Odontogenic infections, post-extraction prophylaxis' },
  { genericKey: 'cephradine', brand: 'Cefrad 500', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental abscess, periapical infection' },
  { genericKey: 'cephradine', brand: 'Cephradex 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Periodontal & dental infections' },
  { genericKey: 'cephradine', brand: 'Radex 500', company: 'ACI Limited', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental/oral soft tissue infections' },
  { genericKey: 'cephradine', brand: 'Cefoxin 500', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.50', priceNum: 5.5, dentalUse: 'Odontogenic infections' },
  { genericKey: 'cephradine', brand: 'Sefril 500', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Dental abscess, soft tissue cover' },
  { genericKey: 'cephradine', brand: 'Cradine 500', company: 'Renata PLC', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Acute dental & periodontal infections' },
  { genericKey: 'cephradine', brand: 'Globradine 500', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.80', priceNum: 5.8, dentalUse: 'Dental infections, penicillin-sensitive patients' },
  { genericKey: 'cephradine', brand: 'Sinaradine 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Odontogenic & soft tissue infections' },

  { genericKey: 'cefuroxime', brand: 'Cef-2 250', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Beta-lactamase resistant odontogenic infections' },
  { genericKey: 'cefuroxime', brand: 'Cefoxim 250', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳23.00', priceNum: 23, dentalUse: 'Dental infections resistant to amoxicillin' },
  { genericKey: 'cefuroxime', brand: 'Roxim 250', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Post-surgical oral infections' },
  { genericKey: 'cefuroxime', brand: 'Cefurox 250', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳21.00', priceNum: 21, dentalUse: 'Odontogenic infections, 2nd-gen cover' },
  { genericKey: 'cefuroxime', brand: 'Maxef 250', company: 'ACI Limited', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Dental abscess with resistant organisms' },
  { genericKey: 'cefuroxime', brand: 'Curoxime 250', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Refractory dental infections' },
  { genericKey: 'cefuroxime', brand: 'Biocef-250', company: 'Renata PLC', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Dental & maxillofacial infections' },
  { genericKey: 'cefuroxime', brand: 'Cefax 250', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Severe odontogenic infections' },
  { genericKey: 'cefuroxime', brand: 'Furoxime 250', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳21.50', priceNum: 21.5, dentalUse: 'Periapical & periodontal infections' },
  { genericKey: 'cefuroxime', brand: 'Zinoxime 250', company: 'Drug International Ltd', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Dental infections, broad 2nd-gen cephalosporin cover' },

  { genericKey: 'ceftriaxone', brand: 'Triaxon 1g', company: 'Square Pharmaceuticals PLC', pack: 'Vial', priceLabel: '৳120.00', priceNum: 120, dentalUse: 'Severe odontogenic infections, OMFS hospital cases, jaw osteomyelitis' },
  { genericKey: 'ceftriaxone', brand: 'Ceftrex 1g', company: 'Beximco Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳115.00', priceNum: 115, dentalUse: 'Hospital-level facial space infections' },
  { genericKey: 'ceftriaxone', brand: 'Triacef 1g', company: 'ACME Laboratories Ltd', pack: 'Vial', priceLabel: '৳115.00', priceNum: 115, dentalUse: 'Severe maxillofacial infections' },
  { genericKey: 'ceftriaxone', brand: 'Cef-Force 1g', company: 'Incepta Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳110.00', priceNum: 110, dentalUse: 'Odontogenic infections requiring IV cover' },
  { genericKey: 'ceftriaxone', brand: 'Maxcef 1g', company: 'ACI Limited', pack: 'Vial', priceLabel: '৳115.00', priceNum: 115, dentalUse: 'Deep neck/facial space infections' },
  { genericKey: 'ceftriaxone', brand: 'Ceftron 1g', company: 'Opsonin Pharma Ltd', pack: 'Vial', priceLabel: '৳115.00', priceNum: 115, dentalUse: 'Hospital admission dental infections' },
  { genericKey: 'ceftriaxone', brand: 'Monocef 1g', company: 'Renata PLC', pack: 'Vial', priceLabel: '৳118.00', priceNum: 118, dentalUse: 'Severe odontogenic abscess, OMFS' },
  { genericKey: 'ceftriaxone', brand: 'Biotrixon 1g', company: 'Eskayef Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳115.00', priceNum: 115, dentalUse: 'Jaw bone infections, hospital cases' },
  { genericKey: 'ceftriaxone', brand: 'Trione 1g', company: 'Globe Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳112.00', priceNum: 112, dentalUse: 'Severe facial space infections' },
  { genericKey: 'ceftriaxone', brand: 'Rocephin 1g', company: 'Imported/Roche distributors BD', pack: 'Vial', priceLabel: '৳350.00', priceNum: 350, dentalUse: 'Reference brand, severe odontogenic sepsis' },

  { genericKey: 'cefepime', brand: 'Cefepim Square 1g', company: 'Square Pharmaceuticals PLC', pack: 'Vial', priceLabel: '৳280.00', priceNum: 280, dentalUse: 'Hospital-level maxillofacial infections, 4th-gen cover' },
  { genericKey: 'cefepime', brand: 'Fepime 1g', company: 'Beximco Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳270.00', priceNum: 270, dentalUse: 'Severe odontogenic sepsis, broad-spectrum cover' },
  { genericKey: 'cefepime', brand: 'Cef-4 1g', company: 'Incepta Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳260.00', priceNum: 260, dentalUse: 'Resistant maxillofacial infections' },
  { genericKey: 'cefepime', brand: 'Pimecef 1g', company: 'ACME Laboratories Ltd', pack: 'Vial', priceLabel: '৳270.00', priceNum: 270, dentalUse: 'Hospital OMFS cases' },
  { genericKey: 'cefepime', brand: 'Cefimax 1g', company: 'ACI Limited', pack: 'Vial', priceLabel: '৳270.00', priceNum: 270, dentalUse: 'Severe deep space infections of the jaw' },
  { genericKey: 'cefepime', brand: 'Forticef 1g', company: 'Opsonin Pharma Ltd', pack: 'Vial', priceLabel: '৳270.00', priceNum: 270, dentalUse: 'Immunocompromised dental infection cases' },
  { genericKey: 'cefepime', brand: 'Forpime 1g', company: 'Renata PLC', pack: 'Vial', priceLabel: '৳280.00', priceNum: 280, dentalUse: 'Hospital-level odontogenic infections' },
  { genericKey: 'cefepime', brand: 'Cepimax 1g', company: 'Eskayef Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳270.00', priceNum: 270, dentalUse: 'Severe facial space infections, 4th-gen cover' },
  { genericKey: 'cefepime', brand: 'Quadcef 1g', company: 'Globe Pharmaceuticals Ltd', pack: 'Vial', priceLabel: '৳260.00', priceNum: 260, dentalUse: 'Resistant maxillofacial infections' },
  { genericKey: 'cefepime', brand: 'Maxipime 1g', company: 'Imported distributors BD', pack: 'Vial', priceLabel: '৳450.00', priceNum: 450, dentalUse: 'Reference brand, severe hospital-level OMFS infection' },

  { genericKey: 'cefiximeClav', brand: 'Cef-3 CV', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Beta-lactamase-producing resistant odontogenic infections' },
  { genericKey: 'cefiximeClav', brand: 'Tofib-CV', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Resistant periapical/periodontal infections' },
  { genericKey: 'cefiximeClav', brand: 'Maxpro CV', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳26.00', priceNum: 26, dentalUse: 'Dental abscess with resistant organisms' },
  { genericKey: 'cefiximeClav', brand: 'Ceforal-CV', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Severe odontogenic infections' },
  { genericKey: 'cefiximeClav', brand: 'Trustcef-CV', company: 'Renata PLC', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Post-surgical resistant infections' },
  { genericKey: 'cefiximeClav', brand: 'Cefolac-CV', company: 'Beacon Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Beta-lactam-allergy work-up alternative' },
  { genericKey: 'cefiximeClav', brand: 'Cefspan-CV', company: 'ACI Limited', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Refractory dental infections' },
  { genericKey: 'cefiximeClav', brand: 'Cefget-CV', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳25.00', priceNum: 25, dentalUse: 'Resistant odontogenic infections' },
  { genericKey: 'cefiximeClav', brand: 'Cefimix-CV', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳24.00', priceNum: 24, dentalUse: 'Dental & soft tissue infections, augmented cover' },
  { genericKey: 'cefiximeClav', brand: 'Globacef-CV', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳24.00', priceNum: 24, dentalUse: 'Resistant periodontal infections' },

  { genericKey: 'cefuroximeClav', brand: 'Cefoxim-CV', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Resistant odontogenic infections, augmented 2nd-gen cover' },
  { genericKey: 'cefuroximeClav', brand: 'Cef-2 CV', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Beta-lactamase-resistant dental infections' },
  { genericKey: 'cefuroximeClav', brand: 'Roxim-CV', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Severe odontogenic infections' },
  { genericKey: 'cefuroximeClav', brand: 'Cefurox-CV', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳31.00', priceNum: 31, dentalUse: 'Resistant periapical infections' },
  { genericKey: 'cefuroximeClav', brand: 'Maxef-CV', company: 'ACI Limited', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Deep space dental infections' },
  { genericKey: 'cefuroximeClav', brand: 'Curoxime-CV', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Refractory odontogenic infections' },
  { genericKey: 'cefuroximeClav', brand: 'Biocef-CV', company: 'Renata PLC', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Severe dental & maxillofacial infections' },
  { genericKey: 'cefuroximeClav', brand: 'Cefax-CV', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Resistant odontogenic infections' },
  { genericKey: 'cefuroximeClav', brand: 'Furoxime-CV', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳31.00', priceNum: 31, dentalUse: 'Periapical & periodontal resistant infections' },
  { genericKey: 'cefuroximeClav', brand: 'Zinoxime-CV', company: 'Drug International Ltd', pack: "10's", priceLabel: '৳32.00', priceNum: 32, dentalUse: 'Dental infections, augmented 2nd-gen cover' },

  { genericKey: 'acyclovir', brand: 'Herpex 400', company: 'Square Pharmaceuticals PLC', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Primary herpetic gingivostomatitis, recurrent herpes labialis' },
  { genericKey: 'acyclovir', brand: 'Acivir 400', company: 'Beximco Pharmaceuticals Ltd', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Herpetic oral lesions' },
  { genericKey: 'acyclovir', brand: 'Acyrax 400', company: 'ACME Laboratories Ltd', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Recurrent herpes labialis, oral HSV' },
  { genericKey: 'acyclovir', brand: 'Maxovir 400', company: 'Incepta Pharmaceuticals Ltd', pack: "35's", priceLabel: '৳5.50', priceNum: 5.5, dentalUse: 'Herpetic stomatitis' },
  { genericKey: 'acyclovir', brand: 'Avirol 400', company: 'ACI Limited', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Oral herpes simplex infections' },
  { genericKey: 'acyclovir', brand: 'Herpinil 400', company: 'Opsonin Pharma Ltd', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Primary/recurrent herpetic oral lesions' },
  { genericKey: 'acyclovir', brand: 'Acyclo 400', company: 'Renata PLC', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Herpes labialis, gingivostomatitis' },
  { genericKey: 'acyclovir', brand: 'Heporal 400', company: 'Eskayef Pharmaceuticals Ltd', pack: "35's", priceLabel: '৳6.00', priceNum: 6, dentalUse: 'Oral HSV infections' },
  { genericKey: 'acyclovir', brand: 'Acivex 400', company: 'Globe Pharmaceuticals Ltd', pack: "35's", priceLabel: '৳5.80', priceNum: 5.8, dentalUse: 'Recurrent herpetic lesions' },
  { genericKey: 'acyclovir', brand: 'Zovirax 400', company: 'GSK/Imported distributors BD', pack: "35's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Reference brand for herpetic stomatitis' },

  { genericKey: 'valacyclovir', brand: 'Valavir 500', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳35.00', priceNum: 35, dentalUse: 'Recurrent herpes labialis, herpetic stomatitis (better bioavailability)' },
  { genericKey: 'valacyclovir', brand: 'Valcin 500', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳34.00', priceNum: 34, dentalUse: 'Oral herpes simplex, shorter dosing course' },
  { genericKey: 'valacyclovir', brand: 'Valex 500', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳34.00', priceNum: 34, dentalUse: 'Herpetic lip/oral lesions' },
  { genericKey: 'valacyclovir', brand: 'Valavex 500', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳33.00', priceNum: 33, dentalUse: 'Recurrent herpes labialis' },
  { genericKey: 'valacyclovir', brand: 'Valcure 500', company: 'ACI Limited', pack: "10's", priceLabel: '৳34.00', priceNum: 34, dentalUse: 'Herpetic gingivostomatitis' },
  { genericKey: 'valacyclovir', brand: 'Herpiclov 500', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳34.00', priceNum: 34, dentalUse: 'Oral HSV infections' },
  { genericKey: 'valacyclovir', brand: 'Valovir 500', company: 'Renata PLC', pack: "10's", priceLabel: '৳35.00', priceNum: 35, dentalUse: 'Recurrent herpes labialis' },
  { genericKey: 'valacyclovir', brand: 'Valtor 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳34.00', priceNum: 34, dentalUse: 'Herpetic stomatitis' },
  { genericKey: 'valacyclovir', brand: 'Valzo 500', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳33.00', priceNum: 33, dentalUse: 'Oral herpes lesions' },
  { genericKey: 'valacyclovir', brand: 'Valtrex 500', company: 'GSK/Imported distributors BD', pack: "10's", priceLabel: '৳95.00', priceNum: 95, dentalUse: 'Reference brand, recurrent herpes labialis' },

  { genericKey: 'fluconazole', brand: 'Flucon 150', company: 'Square Pharmaceuticals PLC', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Oral candidiasis unresponsive to topical therapy, denture stomatitis' },
  { genericKey: 'fluconazole', brand: 'Fungican 150', company: 'Beximco Pharmaceuticals Ltd', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Resistant oral candidiasis' },
  { genericKey: 'fluconazole', brand: 'Flucozole 150', company: 'ACME Laboratories Ltd', pack: "1's/4's", priceLabel: '৳29.00', priceNum: 29, dentalUse: 'Denture-related candidiasis' },
  { genericKey: 'fluconazole', brand: 'Difluzole 150', company: 'Incepta Pharmaceuticals Ltd', pack: "1's/4's", priceLabel: '৳28.00', priceNum: 28, dentalUse: 'Oral thrush in immunocompromised patients' },
  { genericKey: 'fluconazole', brand: 'Flucos 150', company: 'ACI Limited', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Systemic antifungal for oral candidiasis' },
  { genericKey: 'fluconazole', brand: 'Forcan 150', company: 'Opsonin Pharma Ltd', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Recurrent oral candidiasis' },
  { genericKey: 'fluconazole', brand: 'Flucoz 150', company: 'Renata PLC', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Denture stomatitis, angular cheilitis' },
  { genericKey: 'fluconazole', brand: 'Mycofin 150', company: 'Eskayef Pharmaceuticals Ltd', pack: "1's/4's", priceLabel: '৳30.00', priceNum: 30, dentalUse: 'Oral fungal infections' },
  { genericKey: 'fluconazole', brand: 'Fungidor 150', company: 'Globe Pharmaceuticals Ltd', pack: "1's/4's", priceLabel: '৳28.00', priceNum: 28, dentalUse: 'Topical-resistant oral candidiasis' },
  { genericKey: 'fluconazole', brand: 'Flusafe 150', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "1's/4's", priceLabel: '৳29.00', priceNum: 29, dentalUse: 'Oral candidiasis in denture wearers' },

  { genericKey: 'ketoconazole', brand: 'Ketocon 200', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Resistant oral candidiasis, angular cheilitis (second-line)' },
  { genericKey: 'ketoconazole', brand: 'Funtus 200', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Recurrent oral fungal infections' },
  { genericKey: 'ketoconazole', brand: 'Ketomex 200', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Denture stomatitis, fluconazole-resistant cases' },
  { genericKey: 'ketoconazole', brand: 'Fungitop 200', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Oral candidiasis, second-line therapy' },
  { genericKey: 'ketoconazole', brand: 'Ketoral 200', company: 'ACI Limited', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Angular cheilitis, chronic mucocutaneous candidiasis' },
  { genericKey: 'ketoconazole', brand: 'Mycoket 200', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Resistant oral fungal infections' },
  { genericKey: 'ketoconazole', brand: 'Ketozol 200', company: 'Renata PLC', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Oral candidiasis, second-line antifungal' },
  { genericKey: 'ketoconazole', brand: 'Fungizid 200', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳8.00', priceNum: 8, dentalUse: 'Denture-related fungal infection' },
  { genericKey: 'ketoconazole', brand: 'Dermazole 200', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳7.50', priceNum: 7.5, dentalUse: 'Resistant angular cheilitis' },
  { genericKey: 'ketoconazole', brand: 'Nizoral 200', company: 'Janssen/Imported distributors BD', pack: "10's", priceLabel: '৳22.00', priceNum: 22, dentalUse: 'Reference brand, resistant oral candidiasis' },

  { genericKey: 'penicillinV', brand: 'Pen-V-K 250', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Streptococcal odontogenic infections, narrow-spectrum first-line' },
  { genericKey: 'penicillinV', brand: 'Distaquaine 250', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Low-resistance dental infections' },
  { genericKey: 'penicillinV', brand: 'Phenocillin 250', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳2.30', priceNum: 2.3, dentalUse: 'Odontogenic streptococcal infections' },
  { genericKey: 'penicillinV', brand: 'V-Cillin 250', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.30', priceNum: 2.3, dentalUse: 'Dental abscess, narrow-spectrum cover' },
  { genericKey: 'penicillinV', brand: 'Penbex 250', company: 'ACI Limited', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Streptococcal pharyngitis with dental involvement' },
  { genericKey: 'penicillinV', brand: 'Pencom 250', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Odontogenic infections, low-resistance cases' },
  { genericKey: 'penicillinV', brand: 'Penorol 250', company: 'Renata PLC', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Dental & soft tissue infections' },
  { genericKey: 'penicillinV', brand: 'Vecillin 250', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Streptococcal dental infections' },
  { genericKey: 'penicillinV', brand: 'Pentab 250', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.30', priceNum: 2.3, dentalUse: 'Narrow-spectrum dental infection cover' },
  { genericKey: 'penicillinV', brand: 'Bipen 250', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.50', priceNum: 2.5, dentalUse: 'Odontogenic infections in low-resistance settings' },

  { genericKey: 'ampicillin', brand: 'Ampicin 500', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Odontogenic infections, alternative to amoxicillin' },
  { genericKey: 'ampicillin', brand: 'Ampilin 500', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Dental abscess, soft tissue infections' },
  { genericKey: 'ampicillin', brand: 'Penbritin 500', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Periapical infections' },
  { genericKey: 'ampicillin', brand: 'Ampimax 500', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.80', priceNum: 2.8, dentalUse: 'Dental infections, broad penicillin cover' },
  { genericKey: 'ampicillin', brand: 'Ampicillin-ACI 500', company: 'ACI Limited', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Odontogenic & soft tissue infections' },
  { genericKey: 'ampicillin', brand: 'Amcil 500', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Dental abscess in low-resistance settings' },
  { genericKey: 'ampicillin', brand: 'Ampitrex 500', company: 'Renata PLC', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Periodontal & dental infections' },
  { genericKey: 'ampicillin', brand: 'Ampex 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Odontogenic infections' },
  { genericKey: 'ampicillin', brand: 'Globapen 500', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳2.80', priceNum: 2.8, dentalUse: 'Dental & soft tissue infection cover' },
  { genericKey: 'ampicillin', brand: 'Sinapen 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳3.00', priceNum: 3, dentalUse: 'Odontogenic infections, alternative penicillin' },

  { genericKey: 'cloxacillin', brand: 'Cloxin 500', company: 'Square Pharmaceuticals PLC', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Penicillinase-producing Staph infections of jaw/soft tissue' },
  { genericKey: 'cloxacillin', brand: 'Ablexin 500', company: 'Beximco Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Resistant odontogenic soft tissue infections' },
  { genericKey: 'cloxacillin', brand: 'Orbenin 500', company: 'ACME Laboratories Ltd', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Staphylococcal jaw infections' },
  { genericKey: 'cloxacillin', brand: 'Cloxacap 500', company: 'Incepta Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳4.80', priceNum: 4.8, dentalUse: 'Penicillinase-resistant dental infections' },
  { genericKey: 'cloxacillin', brand: 'Staphylex 500', company: 'ACI Limited', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Soft tissue infections of orofacial region' },
  { genericKey: 'cloxacillin', brand: 'Closym 500', company: 'Opsonin Pharma Ltd', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Resistant Staph dental infections' },
  { genericKey: 'cloxacillin', brand: 'Cloxapen 500', company: 'Renata PLC', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Jaw bone & soft tissue Staph infections' },
  { genericKey: 'cloxacillin', brand: 'Bactiklox 500', company: 'Eskayef Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Penicillinase-producing dental infections' },
  { genericKey: 'cloxacillin', brand: 'Globaclox 500', company: 'Globe Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳4.80', priceNum: 4.8, dentalUse: 'Resistant Staph odontogenic infections' },
  { genericKey: 'cloxacillin', brand: 'Sinaclox 500', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "20's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Staphylococcal jaw/soft tissue infections' },

  { genericKey: 'ketorolac', brand: 'Ketorol 10', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Moderate-severe post-surgical dental pain, third molar surgery' },
  { genericKey: 'ketorolac', brand: 'Ketolac 10', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Short-term potent NSAID for dental pain' },
  { genericKey: 'ketorolac', brand: 'Ketovel 10', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳4.80', priceNum: 4.8, dentalUse: 'Post-extraction pain, alveolar osteitis' },
  { genericKey: 'ketorolac', brand: 'Ketonext 10', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳4.80', priceNum: 4.8, dentalUse: 'Severe dental pain, short course' },
  { genericKey: 'ketorolac', brand: 'Ketotab 10', company: 'ACI Limited', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Acute post-surgical dental pain' },
  { genericKey: 'ketorolac', brand: 'Ketogesic 10', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Moderate-severe orofacial pain' },
  { genericKey: 'ketorolac', brand: 'Ketofen 10', company: 'Renata PLC', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Third molar surgery analgesia' },
  { genericKey: 'ketorolac', brand: 'Ketomax 10', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳5.00', priceNum: 5, dentalUse: 'Post-surgical dental pain' },
  { genericKey: 'ketorolac', brand: 'Ketonil 10', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳4.80', priceNum: 4.8, dentalUse: 'Acute dental pain, short-term use' },
  { genericKey: 'ketorolac', brand: 'Toradol 10', company: 'Imported distributors BD', pack: "10's", priceLabel: '৳14.00', priceNum: 14, dentalUse: 'Reference brand, severe post-surgical dental pain' },

  { genericKey: 'etoricoxib', brand: 'Etorica 90', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Post-surgical dental pain/swelling, COX-2 selective (GI-sparing)' },
  { genericKey: 'etoricoxib', brand: 'Toricox 90', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Third molar surgery pain, GI-risk patients' },
  { genericKey: 'etoricoxib', brand: 'Etolib 90', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳17.00', priceNum: 17, dentalUse: 'Dental swelling & pain, short course' },
  { genericKey: 'etoricoxib', brand: 'Etogesic 90', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳17.00', priceNum: 17, dentalUse: 'Post-extraction inflammatory pain' },
  { genericKey: 'etoricoxib', brand: 'Coxetil 90', company: 'ACI Limited', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Dental pain in NSAID-GI-sensitive patients' },
  { genericKey: 'etoricoxib', brand: 'Etorix 90', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Moderate-severe dental inflammatory pain' },
  { genericKey: 'etoricoxib', brand: 'Etrocox 90', company: 'Renata PLC', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Post-surgical dental pain, short course' },
  { genericKey: 'etoricoxib', brand: 'Etomax 90', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳18.00', priceNum: 18, dentalUse: 'Dental swelling, COX-2 selective option' },
  { genericKey: 'etoricoxib', brand: 'Etoxib 90', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳17.00', priceNum: 17, dentalUse: 'Acute dental pain, GI-sparing' },
  { genericKey: 'etoricoxib', brand: 'Arcoxia 90', company: 'MSD/Imported distributors BD', pack: "10's", priceLabel: '৳45.00', priceNum: 45, dentalUse: 'Reference brand, post-surgical dental pain' },

  { genericKey: 'paracetamolIbuprofen', brand: 'Maxgesic Plus', company: 'Square Pharmaceuticals PLC', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Dual-mechanism analgesia for moderate-severe dental pain, third molar surgery' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Combidol', company: 'Beximco Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Post-extraction combination analgesia' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Paraflam Plus', company: 'ACME Laboratories Ltd', pack: "10's", priceLabel: '৳3.80', priceNum: 3.8, dentalUse: 'Dental pain requiring dual NSAID/analgesic action' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Duoflex', company: 'Incepta Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳3.80', priceNum: 3.8, dentalUse: 'Moderate dental pain, combination therapy' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Algin Plus', company: 'ACI Limited', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Post-surgical dental pain' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Dolofen Plus', company: 'Opsonin Pharma Ltd', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Dual analgesic for dental procedures' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Reumadol Plus', company: 'Renata PLC', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Third molar surgery analgesia' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Profenac Plus', company: 'Eskayef Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Moderate-severe dental pain' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Painex Plus', company: 'Globe Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳3.80', priceNum: 3.8, dentalUse: 'Post-operative dental pain' },
  { genericKey: 'paracetamolIbuprofen', brand: 'Synalgin', company: 'Ibn Sina Pharmaceuticals Ltd', pack: "10's", priceLabel: '৳4.00', priceNum: 4, dentalUse: 'Combination analgesia for dental procedures' },
]

export const DENTAL_DRUGS: BDDrug[] = DRUG_SEEDS.map((seed) => {
  const defaults = GENERIC_DEFAULTS[seed.genericKey]
  return {
    brand: seed.brand,
    generic: defaults.generic,
    category: defaults.category,
    dosageForm: seed.dosageForm ?? defaults.dosageForm,
    company: seed.company,
    pack: seed.pack,
    priceLabel: seed.priceLabel,
    priceNum: seed.priceNum,
    dentalUse: seed.dentalUse,
    defaultDosage: defaults.defaultDosage,
    defaultFrequency: defaults.defaultFrequency,
    defaultDuration: defaults.defaultDuration,
    defaultInstructions: defaults.defaultInstructions,
    defaultRoute: defaults.defaultRoute,
    ageDosing: defaults.ageDosing,
  }
})

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function searchDrugs(query: string): BDDrug[] {
  const q = normalize(query)
  if (!q) {
    return DENTAL_DRUGS.slice(0, 20)
  }

  return DENTAL_DRUGS
    .map((drug) => {
      const haystacks = [drug.brand, drug.generic, drug.company, drug.category, drug.dentalUse].map((item) => item.toLowerCase())
      const hasMatch = haystacks.some((item) => item.includes(q))
      if (!hasMatch) {
        return null
      }

      let score = 0
      if (drug.brand.toLowerCase().startsWith(q)) score += 5
      if (drug.generic.toLowerCase().startsWith(q)) score += 4
      if (drug.company.toLowerCase().includes(q)) score += 2
      if (drug.dentalUse.toLowerCase().includes(q)) score += 1
      score += q.length / Math.max(drug.brand.length, 1)

      return { drug, score }
    })
    .filter((item): item is { drug: BDDrug; score: number } => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.drug.brand.localeCompare(b.drug.brand)
    })
    .slice(0, 20)
    .map((item) => item.drug)
}

export function getDrugsByCategory(cat: string): BDDrug[] {
  const category = normalize(cat)
  return DENTAL_DRUGS.filter((drug) => drug.category.toLowerCase() === category)
}

export function getDrugsByGeneric(generic: string): BDDrug[] {
  const normalized = normalize(generic)
  return DENTAL_DRUGS.filter((drug) => drug.generic.toLowerCase() === normalized)
}
