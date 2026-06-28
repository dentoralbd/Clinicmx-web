export interface BDDrug {
  brand: string
  generic: string
  category:
    | 'Antibiotic'
    | 'Analgesic'
    | 'Anti-inflammatory'
    | 'Local anesthetic'
    | 'Antifungal'
    | 'Antiseptic'
    | 'Anxiolytic'
    | 'Steroid'
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

interface GenericDefaults {
  generic: string
  category: DrugCategory
  dosageForm: string
  defaultDosage: string
  defaultFrequency: string
  defaultDuration: string
  defaultInstructions: string
  defaultRoute: string
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
