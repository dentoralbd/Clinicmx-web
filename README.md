# ClinicMx Web - Dental Clinic Management System

🦷 **Modern web-based dental clinic management application**

## ✨ Features

- ✅ **Patient Management** - Add, edit, search patients
- ✅ **Patient Files** - Upload & view profile photos, clinical images, x-rays (Supabase Storage)
- ✅ **Appointments** - Schedule and manage appointments
- ✅ **Treatments** - Track treatment plans and procedures
- ✅ **Prescriptions** - Digital prescriptions with medications
- ✅ **Billing** - Invoices and payment tracking
- ✅ **Dashboard** - Real-time statistics and overview
- ✅ **Mobile Responsive** - Works on all devices

## 🚀 Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Cloudflare Pages

## 🌐 Live Site

https://clinicmx-web.pages.dev/

## 📱 Mobile Friendly

The app is fully responsive and works great on:
- 📱 Mobile phones
- 📱 Tablets
- 💻 Desktop computers

## 🗄️ Patient File Storage Setup

Patient files (profile photos, clinical images, x-rays) are stored in **Supabase Storage**.

You must create the storage bucket manually in the Supabase dashboard:

1. Open your Supabase project → **Storage**
2. Click **New bucket**
3. Name: **`patient-files`**
4. Set **Public** to `true` (so uploaded images can be previewed in-browser)
5. Click **Create bucket**

The file metadata table (`patient_files`) is created by the migration in `supabase/migrations/003_patient_files.sql`.

## 🔐 Database Setup

The database schema is in `supabase/migrations/001_initial_schema.sql`

## 📝 Environment Variables

Required in Cloudflare Pages:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

**Built with ❤️ for dental clinics**
