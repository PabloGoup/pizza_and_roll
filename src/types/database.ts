export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: "administrador" | "cajero" | "cocina" | "cliente";
          is_active: boolean;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: "administrador" | "cajero" | "cocina" | "cliente";
          is_active?: boolean;
          avatar_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          module: string;
          action: string;
          detail: string;
          performed_by: string | null;
          previous_value: Json | null;
          new_value: Json | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          module: string;
          action: string;
          detail: string;
          performed_by?: string | null;
          previous_value?: Json | null;
          new_value?: Json | null;
          reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          name: string;
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["product_categories"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string;
          sort_order: number;
          name: string;
          description: string;
          image_url: string | null;
          base_price: number;
          cost: number;
          is_favorite: boolean;
          is_sold_out: boolean;
          status: "activo" | "inactivo";
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          sort_order?: number;
          name: string;
          description?: string;
          image_url?: string | null;
          base_price: number;
          cost: number;
          is_favorite?: boolean;
          is_sold_out?: boolean;
          status?: "activo" | "inactivo";
          tags?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          sku: string | null;
          price: number;
          cost: number;
          is_default: boolean;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          sku?: string | null;
          price: number;
          cost: number;
          is_default?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["product_variants"]["Insert"]>;
        Relationships: [];
      };
      product_modifier_groups: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          min_select: number;
          max_select: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          min_select?: number;
          max_select?: number;
        };
        Update: Partial<Database["public"]["Tables"]["product_modifier_groups"]["Insert"]>;
        Relationships: [];
      };
      product_modifiers: {
        Row: {
          id: string;
          modifier_group_id: string;
          name: string;
          price_delta: number;
          default_included: boolean;
        };
        Insert: {
          id?: string;
          modifier_group_id: string;
          name: string;
          price_delta?: number;
          default_included?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["product_modifiers"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string;
          label: string;
          street: string;
          district: string;
          reference: string | null;
          is_default: boolean;
        };
        Insert: {
          id?: string;
          customer_id: string;
          label?: string;
          street: string;
          district: string;
          reference?: string | null;
          is_default?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["customer_addresses"]["Insert"]>;
        Relationships: [];
      };
      promotions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          type: "combo" | "porcentaje" | "monto_fijo" | "horario" | "cantidad" | "combinada";
          value: number;
          start_at: string | null;
          end_at: string | null;
          is_active: boolean;
          rules: Json;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          type: "combo" | "porcentaje" | "monto_fijo" | "horario" | "cantidad" | "combinada";
          value?: number;
          start_at?: string | null;
          end_at?: string | null;
          is_active?: boolean;
          rules?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["promotions"]["Insert"]>;
        Relationships: [];
      };
      store_settings: {
        Row: {
          id: string;
          store_name: string;
          support_phone: string | null;
          is_store_open: boolean;
          pickup_base_minutes: number;
          delivery_base_minutes: number;
          per_pending_order_minutes: number;
          high_load_threshold: number;
          currency_code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_name?: string;
          support_phone?: string | null;
          is_store_open?: boolean;
          pickup_base_minutes?: number;
          delivery_base_minutes?: number;
          per_pending_order_minutes?: number;
          high_load_threshold?: number;
          currency_code?: string;
        };
        Update: Partial<Database["public"]["Tables"]["store_settings"]["Insert"]>;
        Relationships: [];
      };
      delivery_zones: {
        Row: {
          id: string;
          name: string;
          district: string;
          fee: number;
          base_minutes: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          district: string;
          fee?: number;
          base_minutes?: number;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_zones"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          number: string;
          source: "pos" | "web" | "whatsapp";
          type: "consumo_local" | "retiro_local" | "despacho";
          status: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado";
          payment_method: "efectivo" | "tarjeta" | "transferencia" | "mixto";
          subtotal: number;
          discount_amount: number;
          promotion_amount: number;
          delivery_fee: number;
          tip_amount: number;
          extra_charges: Json;
          total: number;
          notes: string | null;
          cashier_id: string | null;
          customer_id: string | null;
          delivery_address_id: string | null;
          estimated_ready_at: string | null;
          customer_phone_snapshot: string | null;
          customer_name_snapshot: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          number?: string;
          source?: "pos" | "web" | "whatsapp";
          type: "consumo_local" | "retiro_local" | "despacho";
          status?: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado";
          payment_method: "efectivo" | "tarjeta" | "transferencia" | "mixto";
          subtotal: number;
          discount_amount?: number;
          promotion_amount?: number;
          delivery_fee?: number;
          tip_amount?: number;
          extra_charges?: Json;
          total: number;
          notes?: string | null;
          cashier_id?: string | null;
          customer_id?: string | null;
          delivery_address_id?: string | null;
          estimated_ready_at?: string | null;
          customer_phone_snapshot?: string | null;
          customer_name_snapshot?: string | null;
          cancellation_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_payments: {
        Row: {
          id: string;
          order_id: string;
          method: "efectivo" | "tarjeta" | "transferencia" | "mixto";
          amount: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          method: "efectivo" | "tarjeta" | "transferencia" | "mixto";
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["order_payments"]["Insert"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          unit_price: number;
          subtotal: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          variant_id?: string | null;
          quantity: number;
          unit_price: number;
          subtotal: number;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
        Relationships: [];
      };
      order_item_modifiers: {
        Row: {
          id: string;
          order_item_id: string;
          modifier_id: string | null;
          modifier_name_snapshot: string;
          price_delta: number;
        };
        Insert: {
          id?: string;
          order_item_id: string;
          modifier_id?: string | null;
          modifier_name_snapshot: string;
          price_delta?: number;
        };
        Update: Partial<Database["public"]["Tables"]["order_item_modifiers"]["Insert"]>;
        Relationships: [];
      };
      kitchen_tickets: {
        Row: {
          id: string;
          order_id: string;
          status: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado";
          printed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status?: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado";
          printed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kitchen_tickets"]["Insert"]>;
        Relationships: [];
      };
      print_agents: {
        Row: {
          id: string;
          name: string;
          token_hash: string;
          is_active: boolean;
          last_seen_at: string | null;
          platform: string | null;
          hostname: string | null;
          printer_name: string | null;
          available_printers: Json;
          paper_width: number;
          characters_per_line: number;
          font_size: "compact" | "normal" | "large";
          feed_lines: number;
          config_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          token_hash: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          platform?: string | null;
          hostname?: string | null;
          printer_name?: string | null;
          available_printers?: Json;
          paper_width?: number;
          characters_per_line?: number;
          font_size?: "compact" | "normal" | "large";
          feed_lines?: number;
          config_version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["print_agents"]["Insert"]>;
        Relationships: [];
      };
      print_agent_pairings: {
        Row: {
          id: string;
          agent_name: string;
          code_hash: string;
          expires_at: string;
          claimed_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_name: string;
          code_hash: string;
          expires_at: string;
          claimed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["print_agent_pairings"]["Insert"]>;
        Relationships: [];
      };
      print_jobs: {
        Row: {
          id: string;
          order_id: string;
          job_type: "new" | "revision" | "reprint";
          status: "pending" | "processing" | "printed" | "failed";
          dedupe_key: string;
          attempts: number;
          max_attempts: number;
          available_at: string;
          locked_at: string | null;
          locked_by: string | null;
          printed_at: string | null;
          last_error: string | null;
          target_agent_id: string | null;
          requested_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          job_type: "new" | "revision" | "reprint";
          status?: "pending" | "processing" | "printed" | "failed";
          dedupe_key: string;
          attempts?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          printed_at?: string | null;
          last_error?: string | null;
          target_agent_id?: string | null;
          requested_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["print_jobs"]["Insert"]>;
        Relationships: [];
      };
      dispatch_orders: {
        Row: {
          id: string;
          order_id: string;
          status: "pendiente" | "en_preparacion" | "en_ruta" | "entregado" | "cancelado";
          contact_name: string | null;
          contact_phone: string | null;
          delivery_fee: number;
          estimated_delivery_at: string | null;
          zone_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status?: "pendiente" | "en_preparacion" | "en_ruta" | "entregado" | "cancelado";
          contact_name?: string | null;
          contact_phone?: string | null;
          delivery_fee?: number;
          estimated_delivery_at?: string | null;
          zone_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["dispatch_orders"]["Insert"]>;
        Relationships: [];
      };
      cash_sessions: {
        Row: {
          id: string;
          cashier_id: string;
          opening_amount: number;
          expected_amount: number;
          expected_cash_sales_amount: number;
          expected_card_amount: number;
          expected_transfer_amount: number;
          counted_amount: number | null;
          counted_card_amount: number | null;
          counted_transfer_amount: number | null;
          difference_amount: number | null;
          difference_card_amount: number | null;
          difference_transfer_amount: number | null;
          notes: string | null;
          status: "abierta" | "cerrada";
          opened_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          cashier_id: string;
          opening_amount: number;
          expected_amount?: number;
          expected_cash_sales_amount?: number;
          expected_card_amount?: number;
          expected_transfer_amount?: number;
          counted_amount?: number | null;
          counted_card_amount?: number | null;
          counted_transfer_amount?: number | null;
          difference_amount?: number | null;
          difference_card_amount?: number | null;
          difference_transfer_amount?: number | null;
          notes?: string | null;
          status?: "abierta" | "cerrada";
          opened_at?: string;
          closed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cash_sessions"]["Insert"]>;
        Relationships: [];
      };
      cash_movements: {
        Row: {
          id: string;
          session_id: string;
          type: "apertura" | "ingreso" | "retiro" | "anulacion" | "diferencia" | "cierre";
          amount: number;
          reason: string;
          performed_by: string;
          linked_order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          type: "apertura" | "ingreso" | "retiro" | "anulacion" | "diferencia" | "cierre";
          amount: number;
          reason: string;
          performed_by: string;
          linked_order_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cash_movements"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_storefront_order: {
        Args: {
          payload: Json;
        };
        Returns: Json;
      };
      get_storefront_customer_profile: {
        Args: {
          customer_phone: string;
        };
        Returns: Json;
      };
      get_storefront_eta: {
        Args: {
          p_order_type?: "consumo_local" | "retiro_local" | "despacho";
          p_district?: string | null;
        };
        Returns: Json;
      };
      start_kitchen_ticket: {
        Args: { p_ticket_id: string };
        Returns: undefined;
      };
      complete_kitchen_ticket: {
        Args: { p_ticket_id: string };
        Returns: undefined;
      };
      enqueue_kitchen_print: {
        Args: {
          p_order_id: string;
          p_job_type: "new" | "revision" | "reprint";
          p_dedupe_key?: string | null;
          p_agent_id?: string | null;
        };
        Returns: string;
      };
      create_print_agent: {
        Args: { p_name: string };
        Returns: Json;
      };
      create_print_agent_pairing: {
        Args: { p_name: string };
        Returns: Json;
      };
      claim_print_agent_pairing: {
        Args: {
          p_code: string;
          p_hostname: string;
          p_platform: string;
        };
        Returns: Json;
      };
      claim_print_jobs: {
        Args: {
          p_agent_name: string;
          p_agent_token: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      complete_print_job: {
        Args: {
          p_agent_name: string;
          p_agent_token: string;
          p_job_id: string;
        };
        Returns: undefined;
      };
      fail_print_job: {
        Args: {
          p_agent_name: string;
          p_agent_token: string;
          p_job_id: string;
          p_error: string;
        };
        Returns: undefined;
      };
      report_print_agent: {
        Args: {
          p_agent_name: string;
          p_agent_token: string;
          p_platform: string;
          p_hostname: string;
          p_preferred_printer: string;
          p_available_printers: Json;
        };
        Returns: Json;
      };
      get_print_control_panel: {
        Args: Record<string, never>;
        Returns: Json;
      };
      update_print_agent_settings: {
        Args: {
          p_agent_id: string;
          p_printer_name: string;
          p_paper_width: number;
          p_characters_per_line: number;
          p_font_size: "compact" | "normal" | "large";
          p_feed_lines: number;
          p_is_active: boolean;
        };
        Returns: undefined;
      };
      deactivate_print_agent: {
        Args: { p_agent_id: string };
        Returns: undefined;
      };
      create_storefront_whatsapp_handoff: {
        Args: { p_token: string; p_customer_phone: string };
        Returns: Json;
      };
      complete_storefront_whatsapp_handoff: {
        Args: { p_token: string; p_order_id: string; p_customer_phone: string };
        Returns: Json;
      };
      get_storefront_whatsapp_handoff: {
        Args: { p_token: string; p_customer_phone: string };
        Returns: Json;
      };
      set_product_favorite: {
        Args: { p_product_id: string; p_is_favorite: boolean };
        Returns: undefined;
      };
      get_storefront_availability: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_operational_availability: {
        Args: Record<string, never>;
        Returns: Json;
      };
      set_product_sold_out: {
        Args: { p_product_id: string; p_is_sold_out: boolean };
        Returns: undefined;
      };
      set_ingredient_sold_out: {
        Args: { p_ingredient_id: string; p_is_sold_out: boolean };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
