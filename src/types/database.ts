// Tipos escritos a mano a partir de supabase/migrations/20261116000000_init.sql.
// Puedes regenerarlos con: npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type PlanTier = "entry" | "medium" | "high";
export type ProjectType = "photo_session" | "monthly_content";
export type ProjectStatus = "draft" | "published" | "archived";
export type AssetKind = "photo" | "video" | "copy";
export type UploadStatus = "pending" | "complete";

export type CreatorRow = {
  id: string;
  user_id: string;
  business_name: string;
  plan: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  portal_access_until: string | null;
  storage_limit_bytes: number;
  client_limit: number | null;
  created_at: string;
  updated_at: string;
}

export type ClientRow = {
  id: string;
  creator_id: string;
  user_id: string | null;
  name: string;
  email: string;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export type ProjectRow = {
  id: string;
  creator_id: string;
  client_id: string | null; // NULL hasta agregar un cliente al proyecto
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export type AssetRow = {
  id: string;
  project_id: string;
  creator_id: string;
  kind: AssetKind;
  r2_key: string | null;
  r2_upload_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  copy_text: string | null;
  upload_status: UploadStatus;
  position: number;
  created_at: string;
  completed_at: string | null;
}

export type StripeEventRow = {
  id: string;
  type: string;
  received_at: string;
  processed_at: string | null;
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      creators: {
        Row: CreatorRow;
        Insert: Optional<
          CreatorRow,
          | "id"
          | "plan"
          | "stripe_customer_id"
          | "stripe_subscription_id"
          | "subscription_status"
          | "trial_ends_at"
          | "portal_access_until"
          | "storage_limit_bytes"
          | "client_limit"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<CreatorRow>;
        Relationships: [];
      };
      clients: {
        Row: ClientRow;
        Insert: Optional<ClientRow, "id" | "user_id" | "invited_at" | "accepted_at" | "created_at">;
        Update: Partial<ClientRow>;
        Relationships: [
          {
            foreignKeyName: "clients_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creators";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: ProjectRow;
        Insert: Optional<ProjectRow, "id" | "client_id" | "status" | "created_at" | "updated_at">;
        Update: Partial<ProjectRow>;
        Relationships: [
          {
            foreignKeyName: "projects_client_fk";
            columns: ["creator_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["creator_id", "id"];
          },
        ];
      };
      assets: {
        Row: AssetRow;
        Insert: Optional<
          AssetRow,
          | "id"
          | "r2_key"
          | "r2_upload_id"
          | "file_name"
          | "mime_type"
          | "size_bytes"
          | "copy_text"
          | "upload_status"
          | "position"
          | "created_at"
          | "completed_at"
        >;
        Update: Partial<AssetRow>;
        Relationships: [
          {
            foreignKeyName: "assets_project_fk";
            columns: ["creator_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["creator_id", "id"];
          },
        ];
      };
      stripe_events: {
        Row: StripeEventRow;
        Insert: Optional<StripeEventRow, "received_at" | "processed_at">;
        Update: Partial<StripeEventRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_creator_id: { Args: Record<string, never>; Returns: string | null };
      creator_portal_open: { Args: { p_creator_id: string }; Returns: boolean };
      client_visible_project_ids: { Args: Record<string, never>; Returns: string[] };
      my_creators: {
        Args: Record<string, never>;
        Returns: { id: string; business_name: string }[];
      };
      my_storage_used: { Args: Record<string, never>; Returns: number };
      reserve_asset_upload: {
        Args: {
          p_asset_id: string;
          p_creator_id: string;
          p_project_id: string;
          p_kind: AssetKind;
          p_r2_key: string;
          p_file_name: string;
          p_mime_type: string;
          p_size_bytes: number;
        };
        Returns: AssetRow;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
