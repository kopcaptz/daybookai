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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      crash_reports: {
        Row: {
          app_version: string | null
          breadcrumbs: Json | null
          component_stack: string | null
          created_at: string | null
          device_info: Json | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          message: string
          occurrence_count: number | null
          session_id: string | null
          stack: string | null
          status: string | null
          url: string | null
        }
        Insert: {
          app_version?: string | null
          breadcrumbs?: Json | null
          component_stack?: string | null
          created_at?: string | null
          device_info?: Json | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          message: string
          occurrence_count?: number | null
          session_id?: string | null
          stack?: string | null
          status?: string | null
          url?: string | null
        }
        Update: {
          app_version?: string | null
          breadcrumbs?: Json | null
          component_stack?: string | null
          created_at?: string | null
          device_info?: Json | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          message?: string
          occurrence_count?: number | null
          session_id?: string | null
          stack?: string | null
          status?: string | null
          url?: string | null
        }
        Relationships: []
      }
      ethereal_calendar_events: {
        Row: {
          all_day: boolean | null
          created_at: string | null
          creator_id: string
          description: string | null
          end_at: string | null
          id: string
          room_id: string
          start_at: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          end_at?: string | null
          id?: string
          room_id: string
          start_at: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          end_at?: string | null
          id?: string
          room_id?: string
          start_at?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_calendar_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_calendar_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_chronicle_revisions: {
        Row: {
          chronicle_id: string
          content_snapshot: string
          created_at: string | null
          editor_id: string
          id: string
          title_snapshot: string
        }
        Insert: {
          chronicle_id: string
          content_snapshot: string
          created_at?: string | null
          editor_id: string
          id?: string
          title_snapshot: string
        }
        Update: {
          chronicle_id?: string
          content_snapshot?: string
          created_at?: string | null
          editor_id?: string
          id?: string
          title_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_chronicle_revisions_chronicle_id_fkey"
            columns: ["chronicle_id"]
            isOneToOne: false
            referencedRelation: "ethereal_chronicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_chronicles: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          editing_by: string | null
          editing_expires_at: string | null
          id: string
          media: Json
          pinned: boolean
          room_id: string
          tags: string[]
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          editing_by?: string | null
          editing_expires_at?: string | null
          id?: string
          media?: Json
          pinned?: boolean
          room_id: string
          tags?: string[]
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          editing_by?: string | null
          editing_expires_at?: string | null
          id?: string
          media?: Json
          pinned?: boolean
          room_id?: string
          tags?: string[]
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_chronicles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_chronicles_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_game_rounds: {
        Row: {
          ai_reflection: string | null
          card_type: string | null
          category: string
          created_at: string | null
          id: string
          options: Json
          picker_answer: string | null
          picker_revealed: boolean
          responder_answer: string | null
          responder_custom: string | null
          round_number: number
          session_id: string
          situation_text: string
          values_questions: Json | null
        }
        Insert: {
          ai_reflection?: string | null
          card_type?: string | null
          category: string
          created_at?: string | null
          id?: string
          options?: Json
          picker_answer?: string | null
          picker_revealed?: boolean
          responder_answer?: string | null
          responder_custom?: string | null
          round_number: number
          session_id: string
          situation_text: string
          values_questions?: Json | null
        }
        Update: {
          ai_reflection?: string | null
          card_type?: string | null
          category?: string
          created_at?: string | null
          id?: string
          options?: Json
          picker_answer?: string | null
          picker_revealed?: boolean
          responder_answer?: string | null
          responder_custom?: string | null
          round_number?: number
          session_id?: string
          situation_text?: string
          values_questions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_game_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ethereal_game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_game_sessions: {
        Row: {
          adult_level: number
          boundaries: Json | null
          consent_picker: boolean
          consent_responder: boolean
          created_at: string | null
          current_round: number
          game_type: string
          id: string
          picker_id: string | null
          responder_id: string | null
          room_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          adult_level?: number
          boundaries?: Json | null
          consent_picker?: boolean
          consent_responder?: boolean
          created_at?: string | null
          current_round?: number
          game_type?: string
          id?: string
          picker_id?: string | null
          responder_id?: string | null
          room_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          adult_level?: number
          boundaries?: Json | null
          consent_picker?: boolean
          consent_responder?: boolean
          created_at?: string | null
          current_round?: number
          game_type?: string
          id?: string
          picker_id?: string | null
          responder_id?: string | null
          room_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_game_sessions_picker_id_fkey"
            columns: ["picker_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_game_sessions_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_game_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          image_h: number | null
          image_mime: string | null
          image_path: string | null
          image_w: number | null
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          image_h?: number | null
          image_mime?: string | null
          image_path?: string | null
          image_w?: number | null
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          image_h?: number | null
          image_mime?: string | null
          image_path?: string | null
          image_w?: number | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_room_members: {
        Row: {
          device_id: string
          display_name: string
          id: string
          joined_at: string | null
          last_seen_at: string | null
          room_id: string
        }
        Insert: {
          device_id: string
          display_name: string
          id?: string
          joined_at?: string | null
          last_seen_at?: string | null
          room_id: string
        }
        Update: {
          device_id?: string
          display_name?: string
          id?: string
          joined_at?: string | null
          last_seen_at?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_rooms: {
        Row: {
          created_at: string | null
          id: string
          member_limit: number | null
          name: string | null
          owner_member_id: string | null
          pin_hash: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_limit?: number | null
          name?: string | null
          owner_member_id?: string | null
          pin_hash: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_limit?: number | null
          name?: string | null
          owner_member_id?: string | null
          pin_hash?: string
        }
        Relationships: []
      }
      ethereal_sessions: {
        Row: {
          channel_key: string
          created_at: string | null
          expires_at: string
          id: string
          member_id: string
          room_id: string
        }
        Insert: {
          channel_key: string
          created_at?: string | null
          expires_at: string
          id?: string
          member_id: string
          room_id: string
        }
        Update: {
          channel_key?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_sessions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ethereal_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          creator_id: string
          description: string | null
          due_at: string | null
          id: string
          priority: string
          room_id: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          room_id: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          room_id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ethereal_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_tasks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "ethereal_room_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ethereal_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "ethereal_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          admin_notes: string | null
          app_version: string | null
          created_at: string | null
          device_info: Json | null
          diagnostics: Json | null
          id: string
          image_url: string | null
          message: string
          status: Database["public"]["Enums"]["feedback_status"] | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          app_version?: string | null
          created_at?: string | null
          device_info?: Json | null
          diagnostics?: Json | null
          id?: string
          image_url?: string | null
          message: string
          status?: Database["public"]["Enums"]["feedback_status"] | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          app_version?: string | null
          created_at?: string | null
          device_info?: Json | null
          diagnostics?: Json | null
          id?: string
          image_url?: string | null
          message?: string
          status?: Database["public"]["Enums"]["feedback_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          blocked_until: string | null
          created_at: string | null
          endpoint: string
          fail_count: number | null
          id: string
          identifier: string
          last_attempt_at: string | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string | null
          endpoint: string
          fail_count?: number | null
          id?: string
          identifier: string
          last_attempt_at?: string | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string | null
          endpoint?: string
          fail_count?: number | null
          id?: string
          identifier?: string
          last_attempt_at?: string | null
        }
        Relationships: []
      }
      usage_analytics: {
        Row: {
          app_version: string | null
          created_at: string | null
          date: string
          device_info: Json | null
          id: string
          metrics: Json
          session_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          date: string
          device_info?: Json | null
          id?: string
          metrics: Json
          session_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          date?: string
          device_info?: Json | null
          id?: string
          metrics?: Json
          session_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ethereal_join_room: {
        Args: {
          p_channel_key: string
          p_device_id: string
          p_display_name: string
          p_room_id: string
          p_ttl_seconds?: number
        }
        Returns: {
          current_count: number
          is_new: boolean
          is_owner: boolean
          member_id: string
          session_id: string
        }[]
      }
    }
    Enums: {
      feedback_status: "new" | "read" | "resolved" | "archived"
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
      feedback_status: ["new", "read", "resolved", "archived"],
    },
  },
} as const
