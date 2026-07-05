// Bengali translations for medication defaults auto-filled from dentalDrugDatabase.ts.
// Keys must match the default* strings in that file verbatim; unmapped values fall back to English.

const ROUTE_BN: Record<string, string> = {
  Oral: 'মুখে সেব্য',
  'Oral suspension': 'মুখে সেব্য সাসপেনশন',
  Injection: 'ইনজেকশন',
  'Topical/Oral rinse': 'মুখ ধোয়ার জন্য (কুলকুচি)',
  'Topical (oral mucosa)': 'মুখের ভিতরে লাগানোর জন্য',
  'Topical (oral)': 'মুখে লাগানোর জন্য',
  Rectal: 'পায়ুপথে ব্যবহার্য',
}

const FREQUENCY_BN: Record<string, string> = {
  '1x daily': 'দিনে ১ বার',
  '1-2x daily': 'দিনে ১-২ বার',
  '2x daily': 'দিনে ২ বার',
  '2-3x daily': 'দিনে ২-৩ বার',
  '2-3x daily (rinse/gargle)': 'দিনে ২-৩ বার (কুলকুচি/গার্গল)',
  '2x daily (rinse 30 sec)': 'দিনে ২ বার (৩০ সেকেন্ড কুলকুচি)',
  '3x daily': 'দিনে ৩ বার',
  '3-4x daily': 'দিনে ৩-৪ বার',
  '4x daily': 'দিনে ৪ বার',
  '4x daily (after meals + bedtime)': 'দিনে ৪ বার (খাবারের পরে ও শোবার আগে)',
  'As required': 'প্রয়োজন অনুযায়ী',
  'Every 4-6h': 'প্রতি ৪-৬ ঘন্টা পর পর',
  'Every 6-8h': 'প্রতি ৬-৮ ঘন্টা পর পর',
  'Every 6h as needed': 'প্রয়োজনে প্রতি ৬ ঘন্টা পর পর',
  'Every 12h': 'প্রতি ১২ ঘন্টা পর পর',
  'Once at night / pre-procedure': 'রাতে ১ বার / প্রসিডিউরের আগে',
  'Once daily': 'দিনে ১ বার',
  'Once daily / single dose': 'দিনে ১ বার / একক ডোজ',
}

// Antibiotic/Antiviral/Antifungal frequencies are shown in hourly-interval style.
const HOURLY_FREQUENCY_BN: Record<string, string> = {
  '1x daily': '২৪ ঘন্টায় ১ বার',
  'Once daily': '২৪ ঘন্টায় ১ বার',
  'Once daily / single dose': '২৪ ঘন্টায় ১ বার / একক ডোজ',
  '1-2x daily': '২৪ বা ১২ ঘন্টা অন্তর (দিনে ১-২ বার)',
  '2x daily': '১২ ঘন্টা অন্তর, দিনে ২ বার',
  '2-3x daily': '১২ বা ৮ ঘন্টা অন্তর (দিনে ২-৩ বার)',
  '3x daily': '৮ ঘন্টা অন্তর, দিনে ৩ বার',
  '4x daily': '৬ ঘন্টা অন্তর, দিনে ৪ বার',
  '4x daily (after meals + bedtime)': '৬ ঘন্টা অন্তর, দিনে ৪ বার (খাবারের পরে ও শোবার আগে)',
  'Every 12h': '১২ ঘন্টা অন্তর, দিনে ২ বার',
  '2x daily (rinse 30 sec)': '১২ ঘন্টা অন্তর, দিনে ২ বার (৩০ সেকেন্ড কুলকুচি)',
}

const DURATION_BN: Record<string, string> = {
  '1-3 days': '১-৩ দিন',
  '3 days': '৩ দিন',
  '3-5 days': '৩-৫ দিন',
  '3-5 days (hospital/specialist setting)': '৩-৫ দিন (হাসপাতাল/বিশেষজ্ঞ তত্ত্বাবধানে)',
  '5 days': '৫ দিন',
  '5-7 days': '৫-৭ দিন',
  '5-7 days (hospital/specialist setting)': '৫-৭ দিন (হাসপাতাল/বিশেষজ্ঞ তত্ত্বাবধানে)',
  '7 days': '৭ দিন',
  '7-14 days': '৭-১৪ দিন',
  '7-14 days (continue 7 days after lesions resolve)': '৭-১৪ দিন (ঘা সেরে যাওয়ার পরেও ৭ দিন চালিয়ে যান)',
  '7-14 days (or single dose)': '৭-১৪ দিন (অথবা একক ডোজ)',
  '1-2 weeks': '১-২ সপ্তাহ',
  '2-4 weeks': '২-৪ সপ্তাহ',
  '14 days': '১৪ দিন',
  'Max 5 days': 'সর্বোচ্চ ৫ দিন',
  'Max 8 days (acute pain)': 'সর্বোচ্চ ৮ দিন (তীব্র ব্যথায়)',
  'Single use': 'একবার ব্যবহার্য',
  'Until healed (max 14 days)': 'সেরে না ওঠা পর্যন্ত (সর্বোচ্চ ১৪ দিন)',
}

const INSTRUCTIONS_BN: Record<string, string> = {
  '1 hour before or 2 hours after meals': 'খাবারের ১ ঘন্টা আগে অথবা ২ ঘন্টা পরে',
  '30-60 min before food (empty stomach); penicillinase-resistant penicillin':
    'খাবারের ৩০-৬০ মিনিট আগে (খালি পেটে); পেনিসিলিনেজ-প্রতিরোধী পেনিসিলিন',
  'Administered by dental professional only': 'শুধুমাত্র ডেন্টাল চিকিৎসক প্রয়োগ করবেন',
  'After food; hold gel in mouth near lesions before swallowing; remove dentures at night and brush with gel':
    'খাবারের পরে; গিলে ফেলার আগে জেল ঘায়ের কাছে মুখে ধরে রাখুন; রাতে বাঁধানো দাঁত খুলে জেল দিয়ে ব্রাশ করুন',
  'After meals': 'খাবারের পরে',
  'After meals with full glass of water': 'খাবারের পরে এক গ্লাস পানিসহ',
  'After meals, avoid alcohol': 'খাবারের পরে; অ্যালকোহল পরিহার করুন',
  'After meals; NSAID with better GI tolerability than diclofenac':
    'খাবারের পরে; ডাইক্লোফেনাকের চেয়ে পাকস্থলীর জন্য অধিক সহনীয় NSAID',
  'After meals; dual-mechanism analgesia for moderate-severe dental pain':
    'খাবারের পরে; মাঝারি-তীব্র দাঁত ব্যথায় দ্বৈত-কার্যপদ্ধতির ব্যথানাশক',
  'After meals; higher-strength alternative for severe odontogenic infections':
    'খাবারের পরে; তীব্র দাঁতের সংক্রমণে উচ্চ-মাত্রার বিকল্প',
  'After meals; resistant odontogenic infections': 'খাবারের পরে; প্রতিরোধী দাঁতের সংক্রমণে',
  'After meals; take with a full glass of water; longer half-life allows twice-daily dosing':
    'খাবারের পরে; এক গ্লাস পানিসহ খাবেন; দীর্ঘ কার্যকারিতার জন্য দিনে ২ বারই যথেষ্ট',
  'Apply thin layer to lesion after meals and at bedtime; do not rub in':
    'খাবারের পরে ও শোবার আগে ঘায়ে পাতলা প্রলেপ দিন; ঘষবেন না',
  'At least 1 hour before food; gastric protection during NSAID/steroid course':
    'খাবারের কমপক্ষে ১ ঘন্টা আগে; NSAID/স্টেরয়েড কোর্সে পাকস্থলীর সুরক্ষায়',
  'Before breakfast (30-60 min before food); gastric protection during NSAID/steroid course':
    'সকালের নাস্তার আগে (খাবারের ৩০-৬০ মিনিট আগে); NSAID/স্টেরয়েড কোর্সে পাকস্থলীর সুরক্ষায়',
  'Before breakfast, swallow whole; do not crush/chew': 'সকালের নাস্তার আগে, আস্ত গিলে ফেলুন; ভাঙবেন/চিবাবেন না',
  'Before breakfast, swallow whole; gastric protection during NSAID course':
    'সকালের নাস্তার আগে, আস্ত গিলে ফেলুন; NSAID কোর্সে পাকস্থলীর সুরক্ষায়',
  'Before breakfast; gastric protection during NSAID course': 'সকালের নাস্তার আগে; NSAID কোর্সে পাকস্থলীর সুরক্ষায়',
  'Can be taken with or without food': 'খাবারের সাথে বা খালি পেটে খাওয়া যায়',
  'Dilute as directed; do not swallow; avoid in thyroid disorders':
    'নির্দেশ অনুযায়ী পাতলা করে নিন; গিলে ফেলবেন না; থাইরয়েড সমস্যায় পরিহার করুন',
  'Hold in mouth for as long as possible before swallowing; continue 48hrs after symptoms clear':
    'গিলে ফেলার আগে যতক্ষণ সম্ভব মুখে রাখুন; উপসর্গ চলে যাওয়ার পরেও ৪৮ ঘন্টা চালিয়ে যান',
  'IV, administered by clinical professional': 'শিরায়, চিকিৎসা পেশাজীবী প্রয়োগ করবেন',
  'IV/IM, administered by clinical professional': 'শিরায়/মাংসপেশিতে, চিকিৎসা পেশাজীবী প্রয়োগ করবেন',
  'Immediately after a full meal (acidic environment aids absorption)':
    'ভরপেট খাবারের পরপরই (অম্লীয় পরিবেশ শোষণে সাহায্য করে)',
  'Max 8 tablets/day; short course only; may cause drowsiness — caution driving':
    'দিনে সর্বোচ্চ ৮টি ট্যাবলেট; শুধুমাত্র স্বল্পমেয়াদি; ঝিমুনি হতে পারে — গাড়ি চালানোয় সতর্ক থাকুন',
  'On an empty stomach, 1h before or 2h after meals': 'খালি পেটে, খাবারের ১ ঘন্টা আগে বা ২ ঘন্টা পরে',
  'Rinse for 30 seconds; do not swallow; use after brushing':
    '৩০ সেকেন্ড কুলকুচি করুন; গিলে ফেলবেন না; ব্রাশ করার পরে ব্যবহার করুন',
  'Short-term use only; take with food': 'শুধুমাত্র স্বল্পমেয়াদি ব্যবহার; খাবারের সাথে খাবেন',
  'Start within 72h of lesion onset; with or without food':
    'ঘা দেখা দেওয়ার ৭২ ঘন্টার মধ্যে শুরু করুন; খাবারের সাথে বা খালি পেটে',
  'Take 1 hour before procedure; avoid driving': 'প্রসিডিউরের ১ ঘন্টা আগে খাবেন; গাড়ি চালানো থেকে বিরত থাকুন',
  'Take with a full glass of water; penicillin-allergy alternative':
    'এক গ্লাস পানিসহ খাবেন; পেনিসিলিন-অ্যালার্জিতে বিকল্প',
  'Take with food; avoid lying down for 30 min; avoid sun exposure':
    'খাবারের সাথে খাবেন; ৩০ মিনিট শোবেন না; রোদ এড়িয়ে চলুন',
  'Take with food; monitor for hepatotoxicity': 'খাবারের সাথে খাবেন; লিভারের সমস্যার দিকে খেয়াল রাখুন',
  'Take ≥30 min before meals; swallow whole — do not split, crush or chew; built-in GI protection':
    'খাবারের কমপক্ষে ৩০ মিনিট আগে; আস্ত গিলে ফেলুন — ভাঙবেন, গুঁড়া করবেন বা চিবাবেন না; পাকস্থলী-সুরক্ষাসহ',
  'Used to control post-extraction bleeding; with or without food':
    'দাঁত তোলার পরে রক্তপাত নিয়ন্ত্রণে ব্যবহৃত; খাবারের সাথে বা খালি পেটে',
  'With food (improves absorption); 3rd generation oral cephalosporin':
    'খাবারের সাথে (শোষণ বাড়ায়); ৩য় প্রজন্মের মুখে সেব্য সেফালোস্পোরিন',
  'With food to reduce nausea; start within 48h of influenza symptom onset':
    'বমিভাব কমাতে খাবারের সাথে; ফ্লুর উপসর্গ শুরুর ৪৮ ঘন্টার মধ্যে শুরু করুন',
  'With food; antiprotozoal/antiparasitic': 'খাবারের সাথে; অ্যান্টিপ্রোটোজোয়াল/পরজীবীনাশক',
  'With or without food': 'খাবারের সাথে বা খালি পেটে',
  'With or without food (dual delayed release); swallow whole or sprinkle on soft food':
    'খাবারের সাথে বা খালি পেটে; আস্ত গিলে ফেলুন বা নরম খাবারে ছিটিয়ে নিন',
  'With or without food; 1st generation cephalosporin': 'খাবারের সাথে বা খালি পেটে; ১ম প্রজন্মের সেফালোস্পোরিন',
  'With or without food; 2nd generation cephalosporin': 'খাবারের সাথে বা খালি পেটে; ২য় প্রজন্মের সেফালোস্পোরিন',
  'With or without food; duration depends on infection site':
    'খাবারের সাথে বা খালি পেটে; সংক্রমণের স্থানভেদে মেয়াদ নির্ভর করে',
  'With or without food; short course for acute dental pain':
    'খাবারের সাথে বা খালি পেটে; তীব্র দাঁত ব্যথায় স্বল্পমেয়াদি কোর্স',
}

// Age-tier dosing strings auto-filled from dentalDrugDatabase.ts ageDosing (infant/child/adult).
const DOSAGE_BN: Record<string, string> = {
  '20-40mg/kg/day divided 3x (suspension)': '২০-৪০ মি.গ্রা./কেজি/দিন, ৩ ভাগে বিভক্ত (সাসপেনশন)',
  '25mg/kg/day divided 3x (max 500mg/dose)': '২৫ মি.গ্রা./কেজি/দিন, ৩ ভাগে বিভক্ত (সর্বোচ্চ ৫০০ মি.গ্রা./ডোজ)',
  '500mg 3x daily': '৫০০ মি.গ্রা. দিনে ৩ বার',
  '20-40mg/kg/day (amoxicillin component) divided 2-3x': '২০-৪০ মি.গ্রা./কেজি/দিন (অ্যামোক্সিসিলিন অংশ), ২-৩ ভাগে বিভক্ত',
  '25-45mg/kg/day divided 2x': '২৫-৪৫ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত',
  '625mg 2x daily': '৬২৫ মি.গ্রা. দিনে ২ বার',
  'Not used; lower-strength suspension preferred': 'ব্যবহৃত হয় না; কম মাত্রার সাসপেনশন উত্তম',
  'Not routinely used <12 years; use 625mg/suspension instead': '১২ বছরের নিচে নিয়মিত ব্যবহৃত হয় না; পরিবর্তে ৬২৫ মি.গ্রা./সাসপেনশন ব্যবহার করুন',
  '875mg/125mg ("1g") twice daily': '৮৭৫ মি.গ্রা./১২৫ মি.গ্রা. ("১ গ্রাম") দিনে ২ বার',
  '7.5mg/kg every 8h (avoid <2 months unless essential)': '৭.৫ মি.গ্রা./কেজি প্রতি ৮ ঘন্টা অন্তর (২ মাসের কম বয়সে জরুরি না হলে এড়িয়ে চলুন)',
  '7.5mg/kg 3x daily': '৭.৫ মি.গ্রা./কেজি দিনে ৩ বার',
  '400mg 3x daily': '৪০০ মি.গ্রা. দিনে ৩ বার',
  'Not routinely recommended <6 months': '৬ মাসের নিচে নিয়মিত সুপারিশ করা হয় না',
  '10mg/kg once daily': '১০ মি.গ্রা./কেজি দিনে ১ বার',
  '500mg once daily': '৫০০ মি.গ্রা. দিনে ১ বার',
  '5-10mg/kg every 6-8h (>6 months)': '৫-১০ মি.গ্রা./কেজি প্রতি ৬-৮ ঘন্টা অন্তর (৬ মাসের বেশি বয়সে)',
  '5-10mg/kg every 6-8h (max 40mg/kg/day)': '৫-১০ মি.গ্রা./কেজি প্রতি ৬-৮ ঘন্টা অন্তর (সর্বোচ্চ ৪০ মি.গ্রা./কেজি/দিন)',
  'Not recommended': 'সুপারিশ করা হয় না',
  '1-3mg/kg/day divided (>1 year, caution)': '১-৩ মি.গ্রা./কেজি/দিন, ভাগে বিভক্ত (১ বছরের বেশি বয়সে, সতর্কতার সাথে)',
  '50mg 2-3x daily': '৫০ মি.গ্রা. দিনে ২-৩ বার',
  '10-15mg/kg every 4-6h': '১০-১৫ মি.গ্রা./কেজি প্রতি ৪-৬ ঘন্টা অন্তর',
  '10-15mg/kg every 4-6h (max 4 doses/day)': '১০-১৫ মি.গ্রা./কেজি প্রতি ৪-৬ ঘন্টা অন্তর (দিনে সর্বোচ্চ ৪ ডোজ)',
  '500-1000mg every 4-6h (max 4g/day)': '৫০০-১০০০ মি.গ্রা. প্রতি ৪-৬ ঘন্টা অন্তর (সর্বোচ্চ ৪ গ্রাম/দিন)',
  'Max 3-4.5mg/kg (weight-based volume, dental professional only)': 'সর্বোচ্চ ৩-৪.৫ মি.গ্রা./কেজি (ওজন অনুযায়ী পরিমাণ, শুধুমাত্র ডেন্টাল চিকিৎসক প্রয়োগ করবেন)',
  'Max 4.4mg/kg': 'সর্বোচ্চ ৪.৪ মি.গ্রা./কেজি',
  'Max 4.4mg/kg (typically 300-500mg per session)': 'সর্বোচ্চ ৪.৪ মি.গ্রা./কেজি (সাধারণত প্রতি সেশনে ৩০০-৫০০ মি.গ্রা.)',
  'Not routine for dental use': 'দাঁতের চিকিৎসায় নিয়মিত ব্যবহৃত হয় না',
  '0.1-0.2mg/kg single dose (caution)': '০.১-০.২ মি.গ্রা./কেজি একক ডোজ (সতর্কতার সাথে)',
  '0.5-1mg once or twice daily, short course': '০.৫-১ মি.গ্রা. দিনে ১ বা ২ বার, স্বল্পমেয়াদি কোর্স',
  'Not routinely used (specialist sedation only)': 'নিয়মিত ব্যবহৃত হয় না (শুধুমাত্র বিশেষজ্ঞের তত্ত্বাবধানে সিডেশন)',
  '5-10mg once before procedure': '৫-১০ মি.গ্রা. প্রসিডিউরের আগে একবার',
  'Not recommended (swallowing risk)': 'সুপারিশ করা হয় না (গিলে ফেলার ঝুঁকি)',
  'Supervised use only, >6 years': 'শুধুমাত্র তত্ত্বাবধানে ব্যবহার্য, ৬ বছরের বেশি বয়সে',
  '10-15ml rinse 2x daily': '১০-১৫ মি.লি. কুলকুচি দিনে ২ বার',
  '1ml (100,000 IU) 4x daily applied to mouth': '১ মি.লি. (১,০০,০০০ আই.ইউ.) দিনে ৪ বার মুখে প্রয়োগ করুন',
  '1-2ml 4x daily': '১-২ মি.লি. দিনে ৪ বার',
  '4-6ml 4x daily, swish and swallow/spit': '৪-৬ মি.লি. দিনে ৪ বার, মুখে ঘুরিয়ে গিলে ফেলুন/ফেলে দিন',
  'Not first-line; 10-25mg/kg/day divided if needed': 'প্রথম পছন্দ নয়; প্রয়োজনে ১০-২৫ মি.গ্রা./কেজি/দিন ভাগে বিভক্ত করে',
  '10-25mg/kg/day divided 3x': '১০-২৫ মি.গ্রা./কেজি/দিন, ৩ ভাগে বিভক্ত',
  '300mg 3x daily': '৩০০ মি.গ্রা. দিনে ৩ বার',
  '8mg/kg/day divided (suspension)': '৮ মি.গ্রা./কেজি/দিন, ভাগে বিভক্ত (সাসপেনশন)',
  '8mg/kg/day once or divided 2x': '৮ মি.গ্রা./কেজি/দিন, একবারে বা ২ ভাগে বিভক্ত',
  '200mg 2x daily': '২০০ মি.গ্রা. দিনে ২ বার',
  'Contraindicated <8 years': '৮ বছরের নিচে নিষিদ্ধ',
  '100mg 1-2x daily': '১০০ মি.গ্রা. দিনে ১-২ বার',
  'Not recommended <6 months': '৬ মাসের নিচে সুপারিশ করা হয় না',
  '6.5mg/kg every 8h (>6 months)': '৬.৫ মি.গ্রা./কেজি প্রতি ৮ ঘন্টা অন্তর (৬ মাসের বেশি বয়সে)',
  '10mg/kg every 8h (specialist use)': '১০ মি.গ্রা./কেজি প্রতি ৮ ঘন্টা অন্তর (শুধুমাত্র বিশেষজ্ঞের তত্ত্বাবধানে)',
  '10mg/kg every 8h': '১০ মি.গ্রা./কেজি প্রতি ৮ ঘন্টা অন্তর',
  '500mg 3x daily, or rinse with 4.8% mouthwash': '৫০০ মি.গ্রা. দিনে ৩ বার, অথবা ৪.৮% মাউথওয়াশ দিয়ে কুলকুচি',
  'Avoid (thyroid/aspiration risk)': 'এড়িয়ে চলুন (থাইরয়েড/শ্বাসনালীতে চলে যাওয়ার ঝুঁকি)',
  'Supervised use only, >6 years, diluted': 'শুধুমাত্র তত্ত্বাবধানে ব্যবহার্য, ৬ বছরের বেশি বয়সে, পাতলা করে',
  'Gargle/rinse diluted 2-3x daily': 'পাতলা করে দিনে ২-৩ বার গার্গল/কুলকুচি করুন',
  'Thin layer 2x daily (>2 years, short course)': 'পাতলা প্রলেপ দিনে ২ বার (২ বছরের বেশি বয়সে, স্বল্পমেয়াদি কোর্স)',
  'Thin layer 2-3x daily': 'পাতলা প্রলেপ দিনে ২-৩ বার',
  '25-50mg/kg/day divided 4x': '২৫-৫০ মি.গ্রা./কেজি/দিন, ৪ ভাগে বিভক্ত',
  '25-50mg/kg/day divided 4x (max 500mg/dose)': '২৫-৫০ মি.গ্রা./কেজি/দিন, ৪ ভাগে বিভক্ত (সর্বোচ্চ ৫০০ মি.গ্রা./ডোজ)',
  '500mg 4x daily (or 250-500mg every 6h)': '৫০০ মি.গ্রা. দিনে ৪ বার (অথবা ২৫০-৫০০ মি.গ্রা. প্রতি ৬ ঘন্টা অন্তর)',
  '125mg twice daily (suspension, age-based)': '১২৫ মি.গ্রা. দিনে ২ বার (সাসপেনশন, বয়স অনুযায়ী)',
  '10-15mg/kg twice daily (max 250mg/dose)': '১০-১৫ মি.গ্রা./কেজি দিনে ২ বার (সর্বোচ্চ ২৫০ মি.গ্রা./ডোজ)',
  '250-500mg twice daily': '২৫০-৫০০ মি.গ্রা. দিনে ২ বার',
  '20-50mg/kg once daily IV/IM': '২০-৫০ মি.গ্রা./কেজি দিনে ১ বার শিরায়/মাংসপেশিতে',
  '50-75mg/kg once daily': '৫০-৭৫ মি.গ্রা./কেজি দিনে ১ বার',
  '1-2g once daily IV/IM': '১-২ গ্রাম দিনে ১ বার শিরায়/মাংসপেশিতে',
  '50mg/kg every 12h (specialist/hospital use)': '৫০ মি.গ্রা./কেজি প্রতি ১২ ঘন্টা অন্তর (হাসপাতাল/বিশেষজ্ঞ ব্যবহারে)',
  '50mg/kg every 12h': '৫০ মি.গ্রা./কেজি প্রতি ১২ ঘন্টা অন্তর',
  '1-2g every 12h IV': '১-২ গ্রাম প্রতি ১২ ঘন্টা অন্তর শিরায়',
  'Not routinely used; specialist-guided suspension only': 'নিয়মিত ব্যবহৃত হয় না; শুধুমাত্র বিশেষজ্ঞের পরামর্শে সাসপেনশন',
  '10-15mg/kg (cefuroxime component) twice daily': '১০-১৫ মি.গ্রা./কেজি (সেফুরোক্সিম অংশ) দিনে ২ বার',
  '250mg/125mg twice daily': '২৫০ মি.গ্রা./১২৫ মি.গ্রা. দিনে ২ বার',
  '10mg/kg every 8h (severe HSV, specialist use)': '১০ মি.গ্রা./কেজি প্রতি ৮ ঘন্টা অন্তর (তীব্র HSV, শুধুমাত্র বিশেষজ্ঞের তত্ত্বাবধানে)',
  '20mg/kg every 6h (max 800mg/dose)': '২০ মি.গ্রা./কেজি প্রতি ৬ ঘন্টা অন্তর (সর্বোচ্চ ৮০০ মি.গ্রা./ডোজ)',
  '400mg 3x daily or 200mg 5x daily': '৪০০ মি.গ্রা. দিনে ৩ বার অথবা ২০০ মি.গ্রা. দিনে ৫ বার',
  'Not established; specialist use only': 'নির্ধারিত নয়; শুধুমাত্র বিশেষজ্ঞের তত্ত্বাবধানে',
  '20mg/kg twice daily (>2 years, specialist guidance)': '২০ মি.গ্রা./কেজি দিনে ২ বার (২ বছরের বেশি বয়সে, বিশেষজ্ঞের পরামর্শে)',
  '500mg-1g twice daily': '৫০০ মি.গ্রা.-১ গ্রাম দিনে ২ বার',
  '3-6mg/kg once daily': '৩-৬ মি.গ্রা./কেজি দিনে ১ বার',
  '3-6mg/kg once daily (max 150mg)': '৩-৬ মি.গ্রা./কেজি দিনে ১ বার (সর্বোচ্চ ১৫০ মি.গ্রা.)',
  '150mg single dose, or 50-100mg daily for 7-14 days': '১৫০ মি.গ্রা. একক ডোজ, অথবা ৫০-১০০ মি.গ্রা. প্রতিদিন ৭-১৪ দিন',
  'Not first-line (hepatotoxicity risk); specialist use only': 'প্রথম পছন্দ নয় (লিভারের ক্ষতির ঝুঁকি); শুধুমাত্র বিশেষজ্ঞের তত্ত্বাবধানে',
  '200mg once daily with food, 1-2 weeks': '২০০ মি.গ্রা. দিনে ১ বার খাবারের সাথে, ১-২ সপ্তাহ',
  '15mg/kg every 6h (suspension)': '১৫ মি.গ্রা./কেজি প্রতি ৬ ঘন্টা অন্তর (সাসপেনশন)',
  '125-250mg every 6h': '১২৫-২৫০ মি.গ্রা. প্রতি ৬ ঘন্টা অন্তর',
  '250-500mg every 6h': '২৫০-৫০০ মি.গ্রা. প্রতি ৬ ঘন্টা অন্তর',
  '500mg 4x daily': '৫০০ মি.গ্রা. দিনে ৪ বার',
  'Not recommended <16 years (limited data)': '১৬ বছরের নিচে সুপারিশ করা হয় না (সীমিত তথ্য)',
  '10mg every 4-6h (max 40mg/day, max 5 days)': '১০ মি.গ্রা. প্রতি ৪-৬ ঘন্টা অন্তর (সর্বোচ্চ ৪০ মি.গ্রা./দিন, সর্বোচ্চ ৫ দিন)',
  'Not recommended <16 years': '১৬ বছরের নিচে সুপারিশ করা হয় না',
  '90mg once daily (short course, max 8 days for acute pain)': '৯০ মি.গ্রা. দিনে ১ বার (স্বল্পমেয়াদি কোর্স, তীব্র ব্যথায় সর্বোচ্চ ৮ দিন)',
  'Not recommended as fixed combo; use single agents': 'নির্দিষ্ট কম্বিনেশন হিসেবে সুপারিশ করা হয় না; এককভাবে ওষুধ ব্যবহার করুন',
  'Not recommended <12 years as fixed combo': '১২ বছরের নিচে নির্দিষ্ট কম্বিনেশন হিসেবে সুপারিশ করা হয় না',
  '1 tablet every 6-8h (max 3 tablets/day)': '১টি ট্যাবলেট প্রতি ৬-৮ ঘন্টা অন্তর (দিনে সর্বোচ্চ ৩টি ট্যাবলেট)',
  '(>1 month, specialist use) 0.7mg/kg once daily': '(১ মাসের বেশি বয়সে, বিশেষজ্ঞের তত্ত্বাবধানে) ০.৭ মি.গ্রা./কেজি দিনে ১ বার',
  '1-12 years: 10-20mg once daily (0.7-1.4mg/kg)': '১-১২ বছর: ১০-২০ মি.গ্রা. দিনে ১ বার (০.৭-১.৪ মি.গ্রা./কেজি)',
  '20mg once daily (40mg for severe reflux/ulcer)': '২০ মি.গ্রা. দিনে ১ বার (তীব্র রিফ্লাক্স/আলসারে ৪০ মি.গ্রা.)',
  '(1 month-1 year, GERD, specialist use) 2.5-5mg once daily by weight': '(১ মাস-১ বছর বয়সে, GERD, বিশেষজ্ঞের তত্ত্বাবধানে) ওজন অনুযায়ী ২.৫-৫ মি.গ্রা. দিনে ১ বার',
  '1-11 years: 10mg once daily; 12-17 years: 20-40mg once daily': '১-১১ বছর: ১০ মি.গ্রা. দিনে ১ বার; ১২-১৭ বছর: ২০-৪০ মি.গ্রা. দিনে ১ বার',
  '20-40mg once daily': '২০-৪০ মি.গ্রা. দিনে ১ বার',
  '≥5 years: 15-40kg 20mg once daily; >40kg 40mg once daily': '৫ বছর বা বেশি: ১৫-৪০ কেজি ওজনে ২০ মি.গ্রা. দিনে ১ বার; ৪০ কেজির বেশি ৪০ মি.গ্রা. দিনে ১ বার',
  '40mg once daily (20mg for maintenance/GI protection)': '৪০ মি.গ্রা. দিনে ১ বার (রক্ষণাবেক্ষণ/পাকস্থলী সুরক্ষায় ২০ মি.গ্রা.)',
  'Not routinely recommended <12 years; ≥12 years: 20mg once daily': '১২ বছরের নিচে নিয়মিত সুপারিশ করা হয় না; ১২ বছর বা বেশি: ২০ মি.গ্রা. দিনে ১ বার',
  '20mg once daily': '২০ মি.গ্রা. দিনে ১ বার',
  'Not routinely recommended': 'নিয়মিত সুপারিশ করা হয় না',
  '1-11 years: ≤30kg 15mg once daily; >30kg 30mg once daily': '১-১১ বছর: ৩০ কেজি বা কম ওজনে ১৫ মি.গ্রা. দিনে ১ বার; ৩০ কেজির বেশি ৩০ মি.গ্রা. দিনে ১ বার',
  '30mg once daily (15mg maintenance)': '৩০ মি.গ্রা. দিনে ১ বার (রক্ষণাবেক্ষণে ১৫ মি.গ্রা.)',
  'Not recommended <12 years; ≥12 years: 30mg once daily': '১২ বছরের নিচে সুপারিশ করা হয় না; ১২ বছর বা বেশি: ৩০ মি.গ্রা. দিনে ১ বার',
  '30mg once daily (60mg for erosive esophagitis healing)': '৩০ মি.গ্রা. দিনে ১ বার (ক্ষয়কারী ইসোফ্যাগাইটিস নিরাময়ে ৬০ মি.গ্রা.)',
  '30mg/kg/day divided 2x (suspension)': '৩০ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত (সাসপেনশন)',
  '30mg/kg/day divided 2x (max 1g/day)': '৩০ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত (সর্বোচ্চ ১ গ্রাম/দিন)',
  '500mg-1g 2x daily': '৫০০ মি.গ্রা.-১ গ্রাম দিনে ২ বার',
  '(>1 month) 20mg/kg/day divided 3x (suspension)': '(১ মাসের বেশি বয়সে) ২০ মি.গ্রা./কেজি/দিন, ৩ ভাগে বিভক্ত (সাসপেনশন)',
  '20-40mg/kg/day divided 3x (max 1g/day)': '২০-৪০ মি.গ্রা./কেজি/দিন, ৩ ভাগে বিভক্ত (সর্বোচ্চ ১ গ্রাম/দিন)',
  '250-500mg 3x daily': '২৫০-৫০০ মি.গ্রা. দিনে ৩ বার',
  '(≥2 months) 8mg/kg/day divided 2x (suspension)': '(২ মাস বা বেশি বয়সে) ৮ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত (সাসপেনশন)',
  '2 months-12 years: 8mg/kg/day divided 2x (max 400mg/day)': '২ মাস-১২ বছর: ৮ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত (সর্বোচ্চ ৪০০ মি.গ্রা./দিন)',
  '200mg 2x daily (100-400mg per dose by severity)': '২০০ মি.গ্রা. দিনে ২ বার (তীব্রতা অনুযায়ী প্রতি ডোজে ১০০-৪০০ মি.গ্রা.)',
  '62.5mg 4x daily (suspension)': '৬২.৫ মি.গ্রা. দিনে ৪ বার (সাসপেনশন)',
  '2-10 years: 125-250mg 4x daily; <2 years: 62.5-125mg 4x daily': '২-১০ বছর: ১২৫-২৫০ মি.গ্রা. দিনে ৪ বার; ২ বছরের নিচে: ৬২.৫-১২৫ মি.গ্রা. দিনে ৪ বার',
  '250-500mg 4x daily': '২৫০-৫০০ মি.গ্রা. দিনে ৪ বার',
  'Not recommended <1 year': '১ বছরের নিচে সুপারিশ করা হয় না',
  '1-3 years: 100mg 2x daily; 4-11 years: 200mg 2x daily (suspension)': '১-৩ বছর: ১০০ মি.গ্রা. দিনে ২ বার; ৪-১১ বছর: ২০০ মি.গ্রা. দিনে ২ বার (সাসপেনশন)',
  '500mg 2x daily for 3 days': '৫০০ মি.গ্রা. দিনে ২ বার, ৩ দিন',
  '3-5mg/kg once daily (specialist advice)': '৩-৫ মি.গ্রা./কেজি দিনে ১ বার (বিশেষজ্ঞের পরামর্শে)',
  '100mg once daily 14-15 days (oral candidiasis); 200mg daily for refractory cases':
    '১০০ মি.গ্রা. দিনে ১ বার ১৪-১৫ দিন (মুখের ছত্রাক সংক্রমণে); প্রতিরোধী ক্ষেত্রে ২০০ মি.গ্রা. প্রতিদিন',
  '10-20kg: 62.5mg daily; 20-40kg: 125mg daily; >40kg: 250mg daily': '১০-২০ কেজি: ৬২.৫ মি.গ্রা. প্রতিদিন; ২০-৪০ কেজি: ১২৫ মি.গ্রা. প্রতিদিন; ৪০ কেজির বেশি: ২৫০ মি.গ্রা. প্রতিদিন',
  '250mg once daily': '২৫০ মি.গ্রা. দিনে ১ বার',
  '4-24 months: 1.25ml 4x daily (apply with clean finger)': '৪-২৪ মাস: ১.২৫ মি.লি. দিনে ৪ বার (পরিষ্কার আঙুল দিয়ে প্রয়োগ করুন)',
  '≥2 years: 2.5ml 4x daily': '২ বছর বা বেশি: ২.৫ মি.লি. দিনে ৪ বার',
  '2.5ml 4x daily': '২.৫ মি.লি. দিনে ৪ বার',
  '(≥2 weeks) 3mg/kg 2x daily': '(২ সপ্তাহ বা বেশি বয়সে) ৩ মি.গ্রা./কেজি দিনে ২ বার',
  '≤15kg: 30mg 2x daily; 15-23kg: 45mg; 23-40kg: 60mg 2x daily': '১৫ কেজি বা কম: ৩০ মি.গ্রা. দিনে ২ বার; ১৫-২৩ কেজি: ৪৫ মি.গ্রা.; ২৩-৪০ কেজি: ৬০ মি.গ্রা. দিনে ২ বার',
  '75mg 2x daily for 5 days': '৭৫ মি.গ্রা. দিনে ২ বার, ৫ দিন',
  'Not recommended <18 years': '১৮ বছরের নিচে সুপারিশ করা হয় না',
  '100mg 2x daily (SR 200mg once daily)': '১০০ মি.গ্রা. দিনে ২ বার (SR ২০০ মি.গ্রা. দিনে ১ বার)',
  'Not recommended <12 years': '১২ বছরের নিচে সুপারিশ করা হয় না',
  '1-2 tablets every 6h as needed (max 8/day)': '১-২টি ট্যাবলেট প্রয়োজনে প্রতি ৬ ঘন্টা অন্তর (দিনে সর্বোচ্চ ৮টি)',
  'Not recommended <2 years': '২ বছরের নিচে সুপারিশ করা হয় না',
  '10mg/kg/day in 2 divided doses (>2 years); oral suspension preferred':
    '১০ মি.গ্রা./কেজি/দিন, ২ ভাগে বিভক্ত (২ বছরের বেশি বয়সে); মুখে সেব্য সাসপেনশন উত্তম',
  '500mg twice daily (acute pain: initial 500mg then 250mg every 6-8h; max 1000mg/day)':
    '৫০০ মি.গ্রা. দিনে ২ বার (তীব্র ব্যথায়: প্রথমে ৫০০ মি.গ্রা. তারপর ২৫০ মি.গ্রা. প্রতি ৬-৮ ঘন্টা অন্তর; সর্বোচ্চ ১০০০ মি.গ্রা./দিন)',
  '>38kg adolescents: 375mg/20mg twice daily before meals': '৩৮ কেজির বেশি ওজনের কিশোর-কিশোরীদের জন্য: ৩৭৫ মি.গ্রা./২০ মি.গ্রা. দিনে ২ বার খাবারের আগে',
  'Not recommended <12 years; >38kg adolescents: 375mg/20mg twice daily before meals':
    '১২ বছরের নিচে সুপারিশ করা হয় না; ৩৮ কেজির বেশি ওজনের কিশোর-কিশোরীদের জন্য: ৩৭৫ মি.গ্রা./২০ মি.গ্রা. দিনে ২ বার খাবারের আগে',
  '375mg/20mg or 500mg/20mg twice daily before meals': '৩৭৫ মি.গ্রা./২০ মি.গ্রা. অথবা ৫০০ মি.গ্রা./২০ মি.গ্রা. দিনে ২ বার খাবারের আগে',
}

const HOURLY_CATEGORIES = new Set(['Antibiotic', 'Antiviral', 'Antifungal'])

export const dosageToBengali = (value: string) => DOSAGE_BN[value] ?? value

export const routeToBengali = (value: string) => ROUTE_BN[value] ?? value

export const frequencyToBengali = (value: string, category?: string) =>
  (category && HOURLY_CATEGORIES.has(category) ? HOURLY_FREQUENCY_BN[value] : undefined) ??
  FREQUENCY_BN[value] ??
  value

export const durationToBengali = (value: string) => DURATION_BN[value] ?? value

export const instructionsToBengali = (value: string) => INSTRUCTIONS_BN[value] ?? value
