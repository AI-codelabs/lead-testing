export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversion_uploads: {
        Row: {
          attempted_at: string
          attempts: number
          click_id: string | null
          click_id_type: string | null
          conversion_action: string | null
          created_at: string
          currency: string | null
          error: string | null
          id: string
          lead_id: string
          network: string
          request_payload: Json
          response_payload: Json
          stage: string
          status: string
          succeeded_at: string | null
          updated_at: string
          value: number | null
          workspace_key: string
        }
        Insert: {
          attempted_at?: string
          attempts?: number
          click_id?: string | null
          click_id_type?: string | null
          conversion_action?: string | null
          created_at?: string
          currency?: string | null
          error?: string | null
          id?: string
          lead_id: string
          network: string
          request_payload?: Json
          response_payload?: Json
          stage: string
          status?: string
          succeeded_at?: string | null
          updated_at?: string
          value?: number | null
          workspace_key: string
        }
        Update: {
          attempted_at?: string
          attempts?: number
          click_id?: string | null
          click_id_type?: string | null
          conversion_action?: string | null
          created_at?: string
          currency?: string | null
          error?: string | null
          id?: string
          lead_id?: string
          network?: string
          request_payload?: Json
          response_payload?: Json
          stage?: string
          status?: string
          succeeded_at?: string | null
          updated_at?: string
          value?: number | null
          workspace_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_uploads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          workspace_key: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          state: string
          workspace_key: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          workspace_key?: string
        }
        Relationships: []
      }
      google_ads_settings: {
        Row: {
          connected_at: string | null
          conversion_action_lost: string | null
          conversion_action_new: string | null
          conversion_action_qualified: string | null
          conversion_action_won: string | null
          created_at: string
          customer_id: string | null
          default_currency: string
          enabled: boolean
          login_customer_id: string | null
          oauth_email: string | null
          oauth_refresh_token: string | null
          updated_at: string
          workspace_key: string
        }
        Insert: {
          connected_at?: string | null
          conversion_action_lost?: string | null
          conversion_action_new?: string | null
          conversion_action_qualified?: string | null
          conversion_action_won?: string | null
          created_at?: string
          customer_id?: string | null
          default_currency?: string
          enabled?: boolean
          login_customer_id?: string | null
          oauth_email?: string | null
          oauth_refresh_token?: string | null
          updated_at?: string
          workspace_key: string
        }
        Update: {
          connected_at?: string | null
          conversion_action_lost?: string | null
          conversion_action_new?: string | null
          conversion_action_qualified?: string | null
          conversion_action_won?: string | null
          created_at?: string
          customer_id?: string | null
          default_currency?: string
          enabled?: boolean
          login_customer_id?: string | null
          oauth_email?: string | null
          oauth_refresh_token?: string | null
          updated_at?: string
          workspace_key?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          company: string
          consent: string
          created_at: string
          custom_fields: Json
          email: string
          fbclid: string
          fbp: string
          ga_client_id: string
          ga_session_id: string
          gbraid: string
          gclid: string
          id: string
          landing_page_url: string
          li_fat_id: string
          lost_reason: string | null
          message: string
          msclkid: string
          name: string
          page_path: string
          phone: string
          qualification: string
          raw_payload: Json
          referrer_url: string
          source: string
          stage: string
          stage_changed_at: string
          updated_at: string
          user_agent: string
          utm_campaign: string
          utm_content: string
          utm_medium: string
          utm_source: string
          utm_term: string
          wbraid: string
          won_value: number | null
          workspace_key: string
        }
        Insert: {
          company?: string
          consent?: string
          created_at?: string
          custom_fields?: Json
          email?: string
          fbclid?: string
          fbp?: string
          ga_client_id?: string
          ga_session_id?: string
          gbraid?: string
          gclid?: string
          id?: string
          landing_page_url?: string
          li_fat_id?: string
          lost_reason?: string | null
          message?: string
          msclkid?: string
          name?: string
          page_path?: string
          phone?: string
          qualification?: string
          raw_payload?: Json
          referrer_url?: string
          source?: string
          stage?: string
          stage_changed_at?: string
          updated_at?: string
          user_agent?: string
          utm_campaign?: string
          utm_content?: string
          utm_medium?: string
          utm_source?: string
          utm_term?: string
          wbraid?: string
          won_value?: number | null
          workspace_key: string
        }
        Update: {
          company?: string
          consent?: string
          created_at?: string
          custom_fields?: Json
          email?: string
          fbclid?: string
          fbp?: string
          ga_client_id?: string
          ga_session_id?: string
          gbraid?: string
          gclid?: string
          id?: string
          landing_page_url?: string
          li_fat_id?: string
          lost_reason?: string | null
          message?: string
          msclkid?: string
          name?: string
          page_path?: string
          phone?: string
          qualification?: string
          raw_payload?: Json
          referrer_url?: string
          source?: string
          stage?: string
          stage_changed_at?: string
          updated_at?: string
          user_agent?: string
          utm_campaign?: string
          utm_content?: string
          utm_medium?: string
          utm_source?: string
          utm_term?: string
          wbraid?: string
          won_value?: number | null
          workspace_key?: string
        }
        Relationships: []
      }
      meta_ads_settings: {
        Row: {
          access_token: string | null
          connected_at: string | null
          created_at: string
          default_currency: string
          enabled: boolean
          event_name_lost: string | null
          event_name_new: string | null
          event_name_qualified: string | null
          event_name_won: string | null
          pixel_id: string
          test_event_code: string | null
          updated_at: string
          workspace_key: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          default_currency?: string
          enabled?: boolean
          event_name_lost?: string | null
          event_name_new?: string | null
          event_name_qualified?: string | null
          event_name_won?: string | null
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string
          workspace_key: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          default_currency?: string
          enabled?: boolean
          event_name_lost?: string | null
          event_name_new?: string | null
          event_name_qualified?: string | null
          event_name_won?: string | null
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string
          workspace_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string
          id: string
          owner_email: string
          owner_name: string
          updated_at: string
          workspace_key: string
          workspace_name: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          id: string
          owner_email?: string
          owner_name?: string
          updated_at?: string
          workspace_key: string
          workspace_name?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          id?: string
          owner_email?: string
          owner_name?: string
          updated_at?: string
          workspace_key?: string
          workspace_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
