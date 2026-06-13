import { useQuery } from "@tanstack/react-query";

import { storefrontService } from "@/features/storefront/services/storefront-service";

const storefrontKeys = {
  settings: ["storefront", "settings"] as const,
  deliveryZones: ["storefront", "delivery-zones"] as const,
  promotions: ["storefront", "promotions"] as const,
  eta: (orderType: string, district: string) =>
    ["storefront", "eta", orderType, district] as const,
};

export function useStoreSettings() {
  return useQuery({
    queryKey: storefrontKeys.settings,
    queryFn: storefrontService.getStoreSettings,
  });
}

export function useDeliveryZones() {
  return useQuery({
    queryKey: storefrontKeys.deliveryZones,
    queryFn: storefrontService.listDeliveryZones,
  });
}

export function useStorefrontPromotions() {
  return useQuery({
    queryKey: storefrontKeys.promotions,
    queryFn: storefrontService.listPromotions,
  });
}

export function useStorefrontEta(
  orderType: "retiro_local" | "despacho",
  district = "",
) {
  return useQuery({
    queryKey: storefrontKeys.eta(orderType, district),
    queryFn: () => storefrontService.getEta(orderType, district || null),
    refetchInterval: 30_000,
  });
}
