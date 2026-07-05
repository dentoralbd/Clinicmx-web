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
          weight: number | null
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
          weight?: number | null
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
          weight?: number | null
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
          prescription_id: string | null
          prescription_entry_id: string | null
          tooth_number: number | null
          treatment_type: string
          description: string | null
          status: string
          cost: number
          notes: string | null
          is_invoiced: boolean
          invoice_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          appointment_id?: string | null
          prescription_id?: string | null
          prescription_entry_id?: string | null
          tooth_number?: number | null
          treatment_type: string
          description?: string | null
          status?: string
          cost?: number
          notes?: string | null
          is_invoiced?: boolean
          invoice_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          appointment_id?: string | null
          prescription_id?: string | null
          prescription_entry_id?: string | null
          tooth_number?: number | null
          treatment_type?: string
          description?: string | null
          status?: string
          cost?: number
          notes?: string | null
          is_invoiced?: boolean
          invoice_id?: string | null
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
          chief_complaint: string | null
          chief_complaint_entries: Json | null
          on_examination: string | null
          on_examination_entries: Json | null
          diagnosis: string | null
          diagnosis_entries: Json | null
          treatment_plan: string | null
          treatment_plan_entries: Json | null
          notes: string | null
          weight_at_prescription: number | null
          prescribed_date: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          appointment_id?: string | null
          medications?: Json
          investigations?: Json
          chief_complaint?: string | null
          chief_complaint_entries?: Json | null
          on_examination?: string | null
          on_examination_entries?: Json | null
          diagnosis?: string | null
          diagnosis_entries?: Json | null
          treatment_plan?: string | null
          treatment_plan_entries?: Json | null
          notes?: string | null
          weight_at_prescription?: number | null
          prescribed_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          appointment_id?: string | null
          medications?: Json
          investigations?: Json
          chief_complaint?: string | null
          chief_complaint_entries?: Json | null
          on_examination?: string | null
          on_examination_entries?: Json | null
          diagnosis?: string | null
          diagnosis_entries?: Json | null
          treatment_plan?: string | null
          treatment_plan_entries?: Json | null
          notes?: string | null
          weight_at_prescription?: number | null
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
          discount_type: string
          discount_value: number
          tax_amount: number
          tax_rate: number
          notes: string | null
          payment_terms: string | null
          invoice_number: string | null
          invoice_type: string
          recurring_enabled: boolean
          recurring_frequency: string | null
          template_id: string | null
          credit_amount: number
          late_fee_amount: number
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
          discount_type?: string
          discount_value?: number
          tax_amount?: number
          tax_rate?: number
          notes?: string | null
          payment_terms?: string | null
          invoice_number?: string | null
          invoice_type?: string
          recurring_enabled?: boolean
          recurring_frequency?: string | null
          template_id?: string | null
          credit_amount?: number
          late_fee_amount?: number
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
          discount_type?: string
          discount_value?: number
          tax_amount?: number
          tax_rate?: number
          notes?: string | null
          payment_terms?: string | null
          invoice_number?: string | null
          invoice_type?: string
          recurring_enabled?: boolean
          recurring_frequency?: string | null
          template_id?: string | null
          credit_amount?: number
          late_fee_amount?: number
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
          },
          {
            foreignKeyName: 'invoices_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'invoice_templates'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          invoice_type: string
          items: Json
          discount_amount: number
          tax_rate: number
          payment_terms: string | null
          is_system: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          invoice_type?: string
          items?: Json
          discount_amount?: number
          tax_rate?: number
          payment_terms?: string | null
          is_system?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          invoice_type?: string
          items?: Json
          discount_amount?: number
          tax_rate?: number
          payment_terms?: string | null
          is_system?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          id: string
          code: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          payment_method_id: string | null
          payment_method: string
          amount: number
          payment_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          payment_method_id?: string | null
          payment_method?: string
          amount: number
          payment_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          payment_method_id?: string | null
          payment_method?: string
          amount?: number
          payment_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_payment_method_id_fkey'
            columns: ['payment_method_id']
            isOneToOne: false
            referencedRelation: 'payment_methods'
            referencedColumns: ['id']
          }
        ]
      }
      payment_plans: {
        Row: {
          id: string
          invoice_id: string
          installment_no: number
          due_date: string
          amount: number
          status: string
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          installment_no: number
          due_date: string
          amount: number
          status?: string
          paid_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          installment_no?: number
          due_date?: string
          amount?: number
          status?: string
          paid_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payment_plans_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_history: {
        Row: {
          id: string
          invoice_id: string
          event_type: string
          event_data: Json
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          event_type: string
          event_data?: Json
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          event_type?: string
          event_data?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_history_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_settings: {
        Row: {
          id: number
          invoice_prefix: string
          next_invoice_number: number
          default_tax_rate: number
          late_interest_rate: number
          payment_terms: string | null
          updated_at: string
        }
        Insert: {
          id: number
          invoice_prefix?: string
          next_invoice_number?: number
          default_tax_rate?: number
          late_interest_rate?: number
          payment_terms?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          invoice_prefix?: string
          next_invoice_number?: number
          default_tax_rate?: number
          late_interest_rate?: number
          payment_terms?: string | null
          updated_at?: string
        }
        Relationships: []
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
      delete_history: {
        Row: {
          id: string
          deleted_at: string
          entity_type: string
          entity_id: string
          entity_label: string | null
          patient_id: string | null
          patient_name: string | null
          payload: Json
          deleted_by: string
          restored_at: string | null
        }
        Insert: {
          id?: string
          deleted_at?: string
          entity_type: string
          entity_id: string
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payload: Json
          deleted_by?: string
          restored_at?: string | null
        }
        Update: {
          id?: string
          deleted_at?: string
          entity_type?: string
          entity_id?: string
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payload?: Json
          deleted_by?: string
          restored_at?: string | null
        }
        Relationships: []
      }
      edit_history: {
        Row: {
          id: string
          edited_at: string
          entity_type: string
          entity_id: string
          entity_label: string | null
          patient_id: string | null
          patient_name: string | null
          previous_payload: Json
          edited_by: string
          reverted_at: string | null
        }
        Insert: {
          id?: string
          edited_at?: string
          entity_type: string
          entity_id: string
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          previous_payload: Json
          edited_by?: string
          reverted_at?: string | null
        }
        Update: {
          id?: string
          edited_at?: string
          entity_type?: string
          entity_id?: string
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          previous_payload?: Json
          edited_by?: string
          reverted_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
