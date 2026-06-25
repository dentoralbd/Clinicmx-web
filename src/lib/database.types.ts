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
          patient_code: string | null
          first_name: string
          last_name: string
          phone: string | null
          email: string | null
          date_of_birth: string | null
          gender: string | null
          address: string | null
          medical_history: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_code?: string | null
          first_name: string
          last_name: string
          phone?: string | null
          email?: string | null
          date_of_birth?: string | null
          gender?: string | null
          address?: string | null
          medical_history?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_code?: string | null
          first_name?: string
          last_name?: string
          phone?: string | null
          email?: string | null
          date_of_birth?: string | null
          gender?: string | null
          address?: string | null
          medical_history?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          type?: string
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
        Relationships: [
          {
            foreignKeyName: 'appointments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      treatments: {
        Row: {
          id: string
          patient_id: string
          appointment_id: string | null
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
          appointment_id?: string | null
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
          appointment_id?: string | null
          tooth_number?: number | null
          treatment_type?: string
          description?: string | null
          status?: string
          cost?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'treatments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      prescriptions: {
        Row: {
          id: string
          patient_id: string
          appointment_id: string | null
          medications: Json
          investigations: Json
          diagnosis: string | null
          notes: string | null
          prescribed_date: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          appointment_id?: string | null
          medications?: Json
          investigations?: Json
          diagnosis?: string | null
          notes?: string | null
          prescribed_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          appointment_id?: string | null
          medications?: Json
          investigations?: Json
          diagnosis?: string | null
          notes?: string | null
          prescribed_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'prescriptions_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      invoices: {
        Row: {
          id: string
          patient_id: string
          appointment_id: string | null
          items: Json
          total_amount: number
          paid_amount: number
          discount_amount: number
          status: string
          due_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          appointment_id?: string | null
          items?: Json
          total_amount?: number
          paid_amount?: number
          discount_amount?: number
          status?: string
          due_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          appointment_id?: string | null
          items?: Json
          total_amount?: number
          paid_amount?: number
          discount_amount?: number
          status?: string
          due_date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      dental_records: {
        Row: {
          id: string
          patient_id: string
          tooth_number: number
          condition: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tooth_number: number
          condition?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tooth_number?: number
          condition?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dental_records_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      patient_visits: {
        Row: {
          id: string
          patient_id: string
          visit_date: string
          chief_complaint: string | null
          examination_findings: string | null
          diagnosis: string | null
          treatment_plan: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          visit_date?: string
          chief_complaint?: string | null
          examination_findings?: string | null
          diagnosis?: string | null
          treatment_plan?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          visit_date?: string
          chief_complaint?: string | null
          examination_findings?: string | null
          diagnosis?: string | null
          treatment_plan?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_visits_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      medication_templates: {
        Row: {
          id: string
          name: string
          dosage: string | null
          frequency: string | null
          duration: string | null
          instructions: string | null
          usage_count: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          dosage?: string | null
          frequency?: string | null
          duration?: string | null
          instructions?: string | null
          usage_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          dosage?: string | null
          frequency?: string | null
          duration?: string | null
          instructions?: string | null
          usage_count?: number
          created_at?: string
        }
        Relationships: []
      }
      investigation_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          usage_count: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          usage_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          usage_count?: number
          created_at?: string
        }
        Relationships: []
      }
      patient_files: {
        Row: {
          id: string
          patient_id: string
          file_category: string
          file_name: string
          storage_path: string
          file_size: number | null
          mime_type: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          file_category: string
          file_name: string
          storage_path: string
          file_size?: number | null
          mime_type?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          file_category?: string
          file_name?: string
          storage_path?: string
          file_size?: number | null
          mime_type?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_files_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          }
        ]
      }
      inventory_items: {
        Row: {
          id: string
          name: string
          category: string
          description: string | null
          quantity: number
          unit: string
          low_stock_threshold: number
          supplier: string | null
          cost: number | null
          notes: string | null
          expiry_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          description?: string | null
          quantity?: number
          unit?: string
          low_stock_threshold?: number
          supplier?: string | null
          cost?: number | null
          notes?: string | null
          expiry_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          description?: string | null
          quantity?: number
          unit?: string
          low_stock_threshold?: number
          supplier?: string | null
          cost?: number | null
          notes?: string | null
          expiry_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          id: string
          item_id: string
          movement_type: string
          quantity_change: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          movement_type: string
          quantity_change: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          movement_type?: string
          quantity_change?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'inventory_items'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
