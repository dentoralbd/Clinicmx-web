export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          id: string
          first_name: string
          last_name: string
          phone: string
          email: string
          date_of_birth: string
          gender: string
          address: string | null
          medical_history: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          phone: string
          email: string
          date_of_birth: string
          gender: string
          address?: string | null
          medical_history?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          phone?: string
          email?: string
          date_of_birth?: string
          gender?: string
          address?: string | null
          medical_history?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          patient_id: string
          date_time: string
          duration: number
          type: string
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          date_time: string
          duration?: number
          type: string
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          date_time?: string
          duration?: number
          type?: string
          status?: string
          notes?: string | null
          created_at?: string
        }
      }
      treatments: {
        Row: {
          id: string
          patient_id: string
          tooth_number: number | null
          treatment_type: string
          description: string | null
          status: string
          cost: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tooth_number?: number | null
          treatment_type: string
          description?: string | null
          status?: string
          cost?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tooth_number?: number | null
          treatment_type?: string
          description?: string | null
          status?: string
          cost?: number
          notes?: string | null
          created_at?: string
        }
      }
      prescriptions: {
        Row: {
          id: string
          patient_id: string
          medications: Json
          diagnosis: string | null
          notes: string | null
          prescribed_date: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          medications: Json
          diagnosis?: string | null
          notes?: string | null
          prescribed_date: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          medications?: Json
          diagnosis?: string | null
          notes?: string | null
          prescribed_date?: string
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          patient_id: string
          items: Json
          total_amount: number
          paid_amount: number
          status: string
          due_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          items: Json
          total_amount: number
          paid_amount?: number
          status?: string
          due_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          items?: Json
          total_amount?: number
          paid_amount?: number
          status?: string
          due_date?: string | null
          created_at?: string
        }
      }
      dental_records: {
        Row: {
          id: string
          patient_id: string
          tooth_number: number
          condition: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tooth_number: number
          condition: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tooth_number?: number
          condition?: string
          notes?: string | null
          created_at?: string
        }
      }
    }
  }
}
