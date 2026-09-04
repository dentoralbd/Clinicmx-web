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
      app_users: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          role: string
          full_name: string
          identifier: string
          // Nullable since migration 038 (Phase 2, SECURITY-HARDENING.md) —
          // kept as the rollback lever, no longer written by new code.
          password_hash: string | null
          password_salt: string | null
          is_active: boolean
          permissions: Json
          last_login_at: string | null
          // Added by migration 038 — links to a real Supabase Auth user.
          auth_user_id: string | null
          auth_email: string | null
          // Added by migration 048 — doctor-specific default for
          // treatments.doctor_share_pct; NULL falls back to the 30% global default.
          default_share_pct: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          role: string
          full_name: string
          identifier: string
          password_hash?: string | null
          password_salt?: string | null
          is_active?: boolean
          permissions?: Json
          last_login_at?: string | null
          auth_user_id?: string | null
          auth_email?: string | null
          default_share_pct?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          role?: string
          full_name?: string
          identifier?: string
          password_hash?: string | null
          password_salt?: string | null
          is_active?: boolean
          permissions?: Json
          last_login_at?: string | null
          auth_user_id?: string | null
          auth_email?: string | null
          default_share_pct?: number | null
        }
        Relationships: []
      }
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
          patient_type: string
          created_at: string
          updated_at: string
          followup_reminder_sent_at: string | null
          dob_is_estimated: boolean
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
          patient_type?: string
          created_at?: string
          updated_at?: string
          followup_reminder_sent_at?: string | null
          dob_is_estimated?: boolean
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
          patient_type?: string
          created_at?: string
          updated_at?: string
          followup_reminder_sent_at?: string | null
          dob_is_estimated?: boolean
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
          reminder_sent_at: string | null
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
          reminder_sent_at?: string | null
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
          reminder_sent_at?: string | null
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
      appointment_schedule_windows: {
        Row: {
          id: string
          day_of_week: number | null
          override_date: string | null
          start_hour: number
          start_minute: number
          end_hour: number
          end_minute: number
          created_at: string
        }
        Insert: {
          id?: string
          day_of_week?: number | null
          override_date?: string | null
          start_hour: number
          start_minute: number
          end_hour: number
          end_minute: number
          created_at?: string
        }
        Update: {
          id?: string
          day_of_week?: number | null
          override_date?: string | null
          start_hour?: number
          start_minute?: number
          end_hour?: number
          end_minute?: number
          created_at?: string
        }
        Relationships: []
      }
      appointment_schedule_date_overrides: {
        Row: {
          id: string
          override_date: string
          is_closed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          override_date: string
          is_closed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          override_date?: string
          is_closed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          designation: string | null
          monthly_salary: number
          app_user_id: string | null
          is_active: boolean
          joined_on: string | null
          notes: string | null
          leave_quota_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          phone?: string | null
          designation?: string | null
          monthly_salary?: number
          app_user_id?: string | null
          is_active?: boolean
          joined_on?: string | null
          notes?: string | null
          leave_quota_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          designation?: string | null
          monthly_salary?: number
          app_user_id?: string | null
          is_active?: boolean
          joined_on?: string | null
          notes?: string | null
          leave_quota_days?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_app_user_id_fkey'
            columns: ['app_user_id']
            isOneToOne: false
            referencedRelation: 'app_users'
            referencedColumns: ['id']
          }
        ]
      }
      staff_salary_payments: {
        Row: {
          id: string
          staff_id: string
          period_month: string
          base_salary: number
          bonus: number
          deduction: number
          advance: number
          amount_paid: number
          payment_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          staff_id: string
          period_month: string
          base_salary?: number
          bonus?: number
          deduction?: number
          advance?: number
          amount_paid?: number
          payment_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          staff_id?: string
          period_month?: string
          base_salary?: number
          bonus?: number
          deduction?: number
          advance?: number
          amount_paid?: number
          payment_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_salary_payments_staff_id_fkey'
            columns: ['staff_id']
            isOneToOne: false
            referencedRelation: 'staff'
            referencedColumns: ['id']
          }
        ]
      }
      clinic_expenses: {
        Row: {
          id: string
          category: string
          description: string
          amount: number
          expense_date: string
          vendor: string | null
          notes: string | null
          created_by: string | null
          recurring_expense_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: string
          description: string
          amount: number
          expense_date?: string
          vendor?: string | null
          notes?: string | null
          created_by?: string | null
          recurring_expense_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string
          description?: string
          amount?: number
          expense_date?: string
          vendor?: string | null
          notes?: string | null
          created_by?: string | null
          recurring_expense_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clinic_expenses_recurring_expense_id_fkey'
            columns: ['recurring_expense_id']
            isOneToOne: false
            referencedRelation: 'recurring_expenses'
            referencedColumns: ['id']
          }
        ]
      }
      recurring_expenses: {
        Row: {
          id: string
          category: string
          description: string
          amount: number
          vendor: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: string
          description: string
          amount: number
          vendor?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string
          description?: string
          amount?: number
          vendor?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_leaves: {
        Row: {
          id: string
          staff_id: string | null
          app_user_id: string | null
          requester_name: string
          leave_type: string
          start_date: string
          end_date: string
          reason: string | null
          status: string
          decided_by: string | null
          decided_at: string | null
          decision_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          staff_id?: string | null
          app_user_id?: string | null
          requester_name?: string
          leave_type: string
          start_date: string
          end_date: string
          reason?: string | null
          status?: string
          decided_by?: string | null
          decided_at?: string | null
          decision_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          staff_id?: string | null
          app_user_id?: string | null
          requester_name?: string
          leave_type?: string
          start_date?: string
          end_date?: string
          reason?: string | null
          status?: string
          decided_by?: string | null
          decided_at?: string | null
          decision_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_leaves_staff_id_fkey'
            columns: ['staff_id']
            isOneToOne: false
            referencedRelation: 'staff'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staff_leaves_app_user_id_fkey'
            columns: ['app_user_id']
            isOneToOne: false
            referencedRelation: 'app_users'
            referencedColumns: ['id']
          }
        ]
      }
      offline_edit_queue: {
        Row: {
          id: string
          client_mutation_id: string
          group_id: string | null
          seq: number
          table_name: string
          action: string
          meta: Json
          created_by_user_id: string | null
          actor: string
          status: string
          attempts: number
          last_error: string | null
          device_id: string | null
          payload_encrypted: string | null
          payload_iv: string | null
          payload_alg: string | null
          claimed_at: string | null
          claimed_by_device: string | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_mutation_id: string
          group_id?: string | null
          seq?: number
          table_name: string
          action: string
          meta?: Json
          created_by_user_id?: string | null
          actor: string
          status?: string
          attempts?: number
          last_error?: string | null
          device_id?: string | null
          payload_encrypted?: string | null
          payload_iv?: string | null
          payload_alg?: string | null
          claimed_at?: string | null
          claimed_by_device?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_mutation_id?: string
          group_id?: string | null
          seq?: number
          table_name?: string
          action?: string
          meta?: Json
          created_by_user_id?: string | null
          actor?: string
          status?: string
          attempts?: number
          last_error?: string | null
          device_id?: string | null
          payload_encrypted?: string | null
          payload_iv?: string | null
          payload_alg?: string | null
          claimed_at?: string | null
          claimed_by_device?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'offline_edit_queue_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'app_users'
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
          original_cost: number | null
          notes: string | null
          is_invoiced: boolean
          invoice_id: string | null
          treatment_plan_group_id: string | null
          doctor_name: string | null
          doctor_share_pct: number | null
          completed_at: string | null
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
          original_cost?: number | null
          notes?: string | null
          is_invoiced?: boolean
          invoice_id?: string | null
          treatment_plan_group_id?: string | null
          doctor_name?: string | null
          doctor_share_pct?: number | null
          completed_at?: string | null
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
          original_cost?: number | null
          notes?: string | null
          is_invoiced?: boolean
          invoice_id?: string | null
          treatment_plan_group_id?: string | null
          doctor_name?: string | null
          doctor_share_pct?: number | null
          completed_at?: string | null
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
      lab_work: {
        Row: {
          id: string
          patient_id: string
          lab_name: string
          work_type: string
          teeth: Json
          unit_count: number
          shade: string | null
          material: string | null
          pricing_mode: string
          unit_price: number
          flat_price: number
          status: string
          date_sent: string | null
          expected_date: string | null
          date_received: string | null
          is_paid: boolean
          notes: string | null
          source_plan_group_id: string | null
          source_treatment_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          lab_name?: string
          work_type?: string
          teeth?: Json
          unit_count?: number
          shade?: string | null
          material?: string | null
          pricing_mode?: string
          unit_price?: number
          flat_price?: number
          status?: string
          date_sent?: string | null
          expected_date?: string | null
          date_received?: string | null
          is_paid?: boolean
          notes?: string | null
          source_plan_group_id?: string | null
          source_treatment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          lab_name?: string
          work_type?: string
          teeth?: Json
          unit_count?: number
          shade?: string | null
          material?: string | null
          pricing_mode?: string
          unit_price?: number
          flat_price?: number
          status?: string
          date_sent?: string | null
          expected_date?: string | null
          date_received?: string | null
          is_paid?: boolean
          notes?: string | null
          source_plan_group_id?: string | null
          source_treatment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lab_work_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lab_work_source_treatment_id_fkey'
            columns: ['source_treatment_id']
            isOneToOne: false
            referencedRelation: 'treatments'
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
          language: string
          discount_percent: number | null
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
          language?: string
          discount_percent?: number | null
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
          language?: string
          discount_percent?: number | null
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
          merged_into_invoice_id: string | null
          bangla_qr_hold_amount: number | null
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
          merged_into_invoice_id?: string | null
          bangla_qr_hold_amount?: number | null
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
          merged_into_invoice_id?: string | null
          bangla_qr_hold_amount?: number | null
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
          gateway_provider: string | null
          gateway_reference: string | null
          gateway_transaction_id: string | null
          gateway_status: string | null
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
          gateway_provider?: string | null
          gateway_reference?: string | null
          gateway_transaction_id?: string | null
          gateway_status?: string | null
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
          gateway_provider?: string | null
          gateway_reference?: string | null
          gateway_transaction_id?: string | null
          gateway_status?: string | null
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
          bangla_qr_merchant_payload: string | null
        }
        Insert: {
          id: number
          invoice_prefix?: string
          next_invoice_number?: number
          default_tax_rate?: number
          late_interest_rate?: number
          payment_terms?: string | null
          updated_at?: string
          bangla_qr_merchant_payload?: string | null
        }
        Update: {
          id?: number
          invoice_prefix?: string
          next_invoice_number?: number
          default_tax_rate?: number
          late_interest_rate?: number
          payment_terms?: string | null
          updated_at?: string
          bangla_qr_merchant_payload?: string | null
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          id: number
          daily: Json
          weekly: Json
          monthly: Json
          encrypt_enabled: boolean
          passphrase: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          daily?: Json
          weekly?: Json
          monthly?: Json
          encrypt_enabled?: boolean
          passphrase?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          daily?: Json
          weekly?: Json
          monthly?: Json
          encrypt_enabled?: boolean
          passphrase?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      backup_upload_claims: {
        Row: {
          category: string
          instant: string
          claimed_at: string
          claimed_by_device: string | null
        }
        Insert: {
          category: string
          instant: string
          claimed_at?: string
          claimed_by_device?: string | null
        }
        Update: {
          category?: string
          instant?: string
          claimed_at?: string
          claimed_by_device?: string | null
        }
        Relationships: []
      }
      app_notifications: {
        Row: {
          id: string
          title: string
          message: string
          link_to: string | null
          audience: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          message: string
          link_to?: string | null
          audience?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          message?: string
          link_to?: string | null
          audience?: string | null
          read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      integrity_findings: {
        Row: {
          id: string
          check_name: string
          severity: string
          entity_table: string
          entity_id: string
          details: Json
          details_hash: string
          first_detected_at: string
          last_seen_at: string
          resolved_at: string | null
          reviewed: boolean
          reviewed_by: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          check_name: string
          severity: string
          entity_table: string
          entity_id: string
          details: Json
          details_hash: string
          first_detected_at?: string
          last_seen_at?: string
          resolved_at?: string | null
          reviewed?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          check_name?: string
          severity?: string
          entity_table?: string
          entity_id?: string
          details?: Json
          details_hash?: string
          first_detected_at?: string
          last_seen_at?: string
          resolved_at?: string | null
          reviewed?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      integrity_scan_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          triggered_by: string | null
          counts: Json | null
          error: string | null
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          triggered_by?: string | null
          counts?: Json | null
          error?: string | null
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          triggered_by?: string | null
          counts?: Json | null
          error?: string | null
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
      dental_record_history: {
        Row: {
          id: string
          patient_id: string
          tooth_number: number
          condition: string
          notes: string | null
          procedure_date: string
          doctor_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tooth_number: number
          condition?: string
          notes?: string | null
          procedure_date?: string
          doctor_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tooth_number?: number
          condition?: string
          notes?: string | null
          procedure_date?: string
          doctor_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dental_record_history_patient_id_fkey'
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
          invoice_id: string | null
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
          invoice_id?: string | null
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
          invoice_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_visits_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_visits_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
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
      catalog_categories: {
        Row: {
          id: string
          domain: string
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          domain: string
          name: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          domain?: string
          name?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      treatment_catalog_items: {
        Row: {
          id: string
          category_id: string
          name: string
          default_fee: number | null
          default_duration_mins: number | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          default_fee?: number | null
          default_duration_mins?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          default_fee?: number | null
          default_duration_mins?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'treatment_catalog_items_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'catalog_categories'
            referencedColumns: ['id']
          }
        ]
      }
      queue_entries: {
        Row: {
          id: string
          patient_id: string | null
          appointment_id: string | null
          patient_name: string
          serial_number: number
          sort_key: number
          status: 'waiting' | 'serving' | 'on_hold' | 'completed' | 'skipped'
          assigned_doctor: string | null
          room_number: string | null
          procedure_name: string | null
          estimated_duration_mins: number
          priority: 'normal' | 'urgent'
          hold_reason: string | null
          billing_status: 'none' | 'pending_payment' | 'paid_and_dispensed'
          queue_date: string
          absent_marks: number
          last_absent_at: string | null
          called_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id?: string | null
          appointment_id?: string | null
          patient_name: string
          serial_number: number
          sort_key: number
          status?: 'waiting' | 'serving' | 'on_hold' | 'completed' | 'skipped'
          assigned_doctor?: string | null
          room_number?: string | null
          procedure_name?: string | null
          estimated_duration_mins?: number
          priority?: 'normal' | 'urgent'
          hold_reason?: string | null
          billing_status?: 'none' | 'pending_payment' | 'paid_and_dispensed'
          queue_date?: string
          absent_marks?: number
          last_absent_at?: string | null
          called_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string | null
          appointment_id?: string | null
          patient_name?: string
          serial_number?: number
          sort_key?: number
          status?: 'waiting' | 'serving' | 'on_hold' | 'completed' | 'skipped'
          assigned_doctor?: string | null
          room_number?: string | null
          procedure_name?: string | null
          estimated_duration_mins?: number
          priority?: 'normal' | 'urgent'
          hold_reason?: string | null
          billing_status?: 'none' | 'pending_payment' | 'paid_and_dispensed'
          queue_date?: string
          absent_marks?: number
          last_absent_at?: string | null
          called_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'queue_entries_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'queue_entries_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'queue_entries_assigned_doctor_fkey'
            columns: ['assigned_doctor']
            isOneToOne: false
            referencedRelation: 'app_users'
            referencedColumns: ['id']
          }
        ]
      }
      queue_settings: {
        Row: {
          id: boolean
          privacy_mode: 'full' | 'masked' | 'token_only'
          infotainment_enabled: boolean
          infotainment_interval_secs: number
          absent_pushdown_places: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          privacy_mode?: 'full' | 'masked' | 'token_only'
          infotainment_enabled?: boolean
          infotainment_interval_secs?: number
          absent_pushdown_places?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          privacy_mode?: 'full' | 'masked' | 'token_only'
          infotainment_enabled?: boolean
          infotainment_interval_secs?: number
          absent_pushdown_places?: number
          updated_at?: string
        }
        Relationships: []
      }
      custom_medications: {
        Row: {
          id: string
          category_id: string
          brand: string
          generic: string
          dosage_form: string | null
          default_dosage: string | null
          default_frequency: string | null
          default_duration: string | null
          default_instructions: string | null
          default_route: string | null
          notes: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          brand: string
          generic: string
          dosage_form?: string | null
          default_dosage?: string | null
          default_frequency?: string | null
          default_duration?: string | null
          default_instructions?: string | null
          default_route?: string | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          brand?: string
          generic?: string
          dosage_form?: string | null
          default_dosage?: string | null
          default_frequency?: string | null
          default_duration?: string | null
          default_instructions?: string | null
          default_route?: string | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'custom_medications_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'catalog_categories'
            referencedColumns: ['id']
          }
        ]
      }
      prescription_letterhead_doctors: {
        Row: {
          id: string
          full_name: string
          degrees: string
          designation: string
          bmdc_reg: string
          display_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          degrees?: string
          designation?: string
          bmdc_reg?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          degrees?: string
          designation?: string
          bmdc_reg?: string
          display_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      authorized_ips: {
        Row: {
          id: string
          user_id: string
          ip: string
          status: string
          requested_by: string | null
          requested_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          ip: string
          status?: string
          requested_by?: string | null
          requested_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          ip?: string
          status?: string
          requested_by?: string | null
          requested_at?: string
          decided_at?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          id: string
          occurred_at: string
          action: string
          entity_type: string
          entity_id: string | null
          entity_label: string | null
          patient_id: string | null
          patient_name: string | null
          details: string | null
          ip: string | null
          actor: string
        }
        Insert: {
          id?: string
          occurred_at?: string
          action: string
          entity_type: string
          entity_id?: string | null
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          details?: string | null
          ip?: string | null
          actor: string
        }
        Update: {
          id?: string
          occurred_at?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          entity_label?: string | null
          patient_id?: string | null
          patient_name?: string | null
          details?: string | null
          ip?: string | null
          actor?: string
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
    Functions: {
      next_queue_serial: {
        Args: { p_queue_date: string }
        Returns: number
      }
    }
    Enums: Record<string, never>
  }
}
