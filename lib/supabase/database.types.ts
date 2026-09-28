export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string
          amount: number | null
          bet_id: number | null
          hidden_at: string | null
          id: string
          kind: string
          market_id: string | null
          occurred_at: string
          outcome_id: string | null
          parlay_id: string | null
          resolution_id: string | null
          task_completion_id: string | null
        }
        Insert: {
          actor_id: string
          amount?: number | null
          bet_id?: number | null
          hidden_at?: string | null
          id: string
          kind: string
          market_id?: string | null
          occurred_at: string
          outcome_id?: string | null
          parlay_id?: string | null
          resolution_id?: string | null
          task_completion_id?: string | null
        }
        Update: {
          actor_id?: string
          amount?: number | null
          bet_id?: number | null
          hidden_at?: string | null
          id?: string
          kind?: string
          market_id?: string | null
          occurred_at?: string
          outcome_id?: string | null
          parlay_id?: string | null
          resolution_id?: string | null
          task_completion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_parlay_id_fkey"
            columns: ["parlay_id"]
            isOneToOne: false
            referencedRelation: "parlays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "market_resolutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_task_completion_id_fkey"
            columns: ["task_completion_id"]
            isOneToOne: false
            referencedRelation: "task_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          claimed_by: string | null
          created_at: string
          email: string
          invited_by: string | null
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          email: string
          invited_by?: string | null
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          email?: string
          invited_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allowed_emails_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowed_emails_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          amount: number
          created_at: string
          id: number
          market_id: string
          outcome_id: string
          profile_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: never
          market_id: string
          outcome_id: string
          profile_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          market_id?: string
          outcome_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancelled_bets: {
        Row: {
          amount: number
          cancelled_at: string
          id: number
          market_id: string
          outcome_id: string
          placed_at: string
          profile_id: string
        }
        Insert: {
          amount: number
          cancelled_at?: string
          id: number
          market_id: string
          outcome_id: string
          placed_at: string
          profile_id: string
        }
        Update: {
          amount?: number
          cancelled_at?: string
          id?: number
          market_id?: string
          outcome_id?: string
          placed_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancelled_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelled_bets_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelled_bets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          amount: number
          created_at: string
          id: number
          meta: Json
          profile_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: never
          meta?: Json
          profile_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          meta?: Json
          profile_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_edits: {
        Row: {
          edited_at: string
          edited_by: string
          id: number
          market_id: string
          new_description: string | null
          new_title: string
          old_description: string | null
          old_title: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: never
          market_id: string
          new_description?: string | null
          new_title: string
          old_description?: string | null
          old_title: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: never
          market_id?: string
          new_description?: string | null
          new_title?: string
          old_description?: string | null
          old_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_edits_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_outcomes: {
        Row: {
          created_at: string
          id: string
          label: string
          market_id: string
          pool_total: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          market_id: string
          pool_total?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          market_id?: string
          pool_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_resolutions: {
        Row: {
          actual_value: number | null
          id: string
          market_id: string
          note: string | null
          outcome_id: string
          resolved_at: string
          resolved_by: string
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          actual_value?: number | null
          id?: string
          market_id: string
          note?: string | null
          outcome_id: string
          resolved_at?: string
          resolved_by: string
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          actual_value?: number | null
          id?: string
          market_id?: string
          note?: string | null
          outcome_id?: string
          resolved_at?: string
          resolved_by?: string
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_resolutions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_resolutions_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_resolutions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_resolutions_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          close_at: string
          created_at: string
          created_by: string
          current_resolution_id: string | null
          description: string | null
          edited_at: string | null
          id: string
          kind: string
          line: number | null
          seed_per_outcome: number
          status: string
          title: string
        }
        Insert: {
          close_at: string
          created_at?: string
          created_by: string
          current_resolution_id?: string | null
          description?: string | null
          edited_at?: string | null
          id?: string
          kind: string
          line?: number | null
          seed_per_outcome?: number
          status?: string
          title: string
        }
        Update: {
          close_at?: string
          created_at?: string
          created_by?: string
          current_resolution_id?: string | null
          description?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          line?: number | null
          seed_per_outcome?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_current_resolution_id_fkey"
            columns: ["current_resolution_id"]
            isOneToOne: false
            referencedRelation: "market_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      parlay_legs: {
        Row: {
          id: string
          locked_odds: number
          market_id: string
          outcome_id: string
          parlay_id: string
        }
        Insert: {
          id?: string
          locked_odds: number
          market_id: string
          outcome_id: string
          parlay_id: string
        }
        Update: {
          id?: string
          locked_odds?: number
          market_id?: string
          outcome_id?: string
          parlay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parlay_legs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlay_legs_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlay_legs_parlay_id_fkey"
            columns: ["parlay_id"]
            isOneToOne: false
            referencedRelation: "parlays"
            referencedColumns: ["id"]
          },
        ]
      }
      parlays: {
        Row: {
          created_at: string
          credited: number
          id: string
          profile_id: string
          settled_at: string | null
          stake: number
          status: string
        }
        Insert: {
          created_at?: string
          credited?: number
          id?: string
          profile_id: string
          settled_at?: string | null
          stake: number
          status?: string
        }
        Update: {
          created_at?: string
          credited?: number
          id?: string
          profile_id?: string
          settled_at?: string | null
          stake?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "parlays_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          balance: number
          bio: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          role: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          balance?: number
          bio?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          role?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          balance?: number
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      proof_attachments: {
        Row: {
          created_at: string
          created_by: string
          file_name: string | null
          id: string
          kind: string
          resolution_id: string | null
          size_bytes: number | null
          storage_path: string | null
          task_completion_id: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name?: string | null
          id?: string
          kind: string
          resolution_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          task_completion_id?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string | null
          id?: string
          kind?: string
          resolution_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          task_completion_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_attachments_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "market_resolutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_attachments_task_completion_id_fkey"
            columns: ["task_completion_id"]
            isOneToOne: false
            referencedRelation: "task_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          id: string
          note: string | null
          period_key: string
          profile_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_amount: number
          status: string
          submitted_at: string
          task_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          period_key: string
          profile_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount: number
          status?: string
          submitted_at?: string
          task_id: string
        }
        Update: {
          id?: string
          note?: string | null
          period_key?: string
          profile_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount?: number
          status?: string
          submitted_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          is_repeatable: boolean
          period: string | null
          proof_required: boolean
          reward_amount: number
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_repeatable?: boolean
          period?: string | null
          proof_required?: boolean
          reward_amount: number
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_repeatable?: boolean
          period?: string | null
          proof_required?: boolean
          reward_amount?: number
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
        ]
      }
    }
    Views: {
      activity_feed: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          amount: number | null
          id: string | null
          kind: string | null
          leg_count: number | null
          market_id: string | null
          market_title: string | null
          occurred_at: string | null
          outcome_label: string | null
          task_title: string | null
        }
        Relationships: []
      }
      my_wagers: {
        Row: {
          bucket: string | null
          created_at: string | null
          id: string | null
          profile_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_balance: {
        Args: { p_amount: number; p_profile_id: string; p_reason: string }
        Returns: undefined
      }
      apply_coin_transaction: {
        Args: {
          p_amount: number
          p_meta?: Json
          p_profile_id: string
          p_type: string
        }
        Returns: undefined
      }
      approve_task_completion: {
        Args: { p_completion_id: string }
        Returns: undefined
      }
      can_resolve_market: { Args: { p_market_id: string }; Returns: boolean }
      cancel_bet: { Args: { p_bet_id: number }; Returns: undefined }
      compute_period_key: {
        Args: { p_at?: string; p_period: string }
        Returns: string
      }
      create_market: {
        Args: {
          p_close_at: string
          p_description: string
          p_kind: string
          p_line?: number
          p_outcome_labels: string[]
          p_title: string
        }
        Returns: string
      }
      delete_market: { Args: { p_market_id: string }; Returns: undefined }
      delete_task: { Args: { p_task_id: string }; Returns: undefined }
      has_role: { Args: { p_min: string }; Returns: boolean }
      has_stake_in_market: {
        Args: { p_market_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_invited: { Args: never; Returns: boolean }
      market_sparklines: {
        Args: { p_market_ids: string[]; p_points?: number }
        Returns: {
          market_id: string
          points: Json
        }[]
      }
      member_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      my_at_stake: {
        Args: never
        Returns: {
          dc: number
          wagers: number
        }[]
      }
      my_role: { Args: never; Returns: string }
      parlay_limits: {
        Args: never
        Returns: {
          max_legs: number
          max_multiplier: number
        }[]
      }
      place_bet: {
        Args: { p_amount: number; p_market_id: string; p_outcome_id: string }
        Returns: undefined
      }
      place_parlay: {
        Args: { p_outcome_ids: string[]; p_stake: number }
        Returns: string
      }
      place_slip: {
        Args: {
          p_parlay_outcome_ids: string[]
          p_parlay_stake: number
          p_singles: Json
        }
        Returns: string
      }
      record_proof: {
        Args: {
          p_completion_id: string
          p_items: Json
          p_prefix: string
          p_resolution_id: string
        }
        Returns: number
      }
      reject_task_completion: {
        Args: { p_completion_id: string; p_reason?: string }
        Returns: undefined
      }
      remove_bet: { Args: { p_bet_id: number }; Returns: undefined }
      resolve_market: {
        Args: {
          p_attachments?: Json
          p_market_id: string
          p_note: string
          p_outcome_id: string
        }
        Returns: undefined
      }
      resolve_market_core: {
        Args: { p_market_id: string; p_outcome_id: string }
        Returns: undefined
      }
      resolve_over_under: {
        Args: {
          p_actual: number
          p_attachments?: Json
          p_market_id: string
          p_note: string
        }
        Returns: undefined
      }
      review_task_completions: {
        Args: { p_approve: boolean; p_ids: string[]; p_note?: string }
        Returns: {
          error: string
          id: string
          ok: boolean
        }[]
      }
      role_rank: { Args: { p_role: string }; Returns: number }
      set_member_role: {
        Args: { p_profile_id: string; p_role: string }
        Returns: undefined
      }
      settle_parlay: { Args: { p_parlay_id: string }; Returns: undefined }
      stray_proof_objects: {
        Args: { p_limit?: number }
        Returns: {
          name: string
        }[]
      }
      submit_task_completion: {
        Args: { p_attachments?: Json; p_note?: string; p_task_id: string }
        Returns: string
      }
      update_market: {
        Args: { p_description: string; p_market_id: string; p_title: string }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_avatar_path: string; p_bio: string; p_display_name: string }
        Returns: undefined
      }
      void_market: { Args: { p_market_id: string }; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

