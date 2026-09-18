export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      action_items: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          due_label: string | null
          id: string
          meeting_id: string | null
          notes: string | null
          number: number | null
          owner_label: string | null
          sort_order: number
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          due_label?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          number?: number | null
          owner_label?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          due_label?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          number?: number | null
          owner_label?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          category: string
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: number
          link: string | null
          meta: Json
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: never
          link?: string | null
          meta?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: never
          link?: string | null
          meta?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          assignee_id: string | null
          checklist: Json
          comment: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["priority_level"]
          quantity: number | null
          responsibility: string | null
          section: string
          sort_order: number
          status: Database["public"]["Enums"]["deliverable_status"]
          title: string
          updated_at: string
          updated_by: string | null
          workstream_id: string
        }
        Insert: {
          assignee_id?: string | null
          checklist?: Json
          comment?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          quantity?: number | null
          responsibility?: string | null
          section?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["deliverable_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          workstream_id: string
        }
        Update: {
          assignee_id?: string | null
          checklist?: Json
          comment?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          quantity?: number | null
          responsibility?: string | null
          section?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["deliverable_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          html: string | null
          id: string
          provider_id: string | null
          status: string
          subject: string
          template: string
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          html?: string | null
          id?: string
          provider_id?: string | null
          status: string
          subject: string
          template: string
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          html?: string | null
          id?: string
          provider_id?: string | null
          status?: string
          subject?: string
          template?: string
          to_email?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          attendees: Json
          created_at: string
          created_by: string | null
          id: string
          join_url: string | null
          meeting_at: string
          mode: string
          sections: Json
          status: string
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          attendees?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          join_url?: string | null
          meeting_at: string
          mode?: string
          sections?: Json
          status?: string
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          attendees?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          join_url?: string | null
          meeting_at?: string
          mode?: string
          sections?: Json
          status?: string
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          body: string | null
          category: string
          created_at: string
          digest_sent: boolean
          entity_id: string | null
          entity_type: string | null
          id: string
          importance: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          category?: string
          created_at?: string
          digest_sent?: boolean
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          importance?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          category?: string
          created_at?: string
          digest_sent?: boolean
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          importance?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_contacts: {
        Row: {
          category: string
          contact_person: string | null
          created_at: string
          email: string | null
          follow_up_on: string | null
          id: string
          list: string
          name: string
          notes: string | null
          phone: string | null
          sort_order: number
          status: Database["public"]["Enums"]["outreach_status"]
          submitted_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          follow_up_on?: string | null
          id?: string
          list: string
          name: string
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["outreach_status"]
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          follow_up_on?: string | null
          id?: string
          list?: string
          name?: string
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["outreach_status"]
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_questions: {
        Row: {
          created_at: string
          id: string
          panel_id: string
          question: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          panel_id: string
          question: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          panel_id?: string
          question?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "panel_questions_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
        ]
      }
      panelists: {
        Row: {
          artwork_done: boolean
          bio: string | null
          bio_received: boolean
          citation: string | null
          citation_done: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          job_title: string | null
          notes: string | null
          organization: string | null
          panel_id: string
          phone: string | null
          photo_received: boolean
          photo_url: string | null
          sort_order: number
          status: Database["public"]["Enums"]["panelist_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          artwork_done?: boolean
          bio?: string | null
          bio_received?: boolean
          citation?: string | null
          citation_done?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          job_title?: string | null
          notes?: string | null
          organization?: string | null
          panel_id: string
          phone?: string | null
          photo_received?: boolean
          photo_url?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["panelist_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          artwork_done?: boolean
          bio?: string | null
          bio_received?: boolean
          citation?: string | null
          citation_done?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          notes?: string | null
          organization?: string | null
          panel_id?: string
          phone?: string | null
          photo_received?: boolean
          photo_url?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["panelist_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "panelists_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panelists_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          moderator: string | null
          notes: string | null
          number: number
          perspective: string | null
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          moderator?: string | null
          notes?: string | null
          number: number
          perspective?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          moderator?: string | null
          notes?: string | null
          number?: number
          perspective?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          job_title: string | null
          last_seen_at: string | null
          notification_prefs: Json
          organization: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          job_title?: string | null
          last_seen_at?: string | null
          notification_prefs?: Json
          organization?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          job_title?: string | null
          last_seen_at?: string | null
          notification_prefs?: Json
          organization?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_secrets: {
        Row: {
          access_token_enc: string | null
          account_id: string
          extra_enc: string | null
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc?: string | null
          account_id: string
          extra_enc?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string | null
          account_id?: string
          extra_enc?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_secrets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          account_type: string
          avatar_url: string | null
          connected_by: string | null
          created_at: string
          display_name: string
          external_id: string
          id: string
          meta: Json
          profile_url: string | null
          provider: string
          scopes: string[]
          status: string
          status_detail: string | null
          token_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_type?: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name: string
          external_id: string
          id?: string
          meta?: Json
          profile_url?: string | null
          provider: string
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string
          external_id?: string
          id?: string
          meta?: Json
          profile_url?: string | null
          provider?: string
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_apps: {
        Row: {
          client_id: string | null
          client_secret_enc: string | null
          extra: Json
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret_enc?: string | null
          extra?: Json
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret_enc?: string | null
          extra?: Json
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_apps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_hashtag_groups: {
        Row: {
          created_at: string
          created_by: string | null
          hashtags: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hashtags: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hashtags?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_hashtag_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media: {
        Row: {
          alt_text: string | null
          bucket: string
          created_at: string
          duration_seconds: number | null
          file_name: string
          height: number | null
          id: string
          jpeg_path: string | null
          jpeg_url: string | null
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket?: string
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          height?: number | null
          id?: string
          jpeg_path?: string | null
          jpeg_url?: string | null
          mime_type: string
          path: string
          size_bytes?: number
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          height?: number | null
          id?: string
          jpeg_path?: string | null
          jpeg_url?: string | null
          mime_type?: string
          path?: string
          size_bytes?: number
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_targets: {
        Row: {
          account_id: string
          attempts: number
          content_override: string | null
          error: string | null
          external_id: string | null
          external_url: string | null
          id: string
          metrics: Json
          metrics_updated_at: string | null
          options: Json
          post_id: string
          published_at: string | null
          status: string
        }
        Insert: {
          account_id: string
          attempts?: number
          content_override?: string | null
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          metrics?: Json
          metrics_updated_at?: string | null
          options?: Json
          post_id: string
          published_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          attempts?: number
          content_override?: string | null
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          metrics?: Json
          metrics_updated_at?: string | null
          options?: Json
          post_id?: string
          published_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_targets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          author_id: string | null
          campaign: string | null
          content: string
          created_at: string
          id: string
          link_url: string | null
          media_ids: string[]
          notes: string | null
          published_at: string | null
          rejection_note: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["social_post_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          author_id?: string | null
          campaign?: string | null
          content?: string
          created_at?: string
          id?: string
          link_url?: string | null
          media_ids?: string[]
          notes?: string | null
          published_at?: string | null
          rejection_note?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          author_id?: string | null
          campaign?: string | null
          content?: string
          created_at?: string
          id?: string
          link_url?: string | null
          media_ids?: string[]
          notes?: string | null
          published_at?: string | null
          rejection_note?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          amount: number | null
          comment: string | null
          contact_person: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          next_action: string | null
          next_action_on: string | null
          organization: string
          owner_id: string | null
          package: string | null
          phone: string | null
          responsibility: string | null
          sort_order: number
          stage: Database["public"]["Enums"]["sponsor_stage"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          next_action?: string | null
          next_action_on?: string | null
          organization: string
          owner_id?: string | null
          package?: string | null
          phone?: string | null
          responsibility?: string | null
          sort_order?: number
          stage?: Database["public"]["Enums"]["sponsor_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          next_action?: string | null
          next_action_on?: string | null
          organization?: string
          owner_id?: string | null
          package?: string | null
          phone?: string | null
          responsibility?: string | null
          sort_order?: number
          stage?: Database["public"]["Enums"]["sponsor_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sales: {
        Row: {
          access_code: string | null
          access_sent_at: string | null
          amount: number
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          channel: string
          country: string
          created_at: string
          currency: string
          id: string
          notes: string | null
          organization: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          quantity: number
          recorded_by: string | null
          reference: string | null
          sold_at: string
          ticket_type_id: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          access_sent_at?: string | null
          amount?: number
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          channel?: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          organization?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          quantity?: number
          recorded_by?: string | null
          reference?: string | null
          sold_at?: string
          ticket_type_id: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          access_sent_at?: string | null
          amount?: number
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          channel?: string
          country?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          organization?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          quantity?: number
          recorded_by?: string | null
          reference?: string | null
          sold_at?: string
          ticket_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sales_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          capacity: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_virtual: boolean
          name: string
          price: number | null
          sort_order: number
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          name: string
          price?: number | null
          sort_order?: number
        }
        Update: {
          capacity?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          name?: string
          price?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      workstreams: {
        Row: {
          color_slot: number
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color_slot?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color_slot?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      bgs_housekeeping: { Args: never; Returns: undefined }
      configure_scheduler: {
        Args: { app_url: string; secret: string }
        Returns: undefined
      }
      disable_scheduler: { Args: never; Returns: undefined }
      has_role: {
        Args: { min_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      role_rank: {
        Args: { r: Database["public"]["Enums"]["user_role"] }
        Returns: number
      }
      scheduler_status: {
        Args: never
        Returns: {
          active: boolean
          available: boolean
          jobname: string
          last_message: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
    }
    Enums: {
      action_status: "open" | "in_progress" | "done"
      deliverable_status:
        | "pending"
        | "in_progress"
        | "in_review"
        | "blocked"
        | "completed"
      outreach_status:
        | "pending"
        | "submitted"
        | "acknowledged"
        | "confirmed"
        | "declined"
      panelist_status: "proposed" | "submitted" | "confirmed" | "declined"
      payment_status: "paid" | "pending" | "complimentary" | "refunded"
      priority_level: "low" | "medium" | "high" | "critical"
      social_post_status:
        | "draft"
        | "pending_approval"
        | "scheduled"
        | "publishing"
        | "published"
        | "partial"
        | "failed"
      sponsor_stage:
        | "prospect"
        | "approached"
        | "proposal_sent"
        | "negotiating"
        | "confirmed"
        | "declined"
      user_role: "super_admin" | "admin" | "manager" | "contributor" | "viewer"
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
      action_status: ["open", "in_progress", "done"],
      deliverable_status: [
        "pending",
        "in_progress",
        "in_review",
        "blocked",
        "completed",
      ],
      outreach_status: [
        "pending",
        "submitted",
        "acknowledged",
        "confirmed",
        "declined",
      ],
      panelist_status: ["proposed", "submitted", "confirmed", "declined"],
      payment_status: ["paid", "pending", "complimentary", "refunded"],
      priority_level: ["low", "medium", "high", "critical"],
      social_post_status: [
        "draft",
        "pending_approval",
        "scheduled",
        "publishing",
        "published",
        "partial",
        "failed",
      ],
      sponsor_stage: [
        "prospect",
        "approached",
        "proposal_sent",
        "negotiating",
        "confirmed",
        "declined",
      ],
      user_role: ["super_admin", "admin", "manager", "contributor", "viewer"],
    },
  },
} as const

