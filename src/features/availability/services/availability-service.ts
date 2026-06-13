import { getSupabaseClient } from "@/lib/supabase/client";

export interface ProductAvailability {
  productId: string;
  isSoldOut: boolean;
  unavailableIngredients: Array<{ id: string; name: string }>;
}

export interface OperationalAvailability {
  products: Array<{
    id: string;
    name: string;
    categoryName: string;
    isSoldOut: boolean;
  }>;
  ingredients: Array<{
    id: string;
    name: string;
    unit: string;
    isSoldOut: boolean;
    affectedProducts: Array<{ id: string; name: string }>;
  }>;
}

export const availabilityService = {
  async getStorefront(): Promise<ProductAvailability[]> {
    const { data, error } = await getSupabaseClient().rpc("get_storefront_availability");
    if (error) throw new Error("No se pudo consultar la disponibilidad.");
    return (data ?? []) as unknown as ProductAvailability[];
  },

  async getOperational(): Promise<OperationalAvailability> {
    const { data, error } = await getSupabaseClient().rpc("get_operational_availability");
    if (error) throw new Error("No se pudo consultar la disponibilidad operativa.");
    return data as unknown as OperationalAvailability;
  },

  async setProduct(id: string, isSoldOut: boolean) {
    const { error } = await getSupabaseClient().rpc("set_product_sold_out", {
      p_product_id: id,
      p_is_sold_out: isSoldOut,
    });
    if (error) throw new Error(error.message);
  },

  async setIngredient(id: string, isSoldOut: boolean) {
    const { error } = await getSupabaseClient().rpc("set_ingredient_sold_out", {
      p_ingredient_id: id,
      p_is_sold_out: isSoldOut,
    });
    if (error) throw new Error(error.message);
  },
};
