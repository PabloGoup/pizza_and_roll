import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { DeliveryZone, Promotion, StoreSettings } from "@/types/domain";

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: "storefront-default",
  storeName: "P&R_ventas",
  supportPhone: null,
  isStoreOpen: true,
  pickupBaseMinutes: 20,
  deliveryBaseMinutes: 35,
  perPendingOrderMinutes: 3,
  highLoadThreshold: 5,
  currencyCode: "CLP",
  createdAt: "",
  updatedAt: "",
};

function mapStoreSettings(
  row: Database["public"]["Tables"]["store_settings"]["Row"],
): StoreSettings {
  return {
    id: row.id,
    storeName: row.store_name,
    supportPhone: row.support_phone,
    isStoreOpen: row.is_store_open,
    pickupBaseMinutes: row.pickup_base_minutes,
    deliveryBaseMinutes: row.delivery_base_minutes,
    perPendingOrderMinutes: row.per_pending_order_minutes,
    highLoadThreshold: row.high_load_threshold,
    currencyCode: row.currency_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeliveryZone(
  row: Database["public"]["Tables"]["delivery_zones"]["Row"],
): DeliveryZone {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    fee: row.fee,
    baseMinutes: row.base_minutes,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPromotion(row: Database["public"]["Tables"]["promotions"]["Row"]): Promotion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    value: row.value,
    startAt: row.start_at,
    endAt: row.end_at,
    isActive: row.is_active,
    rules:
      row.rules && typeof row.rules === "object" && !Array.isArray(row.rules)
        ? row.rules
        : {},
  };
}

export const storefrontService = {
  async getStoreSettings() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error("No se pudieron cargar los ajustes públicos de la tienda.");
    }

    return data ? mapStoreSettings(data) : DEFAULT_STORE_SETTINGS;
  },

  async listDeliveryZones() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("district", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new Error("No se pudieron cargar las zonas de despacho.");
    }

    return data.map(mapDeliveryZone);
  },

  async listPromotions() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("is_active", true)
      .order("start_at", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      throw new Error("No se pudieron cargar las promociones activas.");
    }

    return data.map(mapPromotion);
  },
};
