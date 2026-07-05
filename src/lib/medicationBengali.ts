// Bengali translations for medication defaults auto-filled from dentalDrugDatabase.ts.
// Keys must match the default* strings in that file verbatim; unmapped values fall back to English.

const ROUTE_BN: Record<string, string> = {
  Oral: 'মুখে সেব্য',
  'Oral suspension': 'মুখে সেব্য সাসপেনশন',
  Injection: 'ইনজেকশন',
  'Topical/Oral rinse': 'মুখ ধোয়ার জন্য (কুলকুচি)',
  'Topical (oral mucosa)': 'মুখের ভিতরে লাগানোর জন্য',
  'Topical (oral)': 'মুখে লাগানোর জন্য',
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

const HOURLY_CATEGORIES = new Set(['Antibiotic', 'Antiviral', 'Antifungal'])

export const routeToBengali = (value: string) => ROUTE_BN[value] ?? value

export const frequencyToBengali = (value: string, category?: string) =>
  (category && HOURLY_CATEGORIES.has(category) ? HOURLY_FREQUENCY_BN[value] : undefined) ??
  FREQUENCY_BN[value] ??
  value

export const durationToBengali = (value: string) => DURATION_BN[value] ?? value

export const instructionsToBengali = (value: string) => INSTRUCTIONS_BN[value] ?? value
