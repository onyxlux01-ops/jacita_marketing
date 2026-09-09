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
      advertising_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          error_message: string | null
          external_ids: Json
          id: string
          meta_ad_account_id: string | null
          organisation_id: string
          payload: Json
          proposed_by: string
          proposed_by_user_id: string | null
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          external_ids?: Json
          id?: string
          meta_ad_account_id?: string | null
          organisation_id: string
          payload?: Json
          proposed_by?: string
          proposed_by_user_id?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          external_ids?: Json
          id?: string
          meta_ad_account_id?: string | null
          organisation_id?: string
          payload?: Json
          proposed_by?: string
          proposed_by_user_id?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertising_actions_meta_ad_account_id_fkey"
            columns: ["meta_ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertising_actions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      advertising_settings: {
        Row: {
          created_at: string
          daily_spend_limit_cents: number
          emergency_stopped: boolean
          max_active_campaigns: number
          metadata: Json
          mode: string
          organisation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_spend_limit_cents?: number
          emergency_stopped?: boolean
          max_active_campaigns?: number
          metadata?: Json
          mode?: string
          organisation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_spend_limit_cents?: number
          emergency_stopped?: boolean
          max_active_campaigns?: number
          metadata?: Json
          mode?: string
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertising_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generations: {
        Row: {
          created_at: string
          error_message: string | null
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          id: string
          input_context: Json
          model: string | null
          organisation_id: string
          output_payload: Json | null
          request_text: string | null
          status: Database["public"]["Enums"]["ai_generation_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          id?: string
          input_context?: Json
          model?: string | null
          organisation_id: string
          output_payload?: Json | null
          request_text?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          generation_type?: Database["public"]["Enums"]["ai_generation_type"]
          id?: string
          input_context?: Json
          model?: string | null
          organisation_id?: string
          output_payload?: Json | null
          request_text?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          action_href: string | null
          action_label: string | null
          analysis_run_id: string | null
          based_on: Json
          confidence: string
          created_at: string
          created_by: string | null
          evidence: string | null
          explanation: string | null
          goal_key: Database["public"]["Enums"]["marketing_goal_key"] | null
          id: string
          insight_text: string
          insight_type: string
          is_active: boolean
          organisation_id: string
          period_end: string | null
          period_start: string | null
          priority: string | null
          related_campaign_id: string | null
          related_content_id: string | null
          related_product_service_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          action_href?: string | null
          action_label?: string | null
          analysis_run_id?: string | null
          based_on?: Json
          confidence?: string
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          explanation?: string | null
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          insight_text: string
          insight_type?: string
          is_active?: boolean
          organisation_id: string
          period_end?: string | null
          period_start?: string | null
          priority?: string | null
          related_campaign_id?: string | null
          related_content_id?: string | null
          related_product_service_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          action_href?: string | null
          action_label?: string | null
          analysis_run_id?: string | null
          based_on?: Json
          confidence?: string
          created_at?: string
          created_by?: string | null
          evidence?: string | null
          explanation?: string | null
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          insight_text?: string
          insight_type?: string
          is_active?: boolean
          organisation_id?: string
          period_end?: string | null
          period_start?: string | null
          priority?: string | null
          related_campaign_id?: string | null
          related_content_id?: string | null
          related_product_service_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "marketing_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_related_campaign_id_fkey"
            columns: ["related_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_related_content_id_fkey"
            columns: ["related_content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_related_product_service_id_fkey"
            columns: ["related_product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_metrics: {
        Row: {
          bookings: number
          campaign_id: string | null
          comments: number
          content_id: string | null
          content_type: string | null
          created_at: string
          enquiries: number | null
          followers_gained: number | null
          followers_lost: number | null
          id: string
          impressions: number
          likes: number
          link_clicks: number
          metric_date: string
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          product_service_id: string | null
          profile_visits: number
          reach: number
          revenue_attributed: number
          saves: number
          shares: number
          source: string
          updated_at: string
          video_views: number | null
          watch_time_seconds: number | null
        }
        Insert: {
          bookings?: number
          campaign_id?: string | null
          comments?: number
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          enquiries?: number | null
          followers_gained?: number | null
          followers_lost?: number | null
          id?: string
          impressions?: number
          likes?: number
          link_clicks?: number
          metric_date: string
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          product_service_id?: string | null
          profile_visits?: number
          reach?: number
          revenue_attributed?: number
          saves?: number
          shares?: number
          source?: string
          updated_at?: string
          video_views?: number | null
          watch_time_seconds?: number | null
        }
        Update: {
          bookings?: number
          campaign_id?: string | null
          comments?: number
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          enquiries?: number | null
          followers_gained?: number | null
          followers_lost?: number | null
          id?: string
          impressions?: number
          likes?: number
          link_clicks?: number
          metric_date?: string
          organisation_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          product_service_id?: string | null
          profile_visits?: number
          reach?: number
          revenue_attributed?: number
          saves?: number
          shares?: number
          source?: string
          updated_at?: string
          video_views?: number | null
          watch_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_metrics_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_metrics_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_metrics_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_profiles: {
        Row: {
          additional_notes: string | null
          age_range: string | null
          created_at: string
          customer_types: string[]
          ideal_customer_description: string | null
          income_lifestyle: string | null
          interests: string[]
          location_focus: string | null
          organisation_id: string
          updated_at: string
        }
        Insert: {
          additional_notes?: string | null
          age_range?: string | null
          created_at?: string
          customer_types?: string[]
          ideal_customer_description?: string | null
          income_lifestyle?: string | null
          interests?: string[]
          location_focus?: string | null
          organisation_id: string
          updated_at?: string
        }
        Update: {
          additional_notes?: string | null
          age_range?: string | null
          created_at?: string
          customer_types?: string[]
          ideal_customer_description?: string | null
          income_lifestyle?: string | null
          interests?: string[]
          location_focus?: string | null
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organisation_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organisation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organisation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json
          organisation_id: string
          run_id: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json
          organisation_id: string
          run_id?: string | null
          severity?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json
          organisation_id?: string
          run_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_activity_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_activity_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          actions_taken: number
          completed_at: string | null
          created_at: string
          errors: Json
          id: string
          metadata: Json
          organisation_id: string
          started_at: string
          status: string
          summary: string | null
          trigger: string
        }
        Insert: {
          actions_taken?: number
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metadata?: Json
          organisation_id: string
          started_at?: string
          status?: string
          summary?: string | null
          trigger?: string
        }
        Update: {
          actions_taken?: number
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metadata?: Json
          organisation_id?: string
          started_at?: string
          status?: string
          summary?: string | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          ai_freedom_level: string
          content_preferences: string[]
          created_at: string
          current_state: string
          enabled: boolean
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          latest_decision: Json
          max_auto_publishes_per_day: number
          mode: string
          next_planned_action: string | null
          organisation_id: string
          paused: boolean
          pipeline_horizon_days: number
          platforms: string[]
          posts_per_week: number
          primary_goals: string[]
          quiet_hours: Json
          reels_per_week: number
          setup_completed_at: string | null
          state_message: string | null
          stories_per_week: number
          updated_at: string
        }
        Insert: {
          ai_freedom_level?: string
          content_preferences?: string[]
          created_at?: string
          current_state?: string
          enabled?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          latest_decision?: Json
          max_auto_publishes_per_day?: number
          mode?: string
          next_planned_action?: string | null
          organisation_id: string
          paused?: boolean
          pipeline_horizon_days?: number
          platforms?: string[]
          posts_per_week?: number
          primary_goals?: string[]
          quiet_hours?: Json
          reels_per_week?: number
          setup_completed_at?: string | null
          state_message?: string | null
          stories_per_week?: number
          updated_at?: string
        }
        Update: {
          ai_freedom_level?: string
          content_preferences?: string[]
          created_at?: string
          current_state?: string
          enabled?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          latest_decision?: Json
          max_auto_publishes_per_day?: number
          mode?: string
          next_planned_action?: string | null
          organisation_id?: string
          paused?: boolean
          pipeline_horizon_days?: number
          platforms?: string[]
          posts_per_week?: number
          primary_goals?: string[]
          quiet_hours?: Json
          reels_per_week?: number
          setup_completed_at?: string | null
          state_message?: string | null
          stories_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_tasks: {
        Row: {
          completed_at: string | null
          content_id: string | null
          created_at: string
          decision: Json
          error_message: string | null
          id: string
          organisation_id: string
          result: Json
          run_id: string | null
          started_at: string | null
          status: string
          task_type: string
        }
        Insert: {
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          decision?: Json
          error_message?: string | null
          id?: string
          organisation_id: string
          result?: Json
          run_id?: string | null
          started_at?: string | null
          status?: string
          task_type: string
        }
        Update: {
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          decision?: Json
          error_message?: string | null
          id?: string
          organisation_id?: string
          result?: Json
          run_id?: string | null
          started_at?: string | null
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_tasks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          brand_voice: string | null
          business_description: string | null
          created_at: string
          custom_instructions: string | null
          id: string
          logo_path: string | null
          marketing_objectives: string | null
          organisation_id: string
          preferred_terminology: string | null
          primary_color: string | null
          secondary_color: string | null
          target_audience: string | null
          tone: string | null
          typography_preferences: Json | null
          updated_at: string
          words_to_avoid: string | null
        }
        Insert: {
          brand_voice?: string | null
          business_description?: string | null
          created_at?: string
          custom_instructions?: string | null
          id?: string
          logo_path?: string | null
          marketing_objectives?: string | null
          organisation_id: string
          preferred_terminology?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          tone?: string | null
          typography_preferences?: Json | null
          updated_at?: string
          words_to_avoid?: string | null
        }
        Update: {
          brand_voice?: string | null
          business_description?: string | null
          created_at?: string
          custom_instructions?: string | null
          id?: string
          logo_path?: string | null
          marketing_objectives?: string | null
          organisation_id?: string
          preferred_terminology?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          target_audience?: string | null
          tone?: string | null
          typography_preferences?: Json | null
          updated_at?: string
          words_to_avoid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_products_services: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          product_service_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          product_service_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          product_service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_services_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_services_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget: number | null
          content_themes: Json | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          key_message: string | null
          marketing_goal_id: string | null
          marketing_strategy_id: string | null
          name: string
          objective: string | null
          organisation_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          content_themes?: Json | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          key_message?: string | null
          marketing_goal_id?: string | null
          marketing_strategy_id?: string | null
          name: string
          objective?: string | null
          organisation_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          content_themes?: Json | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          key_message?: string | null
          marketing_goal_id?: string | null
          marketing_strategy_id?: string | null
          name?: string
          objective?: string | null
          organisation_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_marketing_goal_id_fkey"
            columns: ["marketing_goal_id"]
            isOneToOne: false
            referencedRelation: "marketing_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_marketing_strategy_id_fkey"
            columns: ["marketing_strategy_id"]
            isOneToOne: false
            referencedRelation: "marketing_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          alt_text: string | null
          call_to_action: string | null
          campaign_id: string | null
          caption: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          generation_payload: Json | null
          hashtags: string[]
          hook: string | null
          id: string
          idea: string | null
          marketing_goal_id: string | null
          marketing_objective: string | null
          marketing_strategy_id: string | null
          media_asset_id: string | null
          on_screen_text: string | null
          organisation_id: string
          parent_content_id: string | null
          posting_recommendation: string | null
          product_service_id: string | null
          published_at: string | null
          quality_flags: Json
          quality_score: number | null
          scheduled_at: string | null
          series_id: string | null
          status: Database["public"]["Enums"]["content_status"]
          suggested_posting_time: string | null
          title: string | null
          tone: string | null
          updated_at: string
          video_concept: string | null
          voiceover_script: string | null
        }
        Insert: {
          alt_text?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          generation_payload?: Json | null
          hashtags?: string[]
          hook?: string | null
          id?: string
          idea?: string | null
          marketing_goal_id?: string | null
          marketing_objective?: string | null
          marketing_strategy_id?: string | null
          media_asset_id?: string | null
          on_screen_text?: string | null
          organisation_id: string
          parent_content_id?: string | null
          posting_recommendation?: string | null
          product_service_id?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          suggested_posting_time?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          video_concept?: string | null
          voiceover_script?: string | null
        }
        Update: {
          alt_text?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          generation_payload?: Json | null
          hashtags?: string[]
          hook?: string | null
          id?: string
          idea?: string | null
          marketing_goal_id?: string | null
          marketing_objective?: string | null
          marketing_strategy_id?: string | null
          media_asset_id?: string | null
          on_screen_text?: string | null
          organisation_id?: string
          parent_content_id?: string | null
          posting_recommendation?: string | null
          product_service_id?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          suggested_posting_time?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          video_concept?: string | null
          voiceover_script?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_marketing_goal_id_fkey"
            columns: ["marketing_goal_id"]
            isOneToOne: false
            referencedRelation: "marketing_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_marketing_strategy_id_fkey"
            columns: ["marketing_strategy_id"]
            isOneToOne: false
            referencedRelation: "marketing_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_parent_content_id_fkey"
            columns: ["parent_content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "content_series"
            referencedColumns: ["id"]
          },
        ]
      }
      content_events: {
        Row: {
          actor_id: string | null
          content_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organisation_id: string
          summary: string | null
        }
        Insert: {
          actor_id?: string | null
          content_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organisation_id: string
          summary?: string | null
        }
        Update: {
          actor_id?: string | null
          content_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organisation_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_platforms: {
        Row: {
          attempt_count: number
          caption_override: string | null
          content_id: string
          created_at: string
          cta_override: string | null
          error_message: string | null
          external_post_id: string | null
          hashtags_override: string[] | null
          hook_override: string | null
          id: string
          last_publish_at: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          publish_status: Database["public"]["Enums"]["platform_publish_status"]
          published_at: string | null
          scheduled_at: string | null
          social_account_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          caption_override?: string | null
          content_id: string
          created_at?: string
          cta_override?: string | null
          error_message?: string | null
          external_post_id?: string | null
          hashtags_override?: string[] | null
          hook_override?: string | null
          id?: string
          last_publish_at?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          publish_status?: Database["public"]["Enums"]["platform_publish_status"]
          published_at?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          caption_override?: string | null
          content_id?: string
          created_at?: string
          cta_override?: string | null
          error_message?: string | null
          external_post_id?: string | null
          hashtags_override?: string[] | null
          hook_override?: string | null
          id?: string
          last_publish_at?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          publish_status?: Database["public"]["Enums"]["platform_publish_status"]
          published_at?: string | null
          scheduled_at?: string | null
          social_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_platforms_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_platforms_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_series: {
        Row: {
          content_rules: string | null
          created_at: string
          created_by: string | null
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          organisation_id: string
          preferred_platform:
            | Database["public"]["Enums"]["social_platform"]
            | null
          updated_at: string
        }
        Insert: {
          content_rules?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          organisation_id: string
          preferred_platform?:
            | Database["public"]["Enums"]["social_platform"]
            | null
          updated_at?: string
        }
        Update: {
          content_rules?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          organisation_id?: string
          preferred_platform?:
            | Database["public"]["Enums"]["social_platform"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_series_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tags: {
        Row: {
          content_id: string
          created_at: string
          id: string
          tag: string
          updated_at: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          tag: string
          updated_at?: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tags_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_analysis_runs: {
        Row: {
          confidence: string
          created_at: string
          created_by: string | null
          data_snapshot: Json
          goal_key: Database["public"]["Enums"]["marketing_goal_key"] | null
          health_score: number | null
          id: string
          model: string | null
          organisation_id: string
          period_end: string
          period_start: string
          run_type: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          created_by?: string | null
          data_snapshot?: Json
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          health_score?: number | null
          id?: string
          model?: string | null
          organisation_id: string
          period_end: string
          period_start: string
          run_type: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string
          created_at?: string
          created_by?: string | null
          data_snapshot?: Json
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          health_score?: number | null
          id?: string
          model?: string | null
          organisation_id?: string
          period_end?: string
          period_start?: string
          run_type?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_analysis_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_analysis_runs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_goals: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          goal_key: Database["public"]["Enums"]["marketing_goal_key"]
          id: string
          organisation_id: string
          product_service_id: string | null
          status: string
          target_metric: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_key: Database["public"]["Enums"]["marketing_goal_key"]
          id?: string
          organisation_id: string
          product_service_id?: string | null
          status?: string
          target_metric?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"]
          id?: string
          organisation_id?: string
          product_service_id?: string | null
          status?: string
          target_metric?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_goals_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_goals_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_health_scores: {
        Row: {
          analysis_run_id: string | null
          components: Json
          created_at: string
          delta: number | null
          explanation: string | null
          goal_key: Database["public"]["Enums"]["marketing_goal_key"] | null
          id: string
          main_improvement: string | null
          main_opportunity: string | null
          organisation_id: string
          period_end: string
          period_start: string
          previous_score: number | null
          score: number
          updated_at: string
        }
        Insert: {
          analysis_run_id?: string | null
          components?: Json
          created_at?: string
          delta?: number | null
          explanation?: string | null
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          main_improvement?: string | null
          main_opportunity?: string | null
          organisation_id: string
          period_end: string
          period_start: string
          previous_score?: number | null
          score: number
          updated_at?: string
        }
        Update: {
          analysis_run_id?: string | null
          components?: Json
          created_at?: string
          delta?: number | null
          explanation?: string | null
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          main_improvement?: string | null
          main_opportunity?: string | null
          organisation_id?: string
          period_end?: string
          period_start?: string
          previous_score?: number | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_health_scores_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "marketing_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_health_scores_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_strategies: {
        Row: {
          calls_to_action: Json
          campaign_duration: string | null
          content_mix: Json
          content_themes: Json
          created_at: string
          created_by: string | null
          id: string
          key_message: string | null
          marketing_goal_id: string | null
          organisation_id: string
          posting_frequency: string | null
          primary_objective: string
          recommended_content_types: Json
          recommended_platforms: Json
          services_to_promote: Json
          status: string
          strategy_payload: Json
          target_audience: string | null
          title: string
          updated_at: string
        }
        Insert: {
          calls_to_action?: Json
          campaign_duration?: string | null
          content_mix?: Json
          content_themes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          key_message?: string | null
          marketing_goal_id?: string | null
          organisation_id: string
          posting_frequency?: string | null
          primary_objective: string
          recommended_content_types?: Json
          recommended_platforms?: Json
          services_to_promote?: Json
          status?: string
          strategy_payload?: Json
          target_audience?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          calls_to_action?: Json
          campaign_duration?: string | null
          content_mix?: Json
          content_themes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          key_message?: string | null
          marketing_goal_id?: string | null
          organisation_id?: string
          posting_frequency?: string | null
          primary_objective?: string
          recommended_content_types?: Json
          recommended_platforms?: Json
          services_to_promote?: Json
          status?: string
          strategy_payload?: Json
          target_audience?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_strategies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_strategies_marketing_goal_id_fkey"
            columns: ["marketing_goal_id"]
            isOneToOne: false
            referencedRelation: "marketing_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_strategies_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_weekly_reviews: {
        Row: {
          analysis_run_id: string | null
          confidence: string
          created_at: string
          created_by: string | null
          data_snapshot: Json
          goal_key: Database["public"]["Enums"]["marketing_goal_key"] | null
          id: string
          organisation_id: string
          recommendations: Json
          updated_at: string
          week_end: string
          week_start: string
          what_didnt: string
          what_happened: string
          what_to_do_next: string
          what_we_learned: string
          what_worked: string
        }
        Insert: {
          analysis_run_id?: string | null
          confidence?: string
          created_at?: string
          created_by?: string | null
          data_snapshot?: Json
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          organisation_id: string
          recommendations?: Json
          updated_at?: string
          week_end: string
          week_start: string
          what_didnt: string
          what_happened: string
          what_to_do_next: string
          what_we_learned: string
          what_worked: string
        }
        Update: {
          analysis_run_id?: string | null
          confidence?: string
          created_at?: string
          created_by?: string | null
          data_snapshot?: Json
          goal_key?: Database["public"]["Enums"]["marketing_goal_key"] | null
          id?: string
          organisation_id?: string
          recommendations?: Json
          updated_at?: string
          week_end?: string
          week_start?: string
          what_didnt?: string
          what_happened?: string
          what_to_do_next?: string
          what_we_learned?: string
          what_worked?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_weekly_reviews_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "marketing_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_weekly_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_weekly_reviews_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          aspect_ratio: string | null
          category: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          file_url: string | null
          height: number | null
          id: string
          is_active: boolean
          is_favourite: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          organisation_id: string
          quality_notes: string | null
          storage_path: string
          tags: string[]
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string | null
          usage_count: number
          width: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          file_url?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          is_favourite?: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          organisation_id: string
          quality_notes?: string | null
          storage_path: string
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          usage_count?: number
          width?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          file_url?: string | null
          height?: number | null
          id?: string
          is_active?: boolean
          is_favourite?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          organisation_id?: string
          quality_notes?: string | null
          storage_path?: string
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          usage_count?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_status: string | null
          connected_at: string | null
          created_at: string
          currency: string | null
          disconnected_at: string | null
          external_ad_account_id: string
          id: string
          last_error: string | null
          metadata: Json
          name: string | null
          organisation_id: string
          status: string
          timezone_name: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string | null
          connected_at?: string | null
          created_at?: string
          currency?: string | null
          disconnected_at?: string | null
          external_ad_account_id: string
          id?: string
          last_error?: string | null
          metadata?: Json
          name?: string | null
          organisation_id: string
          status?: string
          timezone_name?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string | null
          connected_at?: string | null
          created_at?: string
          currency?: string | null
          disconnected_at?: string | null
          external_ad_account_id?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          name?: string | null
          organisation_id?: string
          status?: string
          timezone_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_campaigns: {
        Row: {
          created_at: string
          daily_budget_cents: number | null
          effective_status: string | null
          external_campaign_id: string
          id: string
          last_synced_at: string | null
          lifetime_budget_cents: number | null
          meta_ad_account_id: string
          metadata: Json
          name: string | null
          objective: string | null
          organisation_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_budget_cents?: number | null
          effective_status?: string | null
          external_campaign_id: string
          id?: string
          last_synced_at?: string | null
          lifetime_budget_cents?: number | null
          meta_ad_account_id: string
          metadata?: Json
          name?: string | null
          objective?: string | null
          organisation_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_budget_cents?: number | null
          effective_status?: string | null
          external_campaign_id?: string
          id?: string
          last_synced_at?: string | null
          lifetime_budget_cents?: number | null
          meta_ad_account_id?: string
          metadata?: Json
          name?: string | null
          objective?: string | null
          organisation_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_campaigns_meta_ad_account_id_fkey"
            columns: ["meta_ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          organisation_id: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          organisation_id?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          organisation_id?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organisation_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organisation_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_invites_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          autopilot_mode: Database["public"]["Enums"]["autopilot_mode"]
          booking_url: string | null
          business_category: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          email: string | null
          id: string
          location: string | null
          logo_path: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_skipped: Json
          onboarding_step: string
          opening_hours: Json | null
          phone: string | null
          plan: string
          primary_marketing_goal_key:
            | Database["public"]["Enums"]["marketing_goal_key"]
            | null
          slug: string
          status: Database["public"]["Enums"]["organisation_status"]
          subscription_status: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          autopilot_mode?: Database["public"]["Enums"]["autopilot_mode"]
          booking_url?: string | null
          business_category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          location?: string | null
          logo_path?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_skipped?: Json
          onboarding_step?: string
          opening_hours?: Json | null
          phone?: string | null
          plan?: string
          primary_marketing_goal_key?:
            | Database["public"]["Enums"]["marketing_goal_key"]
            | null
          slug: string
          status?: Database["public"]["Enums"]["organisation_status"]
          subscription_status?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          autopilot_mode?: Database["public"]["Enums"]["autopilot_mode"]
          booking_url?: string | null
          business_category?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          location?: string | null
          logo_path?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_skipped?: Json
          onboarding_step?: string
          opening_hours?: Json | null
          phone?: string | null
          plan?: string
          primary_marketing_goal_key?:
            | Database["public"]["Enums"]["marketing_goal_key"]
            | null
          slug?: string
          status?: Database["public"]["Enums"]["organisation_status"]
          subscription_status?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products_services: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          is_featured: boolean
          is_promotion: boolean
          name: string
          organisation_id: string
          price: number | null
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_promotion?: boolean
          name: string
          organisation_id: string
          price?: number | null
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_promotion?: boolean
          name?: string
          organisation_id?: string
          price?: number | null
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_services_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_secrets: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          iv: string
          key_version: number
          organisation_id: string
          social_account_id: string
          updated_at: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          iv: string
          key_version?: number
          organisation_id: string
          social_account_id: string
          updated_at?: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          iv?: string
          key_version?: number
          organisation_id?: string
          social_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_secrets_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_account_secrets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          account_handle: string | null
          account_name: string | null
          connected_at: string | null
          connection_status: Database["public"]["Enums"]["connection_status"]
          created_at: string
          disconnected_at: string | null
          external_account_id: string | null
          health_status: string
          id: string
          last_error: string | null
          metadata: Json
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_image_url: string | null
          scopes: string[]
          token_expires_at: string | null
          token_vault_ref: string | null
          updated_at: string
        }
        Insert: {
          account_handle?: string | null
          account_name?: string | null
          connected_at?: string | null
          connection_status?: Database["public"]["Enums"]["connection_status"]
          created_at?: string
          disconnected_at?: string | null
          external_account_id?: string | null
          health_status?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_image_url?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          token_vault_ref?: string | null
          updated_at?: string
        }
        Update: {
          account_handle?: string | null
          account_name?: string | null
          connected_at?: string | null
          connection_status?: Database["public"]["Enums"]["connection_status"]
          created_at?: string
          disconnected_at?: string | null
          external_account_id?: string | null
          health_status?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          organisation_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          profile_image_url?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          token_vault_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_oauth_states: {
        Row: {
          code_verifier: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          metadata: Json
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          redirect_path: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          metadata?: Json
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          redirect_path?: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          organisation_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          redirect_path?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_oauth_states_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_publish_jobs: {
        Row: {
          attempt_count: number
          content_id: string
          content_platform_id: string | null
          content_version_hash: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          error_type: string | null
          external_post_id: string | null
          external_url: string | null
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          lock_token: string | null
          locked_at: string | null
          max_attempts: number
          missed_policy: string | null
          next_retry_at: string | null
          organisation_id: string
          payload_snapshot: Json
          platform: Database["public"]["Enums"]["social_platform"]
          published_at: string | null
          scheduled_at: string
          simulated: boolean
          social_account_id: string
          status: Database["public"]["Enums"]["publish_job_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          content_id: string
          content_platform_id?: string | null
          content_version_hash?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          missed_policy?: string | null
          next_retry_at?: string | null
          organisation_id: string
          payload_snapshot?: Json
          platform: Database["public"]["Enums"]["social_platform"]
          published_at?: string | null
          scheduled_at: string
          simulated?: boolean
          social_account_id: string
          status?: Database["public"]["Enums"]["publish_job_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          content_id?: string
          content_platform_id?: string | null
          content_version_hash?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          lock_token?: string | null
          locked_at?: string | null
          max_attempts?: number
          missed_policy?: string | null
          next_retry_at?: string | null
          organisation_id?: string
          payload_snapshot?: Json
          platform?: Database["public"]["Enums"]["social_platform"]
          published_at?: string | null
          scheduled_at?: string
          simulated?: boolean
          social_account_id?: string
          status?: Database["public"]["Enums"]["publish_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_jobs_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_jobs_content_platform_id_fkey"
            columns: ["content_platform_id"]
            isOneToOne: false
            referencedRelation: "content_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_jobs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_jobs_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_publish_logs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          content_id: string | null
          content_platform_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          error_type: string | null
          external_post_id: string | null
          id: string
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          publish_job_id: string | null
          request_summary: Json
          response_summary: Json
          social_account_id: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          content_id?: string | null
          content_platform_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_type?: string | null
          external_post_id?: string | null
          id?: string
          organisation_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          publish_job_id?: string | null
          request_summary?: Json
          response_summary?: Json
          social_account_id?: string | null
          started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          content_id?: string | null
          content_platform_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_type?: string | null
          external_post_id?: string | null
          id?: string
          organisation_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          publish_job_id?: string | null
          request_summary?: Json
          response_summary?: Json
          social_account_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_logs_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_logs_content_platform_id_fkey"
            columns: ["content_platform_id"]
            isOneToOne: false
            referencedRelation: "content_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_logs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_logs_publish_job_id_fkey"
            columns: ["publish_job_id"]
            isOneToOne: false
            referencedRelation: "social_publish_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_logs_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organisation: {
        Args: {
          p_booking_url?: string
          p_business_category?: string
          p_description?: string
          p_email?: string
          p_location?: string
          p_name: string
          p_opening_hours?: Json
          p_phone?: string
          p_slug: string
          p_website?: string
        }
        Returns: string
      }
    }
    Enums: {
      ai_generation_status: "success" | "fallback" | "failed"
      ai_generation_type:
        | "assistant"
        | "strategy"
        | "content"
        | "weekly_plan"
        | "campaign"
        | "media_recommend"
        | "insights"
        | "validation"
      autopilot_mode: "manual" | "approval_required" | "autopilot"
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      connection_status: "connected" | "not_connected" | "expired" | "error"
      content_status:
        | "draft"
        | "review"
        | "approved"
        | "scheduled"
        | "published"
        | "failed"
        | "publishing"
      marketing_goal_key:
        | "increase_bookings"
        | "promote_service"
        | "increase_followers"
        | "increase_engagement"
        | "increase_brand_awareness"
        | "promote_new_service"
        | "fill_quiet_periods"
        | "promote_seasonal_offer"
        | "increase_website_traffic"
        | "increase_enquiries"
        | "increase_repeat_customers"
      media_type: "image" | "video"
      org_role: "owner" | "manager" | "staff"
      organisation_status: "active" | "disabled" | "trial"
      platform_publish_status:
        | "draft"
        | "approved"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
      publish_job_status:
        | "pending"
        | "processing"
        | "published"
        | "failed"
        | "cancelled"
        | "retrying"
        | "expired"
        | "ready"
      social_platform: "instagram" | "facebook" | "tiktok"
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
      ai_generation_status: ["success", "fallback", "failed"],
      ai_generation_type: [
        "assistant",
        "strategy",
        "content",
        "weekly_plan",
        "campaign",
        "media_recommend",
        "insights",
        "validation",
      ],
      autopilot_mode: ["manual", "approval_required", "autopilot"],
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      connection_status: ["connected", "not_connected", "expired", "error"],
      content_status: [
        "draft",
        "review",
        "approved",
        "scheduled",
        "published",
        "failed",
        "publishing",
      ],
      marketing_goal_key: [
        "increase_bookings",
        "promote_service",
        "increase_followers",
        "increase_engagement",
        "increase_brand_awareness",
        "promote_new_service",
        "fill_quiet_periods",
        "promote_seasonal_offer",
        "increase_website_traffic",
        "increase_enquiries",
        "increase_repeat_customers",
      ],
      media_type: ["image", "video"],
      org_role: ["owner", "manager", "staff"],
      organisation_status: ["active", "disabled", "trial"],
      platform_publish_status: [
        "draft",
        "approved",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "cancelled",
      ],
      publish_job_status: [
        "pending",
        "processing",
        "published",
        "failed",
        "cancelled",
        "retrying",
        "expired",
        "ready",
      ],
      social_platform: ["instagram", "facebook", "tiktok"],
    },
  },
} as const

export type Organisation = Tables<"organisations">
export type OrganisationMember = Tables<"organisation_members">
export type OrgRole = Enums<"org_role">
export type ContentStatus = Enums<"content_status">
export type SocialPlatform = Enums<"social_platform">
export type CampaignStatus = Enums<"campaign_status">
export type ConnectionStatus = Enums<"connection_status">
export type MediaType = Enums<"media_type">
export type OrganisationStatus = Enums<"organisation_status">
export type AutopilotMode = Enums<"autopilot_mode">
