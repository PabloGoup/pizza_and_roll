import { getSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import type { CheckoutPayload, PosCartItem } from "@/types/domain";

type StorefrontOrderRpcResponse = {
  orderId: string;
  number: string;
  total: number;
  estimatedReadyAt: string | null;
  customerId: string | null;
};

type StorefrontCustomerProfileRpcResponse = {
  customer: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  addresses: Array<{
    id: string;
    label: string;
    street: string;
    district: string;
    reference?: string | null;
    isDefault?: boolean;
  }>;
  recentOrders: Array<{
    id: string;
    number: string;
    createdAt: string;
    total: number;
    type: "consumo_local" | "retiro_local" | "despacho";
    itemsSummary: string[];
  }>;
  recommendedProducts: Array<{
    productId: string;
    productName: string;
    categoryName: string;
    imageUrl?: string | null;
    unitPrice: number;
    orderCount: number;
    lastOrderedAt?: string | null;
  }>;
};

export type StorefrontOrderResult = StorefrontOrderRpcResponse;
export type StorefrontCustomerProfile = StorefrontCustomerProfileRpcResponse;

export type StorefrontWhatsAppHandoff = {
  ok: boolean;
  handoffStatus?: "esperando_whatsapp" | "confirmado" | "expirado";
  order?: {
    id: string;
    number: string;
    status: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado";
    kitchenStatus?: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado" | null;
    type: "retiro_local" | "despacho";
    total: number;
    estimatedReadyAt?: string | null;
    createdAt: string;
  } | null;
};

export const storefrontOrderService = {
  async createOrder(cart: PosCartItem[], payload: CheckoutPayload) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("create_storefront_order", {
      payload: {
        cart,
        checkout: payload,
      } as unknown as Json,
    });

    if (error) {
      throw new Error(error.message || "No se pudo registrar el pedido online.");
    }

    return data as StorefrontOrderResult;
  },

  async getCustomerProfile(phone: string) {
    const normalizedPhone = phone.replace(/\D/g, "");

    if (normalizedPhone.length < 8) {
      return null;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_storefront_customer_profile", {
      customer_phone: normalizedPhone,
    });

    if (error) {
      throw new Error(error.message || "No se pudo cargar el historial del cliente.");
    }

    const response = data as StorefrontCustomerProfile | null;
    return response?.customer ? response : null;
  },

  async createWhatsAppHandoff(token: string, phone: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc("create_storefront_whatsapp_handoff", {
      p_token: token,
      p_customer_phone: phone,
    });
    if (error) throw new Error("No se pudo preparar el seguimiento por WhatsApp.");
  },

  async getWhatsAppHandoff(token: string, phone: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_storefront_whatsapp_handoff", {
      p_token: token,
      p_customer_phone: phone,
    });
    if (error) throw new Error("No se pudo consultar el seguimiento del pedido.");
    return data as unknown as StorefrontWhatsAppHandoff;
  },
};
