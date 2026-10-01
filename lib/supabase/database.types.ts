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
      cron_heartbeats: {
        Row: {
          last_run_at: string
          name: string
        }
        Insert: {
          last_run_at: string
          name: string
        }
        Update: {
          last_run_at?: string
          name?: string
        }
        Relationships: []
      }
      cron_leases: {
        Row: {
          lease_until: string
          name: string
        }
        Insert: {
          lease_until: string
          name: string
        }
        Update: {
          lease_until?: string
          name?: string
        }
        Relationships: []
      }
      feed_reactions: {
        Row: {
          created_at: string
          event_id: string
          kind: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          kind: string
          profile_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          kind?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          action: string
          created_at: string
          key: string
          profile_id: string
          result: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          key: string
          profile_id: string
          result?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          key?: string
          profile_id?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_comments: {
        Row: {
          attempt_key: string | null
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: number
          market_id: string
          profile_id: string
        }
        Insert: {
          attempt_key?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          market_id: string
          profile_id: string
        }
        Update: {
          attempt_key?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          market_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_comments_profile_id_fkey"
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
          pool_version: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          market_id: string
          pool_total?: number
          pool_version?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          market_id?: string
          pool_total?: number
          pool_version?: number
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
          payout_seed: number
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
          payout_seed?: number
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
          payout_seed?: number
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
          settled_at: string | null
          sparkline: Json | null
          status: string
          title: string
          void_reason: string | null
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
          settled_at?: string | null
          sparkline?: Json | null
          status?: string
          title: string
          void_reason?: string | null
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
          settled_at?: string | null
          sparkline?: Json | null
          status?: string
          title?: string
          void_reason?: string | null
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
      notification_prefs: {
        Row: {
          new_markets: boolean
          profile_id: string
          resolve_reminders: boolean
          results: boolean
          review_alerts: boolean
          task_reviews: boolean
          updated_at: string
        }
        Insert: {
          new_markets?: boolean
          profile_id: string
          resolve_reminders?: boolean
          results?: boolean
          review_alerts?: boolean
          task_reviews?: boolean
          updated_at?: string
        }
        Update: {
          new_markets?: boolean
          profile_id?: string
          resolve_reminders?: boolean
          results?: boolean
          review_alerts?: boolean
          task_reviews?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parlay_legs: {
        Row: {
          id: string
          locked_odds: number | null
          market_id: string
          outcome_id: string
          parlay_id: string
        }
        Insert: {
          id?: string
          locked_odds?: number | null
          market_id: string
          outcome_id: string
          parlay_id: string
        }
        Update: {
          id?: string
          locked_odds?: number | null
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
          max_multiplier: number
          odds_at_close: boolean
          profile_id: string
          settled_at: string | null
          stake: number
          status: string
        }
        Insert: {
          created_at?: string
          credited?: number
          id?: string
          max_multiplier: number
          odds_at_close?: boolean
          profile_id: string
          settled_at?: string | null
          stake: number
          status?: string
        }
        Update: {
          created_at?: string
          credited?: number
          id?: string
          max_multiplier?: number
          odds_at_close?: boolean
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
          expired_at: string | null
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
          expired_at?: string | null
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
          expired_at?: string | null
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
      push_attempts: {
        Row: {
          attempts: number
          first_tried_at: string
          kind: string
          ref: string
        }
        Insert: {
          attempts?: number
          first_tried_at?: string
          kind: string
          ref: string
        }
        Update: {
          attempts?: number
          first_tried_at?: string
          kind?: string
          ref?: string
        }
        Relationships: []
      }
      push_log: {
        Row: {
          kind: string
          ref: string
          sent_at: string
        }
        Insert: {
          kind: string
          ref: string
          sent_at?: string
        }
        Update: {
          kind?: string
          ref?: string
          sent_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          first_failed_at: string | null
          id: string
          last_success_at: string | null
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          first_failed_at?: string | null
          id?: string
          last_success_at?: string | null
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          first_failed_at?: string | null
          id?: string
          last_success_at?: string | null
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          attempt_key: string | null
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
          attempt_key?: string | null
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
          attempt_key?: string | null
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
      write_rate_counters: {
        Row: {
          action: string
          profile_id: string
          window_seconds: number
          window_start: string
          writes: number
        }
        Insert: {
          action: string
          profile_id: string
          window_seconds: number
          window_start: string
          writes: number
        }
        Update: {
          action?: string
          profile_id?: string
          window_seconds?: number
          window_start?: string
          writes?: number
        }
        Relationships: [
          {
            foreignKeyName: "write_rate_counters_profile_id_fkey"
            columns: ["profile_id"]
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
      stakes_riding: {
        Row: {
          amount: number | null
          profile_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_balance: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_profile_id: string
          p_reason: string
        }
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
      avatar_upload_quota_ok: { Args: never; Returns: boolean }
      betting_ledger_types: { Args: never; Returns: string[] }
      can_resolve_market: { Args: { p_market_id: string }; Returns: boolean }
      cancel_bet: { Args: { p_bet_id: number }; Returns: undefined }
      claim_cron_lease: {
        Args: { p_name: string; p_seconds: number }
        Returns: boolean
      }
      claim_idempotency_key: {
        Args: { p_action: string; p_key: string }
        Returns: Json
      }
      claim_push_log: {
        Args: { p_kind: string; p_refs: string[] }
        Returns: number
      }
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
      create_market_v2: {
        Args: {
          p_close_at: string
          p_description: string
          p_idempotency_key?: string
          p_kind: string
          p_line?: number
          p_outcome_labels: string[]
          p_title: string
        }
        Returns: Json
      }
      delete_market: { Args: { p_market_id: string }; Returns: undefined }
      delete_market_comment: {
        Args: { p_comment_id: number }
        Returns: undefined
      }
      delete_task: { Args: { p_task_id: string }; Returns: undefined }
      due_market_alerts: {
        Args: never
        Returns: {
          market_id: string
          profile_id: string
          title: string
        }[]
      }
      due_resolve_reminders: {
        Args: never
        Returns: {
          market_id: string
          profile_id: string
          title: string
        }[]
      }
      economy_flows: {
        Args: { p_from: string; p_to: string }
        Returns: {
          added: number
          removed: number
          source: string
        }[]
      }
      economy_summary: {
        Args: { p_month_start: string }
        Returns: {
          all_time_added: number
          all_time_removed: number
          balances: number
          bets_at_stake: number
          house_parlays_added: number
          house_parlays_removed: number
          month_end: string
          month_start: string
          owner_adjustments_added: number
          owner_adjustments_removed: number
          parlays_at_stake: number
          payout_rounding_added: number
          payout_rounding_removed: number
          seed_payouts_added: number
          seed_payouts_removed: number
          starting_grants_added: number
          task_rewards_added: number
          unclassified: number
        }[]
      }
      expired_proof_attachments: {
        Args: {
          p_limit?: number
          p_resolution_days?: number
          p_task_days?: number
        }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      feed_reaction_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          event_id: string
          kind: string
          mine: boolean
          reactions: number
        }[]
      }
      finish_idempotent: {
        Args: { p_key: string; p_result: Json }
        Returns: undefined
      }
      group_time_zone: { Args: never; Returns: string }
      has_role: { Args: { p_min: string }; Returns: boolean }
      has_stake_in_market: {
        Args: { p_market_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_invited: { Args: never; Returns: boolean }
      is_push_endpoint: { Args: { p_endpoint: string }; Returns: boolean }
      leaderboard_awards: {
        Args: never
        Returns: {
          avatar_path: string
          detail: string
          display_name: string
          kind: string
          profile_id: string
          value: number
        }[]
      }
      leaderboard_month: {
        Args: never
        Returns: {
          avatar_path: string
          display_name: string
          id: string
          rank: number
          score: number
        }[]
      }
      leaderboard_net_worth: {
        Args: never
        Returns: {
          at_stake: number
          avatar_path: string
          balance: number
          display_name: string
          id: string
          rank: number
          score: number
        }[]
      }
      leaderboard_race_steps: {
        Args: { p_top?: number }
        Returns: {
          at: string
          display_name: string
          profile_id: string
          profit: number
          step: number
        }[]
      }
      mark_proof_expired: { Args: { p_ids: string[] }; Returns: number }
      market_sparklines: {
        Args: { p_market_ids: string[]; p_points?: number }
        Returns: {
          market_id: string
          points: Json
        }[]
      }
      market_sparks: {
        Args: { p_market_ids: string[]; p_points?: number }
        Returns: {
          market_id: string
          outcome_ids: string[]
          points: Json
        }[]
      }
      markets_to_resolve: {
        Args: never
        Returns: {
          close_at: string
          id: string
          title: string
          total: number
        }[]
      }
      member_activity: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          joined_at: string
          last_sign_in_at: string
        }[]
      }
      member_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      member_records: {
        Args: { p_ids: string[] }
        Returns: {
          lost: number
          profile_id: string
          won: number
        }[]
      }
      member_standing: {
        Args: { p_profile_id: string }
        Returns: {
          member_count: number
          rank: number
          score: number
        }[]
      }
      member_stats: {
        Args: { p_profile_id: string }
        Returns: {
          best_parlay_multiplier: number
          best_parlay_payout: number
          bets_lost: number
          bets_refunded: number
          bets_won: number
          biggest_win: number
          biggest_win_market_id: string
          biggest_win_market_title: string
          markets_created: number
          net_profit: number
          parlays_lost: number
          parlays_refunded: number
          parlays_won: number
          tasks_completed: number
        }[]
      }
      my_at_stake: {
        Args: never
        Returns: {
          dc: number
          wagers: number
        }[]
      }
      my_current_task_completions: {
        Args: never
        Returns: {
          proof_count: number
          review_note: string
          reward_amount: number
          status: string
          task_id: string
        }[]
      }
      my_onboarding: {
        Args: never
        Returns: {
          bet: boolean
          photo: boolean
          task: boolean
        }[]
      }
      my_review_counts: {
        Args: never
        Returns: {
          markets: number
          tasks: number
        }[]
      }
      my_role: { Args: never; Returns: string }
      my_task_streaks: {
        Args: { p_at?: string }
        Returns: {
          includes_current: boolean
          streak: number
          task_id: string
        }[]
      }
      parlay_leg_odds: {
        Args: { p_parlay_ids: string[] }
        Returns: {
          known: boolean
          odds: number
          outcome_id: string
          parlay_id: string
        }[]
      }
      parlay_limits: {
        Args: never
        Returns: {
          max_leg_odds: number
          max_legs: number
          max_multiplier: number
          max_payout: number
          min_leg_bettors: number
          min_leg_pool: number
        }[]
      }
      parlay_max_payout: { Args: { p_parlay_id: string }; Returns: number }
      period_index: {
        Args: { p_key: string; p_period: string }
        Returns: number
      }
      pick_quote: {
        Args: { p_outcome_id: string; p_profile_id: string }
        Returns: {
          market_id: string
          meets_floor: boolean
          odds: number
          other_bettors: number
          others_on_pick: number
          others_total: number
          own_market: boolean
        }[]
      }
      pick_quotes: {
        Args: { p_outcome_ids: string[] }
        Returns: {
          market_id: string
          meets_floor: boolean
          odds: number
          other_bettors: number
          others_on_pick: number
          others_total: number
          outcome_id: string
          own_market: boolean
        }[]
      }
      ping_closing_alerts: { Args: never; Returns: number }
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
          p_idempotency_key?: string
          p_parlay_outcome_ids: string[]
          p_parlay_stake: number
          p_singles: Json
        }
        Returns: string
      }
      place_slip_v2: {
        Args: {
          p_idempotency_key?: string
          p_parlay_outcome_ids: string[]
          p_parlay_stake: number
          p_singles: Json
        }
        Returns: Json
      }
      pool_payout: {
        Args: {
          p_outcomes?: number
          p_seed?: number
          p_stake: number
          p_total_pool: number
          p_winning_pool: number
        }
        Returns: number
      }
      proof_is_attached: { Args: { p_name: string }; Returns: boolean }
      proof_upload_quota_ok: { Args: never; Returns: boolean }
      push_endpoint_host: { Args: { p_endpoint: string }; Returns: string }
      push_hosts: { Args: never; Returns: string[] }
      push_market_alerts: {
        Args: never
        Returns: {
          market_id: string
          profile_id: string
          title: string
        }[]
      }
      push_market_result: {
        Args: { p_market_id: string }
        Returns: {
          has_solo: boolean
          is_override: boolean
          outcome_label: string
          profile_id: string
          refunded: number
          status: string
          title: string
          won: number
        }[]
      }
      push_new_market: {
        Args: { p_market_id: string }
        Returns: {
          profile_id: string
          title: string
        }[]
      }
      push_resolve_reminders: {
        Args: never
        Returns: {
          market_id: string
          profile_id: string
          title: string
        }[]
      }
      push_task_alerts: {
        Args: { p_completion_id: string }
        Returns: {
          profile_id: string
          submitter_name: string
          task_title: string
        }[]
      }
      push_task_reviews: {
        Args: { p_completion_ids: string[] }
        Returns: {
          completion_id: string
          profile_id: string
          review_note: string
          reward_amount: number
          status: string
          task_title: string
        }[]
      }
      push_wants: {
        Args: { p_kind: string; p_profile_id: string }
        Returns: boolean
      }
      record_cron_heartbeat: { Args: { p_name: string }; Returns: undefined }
      record_proof: {
        Args: {
          p_completion_id: string
          p_items: Json
          p_prefix: string
          p_resolution_id: string
        }
        Returns: number
      }
      record_push_failures: {
        Args: { p_kind: string; p_refs: string[] }
        Returns: number
      }
      record_push_results: {
        Args: { p_delivered: string[]; p_failed: string[] }
        Returns: number
      }
      refund_room: {
        Args: { p_amount: number; p_profile_id: string }
        Returns: number
      }
      reject_task_completion: {
        Args: { p_completion_id: string; p_reason?: string }
        Returns: undefined
      }
      release_cron_lease: { Args: { p_name: string }; Returns: undefined }
      remove_bet: { Args: { p_bet_id: number }; Returns: undefined }
      remove_member: { Args: { p_profile_id: string }; Returns: undefined }
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
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      season_profits: {
        Args: { p_month: string }
        Returns: {
          last_at: string
          profile_id: string
          profit: number
        }[]
      }
      set_member_role: {
        Args: { p_profile_id: string; p_role: string }
        Returns: undefined
      }
      settle_parlay: { Args: { p_parlay_id: string }; Returns: undefined }
      settle_season: { Args: { p_month?: string }; Returns: string }
      storage_usage: {
        Args: never
        Returns: {
          bucket_id: string
          bytes: number
          objects: number
        }[]
      }
      stray_avatar_objects: {
        Args: { p_limit?: number }
        Returns: {
          name: string
        }[]
      }
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
      uninvited_auth_users: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      update_market: {
        Args: { p_description: string; p_market_id: string; p_title: string }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_avatar_path: string; p_bio: string; p_display_name: string }
        Returns: undefined
      }
      void_market: {
        Args: { p_market_id: string; p_reason?: string }
        Returns: undefined
      }
      weekly_recap: {
        Args: { p_week: string }
        Returns: {
          best_bettor_id: string
          best_bettor_name: string
          best_market_id: string
          best_market_title: string
          best_payout: number
          best_stake: number
          closing: Json
          closing_total: number
          my_betting_moves: number
          my_betting_net: number
          my_task_income: number
          top_tasker_count: number
          top_tasker_id: string
          top_tasker_name: string
          upset_chance: number
          upset_market_id: string
          upset_market_title: string
          upset_outcome_label: string
          week_end: string
          week_start: string
        }[]
      }
      write_limits: {
        Args: never
        Returns: {
          action: string
          max_writes: number
          window_seconds: number
        }[]
      }
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

