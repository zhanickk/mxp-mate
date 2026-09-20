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
      activity_log: {
        Row: {
          action: string
          assignment_id: string | null
          created_at: string
          id: string
          member_id: string | null
        }
        Insert: {
          action: string
          assignment_id?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
        }
        Update: {
          action?: string
          assignment_id?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      members: {
        Row: {
          birthday: string | null
          created_at: string
          full_name: string
          id: string
          invite_code: string
          is_active: boolean
          position: Database["public"]["Enums"]["member_position"]
          team_id: string | null
          telegram_chat_id: number | null
          telegram_username: string | null
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          full_name: string
          id?: string
          invite_code?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["member_position"]
          team_id?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
        }
        Update: {
          birthday?: string | null
          created_at?: string
          full_name?: string
          id?: string
          invite_code?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["member_position"]
          team_id?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          member_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          member_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          member_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          accepted_at: string | null
          awaiting_comment: boolean
          comment: string | null
          created_at: string
          done_at: string | null
          id: string
          member_id: string
          reminder_sent: boolean
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          submitted_at: string | null
          task_id: string
          team_id: string | null
          telegram_message_id: number | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          awaiting_comment?: boolean
          comment?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          member_id: string
          reminder_sent?: boolean
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          submitted_at?: string | null
          task_id: string
          team_id?: string | null
          telegram_message_id?: number | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          awaiting_comment?: boolean
          comment?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          member_id?: string
          reminder_sent?: boolean
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          submitted_at?: string | null
          task_id?: string
          team_id?: string | null
          telegram_message_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          category: string | null
          created_at: string
          default_deadline_days: number
          description: string | null
          id: string
          team_id: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_deadline_days?: number
          description?: string | null
          id?: string
          team_id?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_deadline_days?: number
          description?: string | null
          id?: string
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deadline: string
          description: string | null
          id: string
          is_recurring: boolean
          parent_task_id: string | null
          recurrence: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deadline: string
          description?: string | null
          id?: string
          is_recurring?: boolean
          parent_task_id?: string | null
          recurrence?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string
          description?: string | null
          id?: string
          is_recurring?: boolean
          parent_task_id?: string | null
          recurrence?: string | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_profile: {
        Args: { _email?: string; _full_name?: string }
        Returns: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          member_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_invite_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      can_review_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      claim_position: { Args: { _code: string; _member_id: string }; Returns: undefined }
      member_claim_preview: {
        Args: { _code: string; _member_id: string }
        Returns: {
          already_claimed: boolean
          full_name: string
          position: Database["public"]["Enums"]["member_position"]
          team_name: string | null
        }[]
      }
      my_member_id: { Args: never; Returns: string }
      my_team_id: { Args: never; Returns: string }
      review_assignment: {
        Args: { _approve: boolean; _assignment_id: string; _comment?: string }
        Returns: undefined
      }
      revoke_staff: { Args: { _user_id: string }; Returns: undefined }
      set_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _team_id?: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "vp" | "team_leader" | "manager"
      assignment_status:
        | "sent"
        | "accepted"
        | "done"
        | "help_needed"
        | "overdue"
        | "not_delivered"
        | "submitted"
      member_position: "vp" | "team_leader" | "manager" | "member"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["vp", "team_leader", "manager"],
      assignment_status: [
        "sent",
        "accepted",
        "done",
        "help_needed",
        "overdue",
        "not_delivered",
        "submitted",
      ],
      member_position: ["vp", "team_leader", "manager", "member"],
    },
  },
} as const
