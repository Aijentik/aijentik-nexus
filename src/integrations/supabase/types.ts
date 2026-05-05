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
      agents: {
        Row: {
          config: Json | null
          created_at: string
          elevenlabs_agent_id: string | null
          id: string
          kind: Database["public"]["Enums"]["agent_kind"]
          name: string
          prompt: string | null
          status: Database["public"]["Enums"]["agent_status"]
          twilio_phone_number: string | null
          updated_at: string
          venue_id: string
          voice_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["agent_kind"]
          name: string
          prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          twilio_phone_number?: string | null
          updated_at?: string
          venue_id: string
          voice_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["agent_kind"]
          name?: string
          prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          twilio_phone_number?: string | null
          updated_at?: string
          venue_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_time: string
          created_at: string
          guest_email: string | null
          guest_id: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          notes: string | null
          party_size: number
          source: string | null
          status: Database["public"]["Enums"]["booking_status"]
          table_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          booking_time: string
          created_at?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          party_size?: number
          source?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          booking_time?: string
          created_at?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          party_size?: number
          source?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_events: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          meta: Json | null
          reason: string | null
          severity: Database["public"]["Enums"]["brain_severity"]
          title: string
          venue_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          reason?: string | null
          severity?: Database["public"]["Enums"]["brain_severity"]
          title: string
          venue_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          reason?: string | null
          severity?: Database["public"]["Enums"]["brain_severity"]
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          booking_id: string | null
          caller: string | null
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          outcome: Database["public"]["Enums"]["call_outcome"] | null
          started_at: string
          summary: string | null
          transcript: Json | null
          venue_id: string
        }
        Insert: {
          agent_id?: string | null
          booking_id?: string | null
          caller?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          started_at?: string
          summary?: string | null
          transcript?: Json | null
          venue_id: string
        }
        Update: {
          agent_id?: string | null
          booking_id?: string | null
          caller?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          started_at?: string
          summary?: string | null
          transcript?: Json | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_visit: string | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string
          venue_id: string
          vip: boolean | null
          visit_count: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
          venue_id: string
          vip?: boolean | null
          visit_count?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
          venue_id?: string
          vip?: boolean | null
          visit_count?: number | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          impact: string | null
          title: string
          venue_id: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          impact?: string | null
          title: string
          venue_id: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          impact?: string | null
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          connected: boolean | null
          created_at: string
          id: string
          provider: string
          venue_id: string
        }
        Insert: {
          config?: Json | null
          connected?: boolean | null
          created_at?: string
          id?: string
          provider: string
          venue_id: string
        }
        Update: {
          config?: Json | null
          connected?: boolean | null
          created_at?: string
          id?: string
          provider?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          tags: string[] | null
          title: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string | null
          contact: string | null
          created_at: string
          direction: string | null
          id: string
          status: string | null
          venue_id: string
        }
        Insert: {
          body: string
          channel?: string | null
          contact?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          status?: string | null
          venue_id: string
        }
        Update: {
          body?: string
          channel?: string | null
          contact?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          status?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          input: Json | null
          status: string | null
          steps: Json | null
          user_id: string
          venue_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          status?: string | null
          steps?: Json | null
          user_id: string
          venue_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          status?: string | null
          steps?: Json | null
          user_id?: string
          venue_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_venue_id: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_venue_id?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_venue_id?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          capacity: number
          combinable: boolean | null
          created_at: string
          height: number
          id: string
          label: string
          shape: string
          updated_at: string
          venue_id: string
          width: number
          x: number
          y: number
          zone_id: string | null
        }
        Insert: {
          capacity?: number
          combinable?: boolean | null
          created_at?: string
          height?: number
          id?: string
          label: string
          shape?: string
          updated_at?: string
          venue_id: string
          width?: number
          x?: number
          y?: number
          zone_id?: string | null
        }
        Update: {
          capacity?: number
          combinable?: boolean | null
          created_at?: string
          height?: number
          id?: string
          label?: string
          shape?: string
          updated_at?: string
          venue_id?: string
          width?: number
          x?: number
          y?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          brand_voice: string | null
          capacity: number | null
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          cuisine: string | null
          description: string | null
          forwarded_number: string | null
          hours: Json | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          status: string | null
          updated_at: string
          venue_type: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_voice?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          forwarded_number?: string | null
          hours?: Json | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          status?: string | null
          updated_at?: string
          venue_type?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_voice?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          forwarded_number?: string | null
          hours?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string
          venue_type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      zones: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          position: number | null
          venue_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number | null
          venue_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number | null
          venue_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_venue: {
        Args: { _user: string; _venue: string }
        Returns: boolean
      }
      has_venue_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
          _venue: string
        }
        Returns: boolean
      }
      is_venue_member: {
        Args: { _user: string; _venue: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_kind: "voice" | "booking" | "ops" | "marketing" | "concierge"
      agent_status: "idle" | "active" | "training" | "paused"
      app_role: "owner" | "manager" | "staff" | "viewer"
      booking_status:
        | "pending"
        | "confirmed"
        | "seated"
        | "completed"
        | "cancelled"
        | "no_show"
      brain_severity: "info" | "success" | "warn" | "critical"
      call_outcome:
        | "booking"
        | "enquiry"
        | "complaint"
        | "transfer"
        | "voicemail"
        | "other"
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
    Enums: {
      agent_kind: ["voice", "booking", "ops", "marketing", "concierge"],
      agent_status: ["idle", "active", "training", "paused"],
      app_role: ["owner", "manager", "staff", "viewer"],
      booking_status: [
        "pending",
        "confirmed",
        "seated",
        "completed",
        "cancelled",
        "no_show",
      ],
      brain_severity: ["info", "success", "warn", "critical"],
      call_outcome: [
        "booking",
        "enquiry",
        "complaint",
        "transfer",
        "voicemail",
        "other",
      ],
    },
  },
} as const
