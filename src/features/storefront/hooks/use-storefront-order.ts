import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storefrontOrderService } from "@/features/storefront/services/storefront-order-service";
import type { CheckoutPayload, PosCartItem } from "@/types/domain";

const storefrontOrderKeys = {
  customerProfile: (phone: string) => ["storefront", "customer-profile", phone] as const,
  whatsappHandoff: (token: string, phone: string) =>
    ["storefront", "whatsapp-handoff", token, phone] as const,
};

export function useCreateStorefrontOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cart, payload }: { cart: PosCartItem[]; payload: CheckoutPayload }) =>
      storefrontOrderService.createOrder(cart, payload),
    onSuccess: async (_, variables) => {
      const normalizedPhone = variables.payload.customerPhone?.replace(/\D/g, "");

      if (normalizedPhone) {
        await queryClient.invalidateQueries({
          queryKey: storefrontOrderKeys.customerProfile(normalizedPhone),
        });
      }
    },
  });
}

export function useStorefrontCustomerProfile(phone: string) {
  const normalizedPhone = phone.replace(/\D/g, "");

  return useQuery({
    queryKey: storefrontOrderKeys.customerProfile(normalizedPhone),
    queryFn: () => storefrontOrderService.getCustomerProfile(normalizedPhone),
    enabled: normalizedPhone.length >= 8,
  });
}

export function useStorefrontWhatsAppHandoff(token: string, phone: string) {
  return useQuery({
    queryKey: storefrontOrderKeys.whatsappHandoff(token, phone),
    queryFn: () => storefrontOrderService.getWhatsAppHandoff(token, phone),
    enabled: Boolean(token && phone),
    refetchInterval: (query) =>
      query.state.data?.order &&
      ["entregado", "cancelado"].includes(query.state.data.order.status)
        ? false
        : 5_000,
  });
}
