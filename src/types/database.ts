// Tipos escritos a mano a partir de supabase/migrations/*.sql.
// Puedes regenerarlos con: npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type PlanTier = "entry" | "medium" | "high";
export type ProjectType = "photo_session" | "monthly_content";
export type ProjectStatus = "draft" | "published" | "archived";
export type AssetKind = "photo" | "video";
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
  /** Cuenta de cobros (Stripe Connect Express) para la tienda de impresiones. */
  stripe_connect_account_id: string | null;
  connect_payouts_enabled: boolean;
  /** Margen por defecto sobre el costo del laboratorio (100 = duplica el costo). */
  store_markup_percent: number;
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
  /** Diseño de la plantilla Galería (ver src/lib/gallery-design.ts). */
  design: Record<string, unknown>;
  /** Enlace público /g/{share_token} (solo galerías). */
  share_enabled: boolean;
  share_token: string | null;
  /** Tienda de impresiones activada en esta galería. */
  store_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Publicación: un copy + 1 archivo (individual) o varios (carrusel, máx. 20). */
export type PostRow = {
  id: string;
  creator_id: string;
  project_id: string;
  caption: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type AssetRow = {
  id: string;
  project_id: string;
  post_id: string | null; // NULL = en la biblioteca del proyecto, sin usar
  creator_id: string;
  kind: AssetKind;
  r2_key: string;
  r2_upload_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  upload_status: UploadStatus;
  position: number;
  created_at: string;
  completed_at: string | null;
}

/** Contacto registrado al entrar a una galería por enlace. */
export type GalleryLeadRow = {
  id: string;
  creator_id: string;
  project_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  marketing_consent: boolean;
  consent_at: string | null;
  visits: number;
  created_at: string;
  last_visit_at: string;
}

export type StripeEventRow = {
  id: string;
  type: string;
  received_at: string;
  processed_at: string | null;
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type PrintProductRow = {
  id: string;
  lab: string;
  product_ref: string;
  product_name: string;
  category_ref: string;
  category_name: string;
  size_id: string;
  size_label: string;
  width_in: number | null;
  height_in: number | null;
  selections: Record<string, unknown>;
  cost_cents: number;
  resolution: number | null;
  description: string | null;
  sort: number;
  active: boolean;
  synced_at: string;
  created_at: string;
}

export type CreatorProductPriceRow = {
  creator_id: string;
  product_id: string;
  markup_percent: number | null;
  enabled: boolean;
  updated_at: string;
}

export type PrintOrderStatus =
  | "pending_payment"
  | "paid"
  | "submitting"
  | "in_production"
  | "shipped"
  | "canceled"
  | "refunded"
  | "failed";

export type ShippingAddress = {
  name: string;
  addr1: string;
  addr2?: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
};

export type TrackingInfo = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipDate: string | null;
};

export type PrintOrderRow = {
  id: string;
  reference: string;
  creator_id: string;
  project_id: string | null;
  buyer_email: string;
  buyer_name: string;
  buyer_user_id: string | null;
  shipping_address: ShippingAddress;
  status: PrintOrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  lab_cost_cents: number;
  platform_fee_percent: number;
  platform_fee_cents: number;
  processing_fee_cents: number;
  creator_earnings_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  lab: string;
  lab_submission_id: string | null;
  lab_confirmation_ids: string[];
  tracking: TrackingInfo[];
  failure_reason: string | null;
  paid_at: string | null;
  submitted_at: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PrintOrderItemRow = {
  id: string;
  order_id: string;
  creator_id: string;
  product_id: string | null;
  asset_id: string | null;
  product_name: string;
  size_label: string;
  file_name: string;
  selections: Record<string, unknown>;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  lab_configured_product_id: string | null;
  created_at: string;
}

export type LabEventRow = {
  id: string;
  lab: string;
  event_type: string;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
}

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
          | "stripe_connect_account_id"
          | "connect_payouts_enabled"
          | "store_markup_percent"
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
        Insert: Optional<
          ProjectRow,
          "id" | "client_id" | "status" | "design" | "share_enabled" | "share_token" | "store_enabled" | "created_at" | "updated_at"
        >;
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
      posts: {
        Row: PostRow;
        Insert: Optional<PostRow, "id" | "caption" | "position" | "created_at" | "updated_at">;
        Update: Partial<PostRow>;
        Relationships: [
          {
            foreignKeyName: "posts_project_fk";
            columns: ["creator_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["creator_id", "id"];
          },
        ];
      };
      assets: {
        Row: AssetRow;
        Insert: Optional<
          AssetRow,
          "id" | "post_id" | "r2_upload_id" | "size_bytes" | "upload_status" | "position" | "created_at" | "completed_at"
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
          {
            foreignKeyName: "assets_post_fk";
            columns: ["creator_id", "project_id", "post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["creator_id", "project_id", "id"];
          },
        ];
      };
      gallery_leads: {
        Row: GalleryLeadRow;
        Insert: Optional<GalleryLeadRow, "id" | "project_id" | "marketing_consent" | "consent_at" | "visits" | "created_at" | "last_visit_at">;
        Update: Partial<GalleryLeadRow>;
        Relationships: [
          {
            foreignKeyName: "gallery_leads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_events: {
        Row: StripeEventRow;
        Insert: Optional<StripeEventRow, "received_at" | "processed_at">;
        Update: Partial<StripeEventRow>;
        Relationships: [];
      };
      print_products: {
        Row: PrintProductRow;
        Insert: Optional<
          PrintProductRow,
          "id" | "width_in" | "height_in" | "selections" | "resolution" | "description" | "sort" | "active" | "synced_at" | "created_at"
        >;
        Update: Partial<PrintProductRow>;
        Relationships: [];
      };
      creator_product_prices: {
        Row: CreatorProductPriceRow;
        Insert: Optional<CreatorProductPriceRow, "markup_percent" | "enabled" | "updated_at">;
        Update: Partial<CreatorProductPriceRow>;
        Relationships: [];
      };
      print_orders: {
        Row: PrintOrderRow;
        Insert: Optional<
          PrintOrderRow,
          | "id"
          | "project_id"
          | "buyer_user_id"
          | "status"
          | "tax_cents"
          | "total_cents"
          | "platform_fee_cents"
          | "processing_fee_cents"
          | "creator_earnings_cents"
          | "stripe_checkout_session_id"
          | "stripe_payment_intent_id"
          | "stripe_charge_id"
          | "stripe_transfer_id"
          | "lab_submission_id"
          | "lab_confirmation_ids"
          | "tracking"
          | "failure_reason"
          | "paid_at"
          | "submitted_at"
          | "shipped_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<PrintOrderRow>;
        Relationships: [
          {
            foreignKeyName: "print_orders_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      print_order_items: {
        Row: PrintOrderItemRow;
        Insert: Optional<PrintOrderItemRow, "id" | "product_id" | "asset_id" | "lab_configured_product_id" | "created_at">;
        Update: Partial<PrintOrderItemRow>;
        Relationships: [
          {
            foreignKeyName: "print_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "print_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      lab_events: {
        Row: LabEventRow;
        Insert: Optional<LabEventRow, "received_at" | "processed_at">;
        Update: Partial<LabEventRow>;
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
      register_gallery_lead: {
        Args: { p_token: string; p_first_name: string; p_last_name: string; p_email: string; p_consent: boolean };
        Returns: { lead_id: string; project_id: string }[];
      };
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
          p_post_id?: string | null;
        };
        Returns: AssetRow;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
